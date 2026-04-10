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

// Helper: load an image, resolving with null on error (graceful degradation)
function loadImageSafe(src, crossOrigin = null) {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Helper: load Big Shoulders Display via FontFace API (graceful on error)
async function loadBigShouldersFont() {
  if (typeof FontFace === 'undefined' || !document.fonts) return false;
  try {
    // Check if already loaded
    if (document.fonts.check('900 120px "Big Shoulders Display"')) return true;

    const font = new FontFace(
      'Big Shoulders Display',
      'url(https://fonts.gstatic.com/s/bigshouldersdisplay/v21/fC1MPZJEZG-e9gHhdI4-NBbfd2ys3SjJCx12wPgf9g-_3F0YdY86JF46SRP4yZQ.woff2)',
      { weight: '900', style: 'normal' }
    );
    await font.load();
    document.fonts.add(font);
    return true;
  } catch (err) {
    return false;
  }
}

async function shareCheckInCard() {
  const card = document.getElementById('checkin-card-canvas');
  if (!card) return;

  try {
    // Preload branded font + images in parallel for best performance
    const [, logoImg, bgImg] = await Promise.all([
      loadBigShouldersFont(),
      loadImageSafe('./assets/logo.png'),
      loadImageSafe('./assets/photos/low-angle-urban.jpg')
    ]);

    // Font family strings — fall back gracefully if FontFace failed
    const displayFont = '"Big Shoulders Display", "Arial Black", Impact, sans-serif';

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

    // ===== LAYER 1: Base background =====
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, 1080, 1920);

    // ===== LAYER 2: Campaign photo background (low opacity) =====
    if (bgImg) {
      ctx.globalAlpha = 0.25;
      // Cover-fit the 1080x1920 canvas
      const imgRatio = bgImg.width / bgImg.height;
      const canvasRatio = 1080 / 1920;
      let drawW, drawH, drawX, drawY;
      if (imgRatio > canvasRatio) {
        drawH = 1920;
        drawW = drawH * imgRatio;
        drawX = (1080 - drawW) / 2;
        drawY = 0;
      } else {
        drawW = 1080;
        drawH = drawW / imgRatio;
        drawX = 0;
        drawY = (1920 - drawH) / 2;
      }
      ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);
      ctx.globalAlpha = 1.0;
    }

    // ===== LAYER 3: Dramatic gradient for text legibility =====
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, 'rgba(10, 10, 10, 0.4)');
    grad.addColorStop(0.3, 'rgba(10, 10, 10, 0.85)');
    grad.addColorStop(0.7, 'rgba(10, 10, 10, 0.85)');
    grad.addColorStop(1, 'rgba(10, 10, 10, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    // ===== LAYER 4: RIU Logo (top, centered) =====
    if (logoImg) {
      ctx.drawImage(logoImg, 470, 240, 140, 140);
    }

    // ===== LAYER 5: Text content =====
    ctx.textAlign = 'center';

    // "LOCKED IN" — hero headline
    ctx.fillStyle = '#BFFF00';
    ctx.font = `900 120px ${displayFont}`;
    ctx.fillText('LOCKED IN', 540, 500);

    // Day
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 72px ${displayFont}`;
    ctx.fillText(dayNames[now.getDay()], 540, 640);

    // Location
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 48px ${displayFont}`;
    ctx.fillText(location, 540, 720);

    // Date
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '400 36px Inter, Arial, sans-serif';
    ctx.fillText(`${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`, 540, 790);

    // Divider line — lime accent
    ctx.strokeStyle = '#BFFF00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(340, 850);
    ctx.lineTo(740, 850);
    ctx.stroke();

    // Stats row
    const statY = 970;
    const statLabels = ['Week Streak', 'Check-ins', 'Miles'];
    const statValues = [stats.streak.toString(), stats.totalCheckIns.toString(), stats.totalMiles.toFixed(1)];
    const statX = [270, 540, 810];

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#BFFF00';
      ctx.font = `900 80px ${displayFont}`;
      ctx.fillText(statValues[i], statX[i], statY);

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 28px Inter, Arial, sans-serif';
      ctx.fillText(statLabels[i], statX[i], statY + 45);
    }

    // Runner name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 56px ${displayFont}`;
    ctx.fillText(currentProfile.display_name, 540, 1170);

    // Pace group
    ctx.fillStyle = '#BFFF00';
    ctx.font = '600 32px Inter, Arial, sans-serif';
    ctx.fillText(paceLabel, 540, 1225);

    // Lime green accent line above branding
    ctx.fillStyle = '#BFFF00';
    ctx.fillRect(440, 1680, 200, 3);

    // RIU branding at bottom
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `700 32px ${displayFont}`;
    ctx.fillText('RUN IT UP! DALLAS', 540, 1740);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '400 24px Inter, Arial, sans-serif';
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
    console.error('shareCheckInCard error:', err);
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
// Badges are typographic lockups using Big Shoulders Display — the brand
// typeface IS the badge. Each badge has a hero numeral + contextual mark
// (subscript or suffix). Three rarity tiers: common, rare, legendary.
function getBadgeIcon(badgeType) {
  const icons = {
    // First Step — "01" with "MI" subscript. Common tier.
    first_step: `<svg class="badge-stamp" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 9h8M3 6l2 1 1-2 2 1 1-1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="badge-lockup"><span class="badge-num">01</span><span class="badge-mark">MI</span></span>`,

    // Early Bird — "5AM" with sunrise hallmark stamp. Common tier.
    early_bird: `<svg class="badge-stamp" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="8" r="2.2" fill="currentColor"/><path d="M1 11h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span class="badge-lockup"><span class="badge-word">5AM</span></span>`,

    // Night Runner — "11PM" with moon crescent hallmark. Common tier.
    night_runner: `<svg class="badge-stamp" viewBox="0 0 12 12" aria-hidden="true"><path d="M9 3a4 4 0 1 0 0 6 3 3 0 0 1 0-6z" fill="currentColor"/></svg><span class="badge-lockup"><span class="badge-num">11</span><span class="badge-mark">PM</span></span>`,

    // Streak Week — "7 DAY" with calendar dot grid hallmark. Common tier.
    streak_week: `<svg class="badge-stamp" viewBox="0 0 12 12" aria-hidden="true"><circle cx="3" cy="3" r="1" fill="currentColor"/><circle cx="6" cy="3" r="1" fill="currentColor"/><circle cx="9" cy="3" r="1" fill="currentColor"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="9" r="1" fill="currentColor"/></svg><span class="badge-lockup badge-stacked"><span class="badge-num">7</span><span class="badge-mark">DAY</span></span>`,

    // On Fire — solid filled flame with "12W" subscript. Rare tier.
    on_fire: `<span class="badge-lockup badge-rare badge-stacked"><svg class="badge-flame" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3c0 4 2 5 2 8.5 0 2-1 3-2.5 3C14 14.5 13 13 13 10c-2 2-5 5-5 9.5C8 25 11.5 29 16 29s8-4 8-9.5C24 13 16 13 16 3z"/><path d="M16 29c2.5 0 4.5-2 4.5-4.5 0-2.2-1.5-3.2-2.5-4.8-.9 1.1-2 2.1-2 3.6 0 1.5-2 2-2 3.5 0 1.2 1 2.2 2 2.2z" fill="#0A0A0A"/></svg><span class="badge-mark">12W</span></span>`,

    // Century Club — "100" with "MI" subscript. Legendary tier.
    century_club: `<span class="badge-lockup badge-legendary"><span class="badge-num badge-num-tight">100</span><span class="badge-mark">MI</span></span>`,

    // Run Buddy — "+1" with chain link hallmark. Common tier.
    run_buddy: `<svg class="badge-stamp" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 6a2 2 0 1 1 4 0M6 4v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="4" cy="7.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="7.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span class="badge-lockup"><span class="badge-num">+1</span><span class="badge-mark">PAIR</span></span>`,

    // Day One — "OG" wordmark. Legendary tier.
    day_one: `<span class="badge-lockup badge-legendary"><span class="badge-word">OG</span></span>`,

    // Both Sides — "2X" numeral with "DOUBLE" subscript. Rare tier.
    both_sides: `<span class="badge-lockup badge-rare"><span class="badge-num">2X</span><span class="badge-mark">DOUBLE</span></span>`,

    // Social Butterfly — "50" with chat bubble hallmark. Common tier.
    social_butterfly: `<svg class="badge-stamp" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5L3 10V3.5z" fill="currentColor"/></svg><span class="badge-lockup"><span class="badge-num">50</span><span class="badge-mark">DM</span></span>`
  };
  return icons[badgeType] || `<span class="badge-lockup"><span class="badge-num">?</span></span>`;
}

