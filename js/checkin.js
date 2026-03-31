// ===== CHECK-IN SYSTEM =====

async function checkIn(eventType, eventId = null) {
  if (!currentProfile) return;

  // Check if already checked in today for this event type
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
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

  const { data, error } = await supabase
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
    showToast('Check-in failed. Try again.', 'error');
    throw error;
  }

  showToast("You're checked in! Let's run!", 'success');

  // Check for new badges after check-in
  await checkAndAwardBadges();

  return data;
}

async function logMiles(checkInId, miles) {
  const { error } = await supabase
    .from('check_ins')
    .update({ miles })
    .eq('id', checkInId);

  if (error) {
    showToast('Failed to log miles', 'error');
    return;
  }
  showToast(`${miles} miles logged!`, 'success');

  // Re-check badges (Century Club depends on miles)
  await checkAndAwardBadges();
}

async function getCheckInCountForEvent(eventType, daysBack = 7) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { count } = await supabase
    .from('check_ins')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('checked_in_at', since.toISOString());

  return count || 0;
}

async function hasCheckedInToday(eventType) {
  if (!currentProfile) return false;
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
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
  const { data } = await supabase
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
}

// ===== BADGE SYSTEM =====
const BADGE_DEFINITIONS = [
  { type: 'first_step', label: 'First Step', description: 'First check-in', icon: '\u{1F463}' },
  { type: 'early_bird', label: 'Early Bird', description: '5 Saturday morning runs', icon: '\u{1F305}' },
  { type: 'night_runner', label: 'Night Runner', description: '5 Tuesday evening runs', icon: '\u{1F303}' },
  { type: 'streak_week', label: 'Streak Week', description: '4-week attendance streak', icon: '\u{1F4AA}' },
  { type: 'on_fire', label: 'On Fire', description: '12-week attendance streak', icon: '\u{1F525}' },
  { type: 'century_club', label: 'Century Club', description: '100 total miles', icon: '\u{1F4AF}' },
  { type: 'run_buddy', label: 'Run Buddy', description: 'Used buddy feature 3 times', icon: '\u{1F91D}' },
  { type: 'day_one', label: 'Day One', description: 'Attended a special event', icon: '\u{2B50}' },
  { type: 'both_sides', label: 'Both Sides', description: 'Tuesday + Saturday same week', icon: '\u{1F504}' },
  { type: 'social_butterfly', label: 'Social Butterfly', description: 'Sent 50 messages', icon: '\u{1F98B}' }
];

async function checkAndAwardBadges() {
  if (!currentProfile) return;
  const userId = currentProfile.id;

  // Get existing badges
  const { data: existingBadges } = await supabase
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
  const { count: buddyCount } = await supabase
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('matched_with', 'is', null);

  // Get message count
  const { count: msgCount } = await supabase
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
    if (def) showToast(`Badge earned: ${def.icon} ${def.label}!`, 'success');
  }
}

async function getUserBadges(userId) {
  const { data } = await supabase
    .from('badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  return data || [];
}

async function getPinnedBadges(userId) {
  const { data } = await supabase
    .from('pinned_badges')
    .select('*, badges(*)')
    .eq('user_id', userId)
    .order('slot');
  return data || [];
}
