// ===== CHECK-IN SYSTEM =====

async function checkIn(eventType, eventId = null) {
  if (!currentProfile) return;

  // Check if already checked in today for this event type
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabaseClient
    .from('check_ins')
    .select('id')
    .eq('user_id', currentProfile.id)
    .eq('event_type', eventType)
    .gte('checked_in_at', today + 'T00:00:00')
    .lte('checked_in_at', today + 'T23:59:59')
    .maybeSingle();

  if (existing) {
    showToast("You're already locked in for this one! See you out there.", 'info');
    return null;
  }

  const { data, error } = await supabaseClient
    .from('check_ins')
    .insert({
      user_id: currentProfile.id,
      event_type: eventType,
      event_id: eventId,
      checked_in_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    showToast('Check-in didn\'t go through — try again.', 'error');
    throw error;
  }

  showToast("YOU'RE LOCKED IN! Time to run it up!", 'success');

  // Check for new badges after check-in
  await checkAndAwardBadges();

  return data;
}

async function logMiles(checkInId, miles) {
  const { error } = await supabaseClient
    .from('check_ins')
    .update({ miles })
    .eq('id', checkInId);

  if (error) {
    showToast('Miles didn\'t save — try again.', 'error');
    return;
  }
  showToast(`${miles} miles in the books! Keep stacking!`, 'success');

  // Re-check badges (Century Club depends on miles)
  await checkAndAwardBadges();
}

async function getCheckInCountForEvent(eventType, daysBack = 7) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { count } = await supabaseClient
    .from('check_ins')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('checked_in_at', since.toISOString());

  return count || 0;
}

async function hasCheckedInToday(eventType) {
  if (!currentProfile) return false;
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabaseClient
    .from('check_ins')
    .select('id')
    .eq('user_id', currentProfile.id)
    .eq('event_type', eventType)
    .gte('checked_in_at', today + 'T00:00:00')
    .lte('checked_in_at', today + 'T23:59:59')
    .maybeSingle();
  return !!data;
}

async function getUserCheckIns(userId) {
  const { data } = await supabaseClient
    .from('check_ins')
    .select('*')
    .eq('user_id', userId)
    .order('checked_in_at', { ascending: false });
  return data || [];
}

async function getUserStats(userId) {
  const checkIns = await getUserCheckIns(userId);

  const totalCheckIns = checkIns.length;
  const totalMiles = checkIns.reduce((sum, c) => sum + (c.miles || 0), 0);
  const streak = calculateStreak(checkIns);
  const weekHistory = getWeekHistory(checkIns, 8);

  return { totalCheckIns, totalMiles, streak, weekHistory, checkIns };
}