const BADGE_DEFINITIONS = [
  { type: 'first_step', label: 'First Step', description: 'First check-in', get icon() { return getBadgeIcon('first_step'); } },
  { type: 'early_bird', label: 'Early Bird', description: '5 Saturday morning runs', get icon() { return getBadgeIcon('early_bird'); } },
  { type: 'night_runner', label: 'Night Runner', description: '5 Tuesday evening runs', get icon() { return getBadgeIcon('night_runner'); } },
  { type: 'streak_week', label: 'Streak Week', description: '4-week attendance streak', get icon() { return getBadgeIcon('streak_week'); } },
  { type: 'on_fire', label: 'On Fire', description: '12-week attendance streak', get icon() { return getBadgeIcon('on_fire'); } },
  { type: 'century_club', label: 'Century Club', description: '100 total miles', get icon() { return getBadgeIcon('century_club'); } },
  { type: 'run_buddy', label: 'Run Buddy', description: 'Used buddy feature 3 times', get icon() { return getBadgeIcon('run_buddy'); } },
  { type: 'day_one', label: 'Day One', description: 'Attended a special event', get icon() { return getBadgeIcon('day_one'); } },
  { type: 'both_sides', label: 'Both Sides', description: 'Tuesday + Saturday same week', get icon() { return getBadgeIcon('both_sides'); } },
  { type: 'social_butterfly', label: 'Social Butterfly', description: 'Sent 50 messages', get icon() { return getBadgeIcon('social_butterfly'); } }
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

  // Check for milestone celebrations
  await checkAndShowMilestone(stats.totalCheckIns);
}

// ===== MONTHLY CHALLENGE SYSTEM =====
const MONTHLY_CHALLENGES = [
  {
    id: 'run_4_times',
    title: 'Run 4 Times This Month',
    description: 'Check in 4 times in the current calendar month',
    target: 4,
    type: 'monthly_checkins'
  },
  {
    id: 'perfect_week',
    title: 'Hit All 4 Run Days in One Week',
    description: 'Check in Mon + Tue + Sat + Sun in the same week',
    target: 1,
    type: 'perfect_week'
  },
  {
    id: 'run_8_times',
    title: 'Check In 8 Times This Month',
    description: '8 total check-ins this month',
    target: 8,
    type: 'monthly_checkins'
  },
  {
    id: 'streak_4_weeks',
    title: 'Build a 4-Week Streak',
    description: 'Maintain 4 consecutive weeks of attendance',
    target: 4,
    type: 'streak'
  }
];

function getCurrentChallenge() {
  const monthIndex = new Date().getMonth(); // 0-11
  return MONTHLY_CHALLENGES[monthIndex % MONTHLY_CHALLENGES.length];
}

function getDaysRemainingInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}

function getMonthCheckIns(checkIns) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return checkIns.filter(ci => {
    const d = new Date(ci.checked_in_at);
    return d >= monthStart && d <= monthEnd;
  });
}

function checkPerfectWeek(checkIns) {
  // Group check-ins by week, check if any week has Mon+Tue+Sat+Sun
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthCheckIns = checkIns.filter(ci => {
    const d = new Date(ci.checked_in_at);
    return d >= monthStart && d <= monthEnd;
  });

  const weekMap = new Map();
  monthCheckIns.forEach(ci => {
    const d = new Date(ci.checked_in_at);
    const weekKey = getWeekStart(d).toISOString().split('T')[0];
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Set());
    weekMap.get(weekKey).add(d.getDay());
  });

  for (const days of weekMap.values()) {
    if (days.has(1) && days.has(2) && days.has(6) && days.has(0)) return true;
  }
  return false;
}

function getChallengeProgress(challenge, checkIns, streak) {
  let current = 0;
  const target = challenge.target;

  if (challenge.type === 'monthly_checkins') {
    current = getMonthCheckIns(checkIns).length;
  } else if (challenge.type === 'perfect_week') {
    current = checkPerfectWeek(checkIns) ? 1 : 0;
  } else if (challenge.type === 'streak') {
    current = Math.min(streak, target);
  }

  return {
    current: Math.min(current, target),
    target,
    completed: current >= target,
    percent: Math.min(Math.round((current / target) * 100), 100)
  };
}