function calculateStreak(checkIns) {
  if (checkIns.length === 0) return 0;

  // Group check-ins by week (Mon-Sun)
  const weeks = new Map();
  checkIns.forEach(ci => {
    const date = new Date(ci.checked_in_at);
    const weekStart = getWeekStart(date);
    const key = weekStart.toISOString().split('T')[0];
    weeks.set(key, true);
  });

  // Count consecutive weeks from current week backwards
  let streak = 0;
  const now = new Date();
  let weekStart = getWeekStart(now);

  while (true) {
    const key = weekStart.toISOString().split('T')[0];
    if (weeks.has(key)) {
      streak++;
      weekStart.setDate(weekStart.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekHistory(checkIns, numWeeks) {
  const history = [];
  const now = new Date();

  for (let i = 0; i < numWeeks; i++) {
    const weekStart = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const attended = checkIns.some(ci => {
      const d = new Date(ci.checked_in_at);
      return d >= weekStart && d < weekEnd;
    });

    history.unshift(attended); // oldest first
  }

  return history;
}

// ===== MILES SLIDER MODAL =====
function showMilesSlider(checkInId) {
  const overlay = document.createElement('div');
  overlay.className = 'miles-overlay';
  overlay.innerHTML = `
    <div class="miles-modal card">
      <h3>How Far Did You Run?</h3>
      <p style="color: var(--color-text-muted); margin-bottom: var(--space-lg);">Optional — tap skip if you don't know</p>
      <div class="miles-options">
        <button class="miles-btn" data-miles="1">1 mi</button>
        <button class="miles-btn" data-miles="2">2 mi</button>
        <button class="miles-btn" data-miles="3">3 mi</button>
        <button class="miles-btn" data-miles="4">4 mi</button>
        <button class="miles-btn" data-miles="5">5+ mi</button>
      </div>
      <button class="btn-secondary btn-sm" style="margin-top: var(--space-md);" onclick="closeMilesSlider()">Skip</button>
    </div>
  `;

  overlay.querySelectorAll('.miles-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const miles = parseFloat(btn.dataset.miles);
      await logMiles(checkInId, miles);
      closeMilesSlider();
      if (typeof refreshHome === 'function') refreshHome();
      if (typeof refreshStats === 'function') refreshStats();
    });
  });

  document.body.appendChild(overlay);
}

function closeMilesSlider() {
  document.querySelector('.miles-overlay')?.remove();
  // Show shareable check-in card after miles slider closes
  showCheckInCard();
}

// ===== SHAREABLE CHECK-IN CARD =====
async function showCheckInCard() {
  if (!currentProfile) return;

  const stats = await getUserStats(currentProfile.id);
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  // Find which run this is
  const runInfo = WEEKLY_RUNS.find(r => r.dayOfWeek === now.getDay());
  const location = runInfo ? runInfo.location : 'Run It UP!';

  const paceLabel = PACE_GROUPS[currentProfile.pace_group]?.label || 'Runner';

  const overlay = document.createElement('div');
  overlay.className = 'checkin-card-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="checkin-card-modal">
      <div class="checkin-card" id="checkin-card-canvas">
        <div class="checkin-card-bg"></div>
        <div class="checkin-card-content">
          <img src="./assets/logo.png" class="checkin-card-logo" alt="RIU">
          <div class="checkin-card-locked">LOCKED IN</div>
          <div class="checkin-card-day">${dayName.toUpperCase()}</div>
          <div class="checkin-card-location">${location}</div>
          <div class="checkin-card-date">${dateStr}</div>
          <div class="checkin-card-stats">
            <div class="checkin-card-stat">
              <div class="checkin-card-stat-value">${stats.streak}</div>
              <div class="checkin-card-stat-label">Week Streak</div>
            </div>
            <div class="checkin-card-stat">
              <div class="checkin-card-stat-value">${stats.totalCheckIns}</div>
              <div class="checkin-card-stat-label">Check-ins</div>
            </div>
            <div class="checkin-card-stat">
              <div class="checkin-card-stat-value">${stats.totalMiles.toFixed(1)}</div>
              <div class="checkin-card-stat-label">Miles</div>
            </div>
          </div>
          <div class="checkin-card-name">${escapeHtml(currentProfile.display_name)}</div>
          <div class="checkin-card-pace">${paceLabel}</div>
        </div>
      </div>
      <div class="checkin-card-actions">
        <button class="btn-primary" onclick="shareCheckInCard()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          Share to Stories
        </button>
        <button class="btn-secondary btn-sm" onclick="this.closest('.checkin-card-overlay').remove()">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

async function shareCheckInCard() {
  const card = document.getElementById('checkin-card-canvas');
  if (!card) return;

  try {
    // Use html2canvas-style approach with Canvas API
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    const stats = await getUserStats(currentProfile.id);
    const now = new Date();
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const runInfo = WEEKLY_RUNS.find(r => r.dayOfWeek === now.getDay());
    const location = runInfo ? runInfo.location : 'Run It UP!';
    const paceLabel = PACE_GROUPS[currentProfile.pace_group]?.label || 'Runner';

    // Background
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, 1080, 1920);

    // Subtle gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, 'rgba(191, 255, 0, 0.08)');
    grad.addColorStop(0.5, 'rgba(10, 10, 10, 1)');
    grad.addColorStop(1, 'rgba(191, 255, 0, 0.05)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    // "LOCKED IN" text
    ctx.fillStyle = '#BFFF00';
    ctx.font = '900 120px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOCKED IN', 540, 480);

    // Day
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 72px "Arial Black", Impact, sans-serif';
    ctx.fillText(dayNames[now.getDay()], 540, 620);

    // Location
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 48px Arial, sans-serif';
    ctx.fillText(location, 540, 700);

    // Date
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '400 36px Arial, sans-serif';
    ctx.fillText(`${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`, 540, 770);

    // Divider line
    ctx.strokeStyle = '#BFFF00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(340, 830);
    ctx.lineTo(740, 830);
    ctx.stroke();

    // Stats row
    const statY = 950;
    const statLabels = ['Week Streak', 'Check-ins', 'Miles'];
    const statValues = [stats.streak.toString(), stats.totalCheckIns.toString(), stats.totalMiles.toFixed(1)];
    const statX = [270, 540, 810];

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#BFFF00';
      ctx.font = '900 80px "Arial Black", Impact, sans-serif';
      ctx.fillText(statValues[i], statX[i], statY);

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '500 28px Arial, sans-serif';
      ctx.fillText(statLabels[i], statX[i], statY + 45);
    }

    // Runner name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 44px Arial, sans-serif';
    ctx.fillText(currentProfile.display_name, 540, 1150);

    // Pace group
    ctx.fillStyle = '#BFFF00';
    ctx.font = '600 32px Arial, sans-serif';
    ctx.fillText(paceLabel, 540, 1210);

    // RIU branding at bottom
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '600 28px Arial, sans-serif';
    ctx.fillText('RUN IT UP! DALLAS', 540, 1750);
    ctx.font = '400 22px Arial, sans-serif';
    ctx.fillText('@runitupdallas', 540, 1790);

    // Convert to blob and share
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast('Could not generate image — try again.', 'error');
        return;
      }

      const file = new File([blob], 'runitup-checkin.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Run It UP! Dallas',
            text: `LOCKED IN at ${location}! ${stats.streak}-week streak. #RunItUpDallas`,
            files: [file]
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            downloadCheckInCard(canvas);
          }
        }
      } else {
        downloadCheckInCard(canvas);
      }
    }, 'image/png');
  } catch (err) {
    showToast('Could not share — try saving a screenshot instead.', 'error');
  }
}