function renderChallengeCard(challenge, progress, showDaysRemaining = true) {
  const daysLeft = getDaysRemainingInMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[new Date().getMonth()];

  return `
    <div class="challenge-card">
      <div class="challenge-header">
        <div class="challenge-label">${monthName} Challenge</div>
        ${showDaysRemaining ? `<div class="challenge-days-left">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</div>` : ''}
      </div>
      <div class="challenge-title">${escapeHtml(challenge.title)}</div>
      <div class="challenge-progress-bar">
        <div class="challenge-progress-fill ${progress.completed ? 'completed' : ''}" style="width: ${progress.percent}%;"></div>
      </div>
      <div class="challenge-status">
        ${progress.completed
          ? '<span class="challenge-completed-badge">&#10003; COMPLETED</span>'
          : `<span class="challenge-count">${progress.current} of ${progress.target}</span>`
        }
      </div>
    </div>
  `;
}

// ===== MILESTONE CELEBRATION SYSTEM =====
const MILESTONE_DEFINITIONS = [
  { threshold: 10, name: 'Double Digits', message: "You've checked in 10 times. You're just getting started." },
  { threshold: 25, name: 'Quarter Century', message: "25 check-ins in the books. That's dedication." },
  { threshold: 50, name: 'Fifty Strong', message: "You've checked in 50 times. That's commitment." },
  { threshold: 100, name: 'Century Runner', message: "100 check-ins. You're a legend in these streets." },
  { threshold: 200, name: 'Two Hundred Club', message: "200 check-ins. You don't quit." },
  { threshold: 365, name: 'Day One OG', message: "One year of showing up. You're the definition of Day One." }
];

async function checkAndShowMilestone(totalCheckIns) {
  if (!currentProfile) return;

  // Check if the user just crossed a milestone (current total equals a threshold)
  const milestone = MILESTONE_DEFINITIONS.find(m => m.threshold === totalCheckIns);
  if (!milestone) return;

  // Check localStorage to avoid showing the same milestone twice
  const milestoneKey = `milestone_${currentProfile.id}_${milestone.threshold}`;
  if (localStorage.getItem(milestoneKey)) return;

  // Mark as shown
  localStorage.setItem(milestoneKey, Date.now().toString());

  // Show celebration modal
  showMilestoneCelebration(milestone);
}

function showMilestoneCelebration(milestone) {
  const overlay = document.createElement('div');
  overlay.className = 'milestone-overlay';
  overlay.innerHTML = `
    <div class="milestone-confetti" aria-hidden="true">
      ${Array.from({ length: 40 }, (_, i) => {
        const isLime = i % 3 !== 0;
        const color = isLime ? 'var(--color-primary)' : '#FF6B2B';
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 2 + Math.random() * 2;
        const size = 4 + Math.random() * 6;
        return `<div class="confetti-dot" style="
          left: ${left}%;
          background: ${color};
          width: ${size}px;
          height: ${size}px;
          animation-delay: ${delay}s;
          animation-duration: ${duration}s;
        "></div>`;
      }).join('')}
    </div>
    <div class="milestone-modal">
      <div class="milestone-number">${milestone.threshold}</div>
      <div class="milestone-name">${escapeHtml(milestone.name.toUpperCase())}</div>
      <div class="milestone-message">${escapeHtml(milestone.message)}</div>
      <div class="milestone-actions">
        <button class="btn-primary" onclick="shareMilestone(${milestone.threshold}, '${escapeHtml(milestone.name)}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          Share
        </button>
        <button class="btn-secondary btn-sm" onclick="closeMilestoneCelebration()">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeMilestoneCelebration() {
  const overlay = document.querySelector('.milestone-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}

function shareMilestone(threshold, name) {
  const text = `Just hit ${threshold} check-ins with Run It UP! Dallas — ${name}! Who's running with me next?`;
  const url = 'https://taylormadecreative.github.io/runitup-dallas/';
  shareRun('Run It UP! Milestone', text, url);
  closeMilestoneCelebration();
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