function downloadCheckInCard(canvas) {
  const link = document.createElement('a');
  link.download = 'runitup-checkin.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Card saved — post it to your stories!', 'success');
}

// ===== BADGE SYSTEM =====
const BADGE_DEFINITIONS = [
  { type: 'first_step', label: 'First Step', description: 'First check-in', icon: 'FS' },
  { type: 'early_bird', label: 'Early Bird', description: '5 Saturday morning runs', icon: 'EB' },
  { type: 'night_runner', label: 'Night Runner', description: '5 Tuesday evening runs', icon: 'NR' },
  { type: 'streak_week', label: 'Streak Week', description: '4-week attendance streak', icon: '4W' },
  { type: 'on_fire', label: 'On Fire', description: '12-week attendance streak', icon: 'OF' },
  { type: 'century_club', label: 'Century Club', description: '100 total miles', icon: 'CC' },
  { type: 'run_buddy', label: 'Run Buddy', description: 'Used buddy feature 3 times', icon: 'RB' },
  { type: 'day_one', label: 'Day One', description: 'Attended a special event', icon: 'D1' },
  { type: 'both_sides', label: 'Both Sides', description: 'Tuesday + Saturday same week', icon: 'BS' },
  { type: 'social_butterfly', label: 'Social Butterfly', description: 'Sent 50 messages', icon: 'SB' }
];

async function checkAndAwardBadges() {
  if (!currentProfile) return;
  const userId = currentProfile.id;

  // Get existing badges
  const { data: existingBadges } = await supabaseClient
    .from('badges')
    .select('badge_type')
    .eq('user_id', userId);
  const earned = new Set((existingBadges || []).map(b => b.badge_type));

  // Get check-ins
  const checkIns = await getUserCheckIns(userId);
  const stats = { totalCheckIns: checkIns.length, totalMiles: 0, streak: 0 };
  stats.totalMiles = checkIns.reduce((s, c) => s + (c.miles || 0), 0);
  stats.streak = calculateStreak(checkIns);

  const tuesdayCount = checkIns.filter(c => c.event_type === 'weekly_tuesday').length;
  const saturdayCount = checkIns.filter(c => c.event_type === 'weekly_saturday').length;
  const specialCount = checkIns.filter(c => c.event_type === 'special').length;

  // Check for both_sides (same week)
  let hasBothSides = false;
  const weekMap = new Map();
  checkIns.forEach(ci => {
    const weekKey = getWeekStart(new Date(ci.checked_in_at)).toISOString().split('T')[0];
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Set());
    weekMap.get(weekKey).add(ci.event_type);
  });
  for (const types of weekMap.values()) {
    if (types.has('weekly_tuesday') && types.has('weekly_saturday')) {
      hasBothSides = true;
      break;
    }
  }

  // Get buddy match count
  const { count: buddyCount } = await supabaseClient
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('matched_with', 'is', null);

  // Get message count
  const { count: msgCount } = await supabaseClient
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Award badges
  const toAward = [];
  if (!earned.has('first_step') && stats.totalCheckIns >= 1) toAward.push('first_step');
  if (!earned.has('early_bird') && saturdayCount >= 5) toAward.push('early_bird');
  if (!earned.has('night_runner') && tuesdayCount >= 5) toAward.push('night_runner');
  if (!earned.has('streak_week') && stats.streak >= 4) toAward.push('streak_week');
  if (!earned.has('on_fire') && stats.streak >= 12) toAward.push('on_fire');
  if (!earned.has('century_club') && stats.totalMiles >= 100) toAward.push('century_club');
  if (!earned.has('run_buddy') && (buddyCount || 0) >= 3) toAward.push('run_buddy');
  if (!earned.has('day_one') && specialCount >= 1) toAward.push('day_one');
  if (!earned.has('both_sides') && hasBothSides) toAward.push('both_sides');
  if (!earned.has('social_butterfly') && (msgCount || 0) >= 50) toAward.push('social_butterfly');

  for (const badgeType of toAward) {
    await supabaseClient.from('badges').insert({ user_id: userId, badge_type: badgeType });
    const def = BADGE_DEFINITIONS.find(b => b.type === badgeType);
    if (def) showToast(`NEW BADGE UNLOCKED: ${def.label}!`, 'success');
  }
}

async function getUserBadges(userId) {
  const { data } = await supabaseClient
    .from('badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  return data || [];
}

async function getPinnedBadges(userId) {
  const { data } = await supabaseClient
    .from('pinned_badges')
    .select('*, badges(*)')
    .eq('user_id', userId)
    .order('slot');
  return data || [];
}
