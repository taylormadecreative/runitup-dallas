// ===== STATS SCREEN =====
let leaderboardMetric = 'streak'; // 'streak', 'miles', 'checkins'
let leaderboardPeriod = 'alltime'; // 'weekly', 'alltime'

async function initStats() {
  await refreshStats();
}

async function refreshStats() {
  const container = document.getElementById('screen-stats');
  if (!currentProfile) return;

  const stats = await getUserStats(currentProfile.id);
  const badges = await getUserBadges(currentProfile.id);
  const earnedTypes = new Set(badges.map(b => b.badge_type));
  const leaderboard = await getLeaderboard(leaderboardMetric, leaderboardPeriod);

  container.innerHTML = `
    <!-- Stats Hero -->
    <div class="stats-hero">
      <div class="flame">🔥</div>
      <div class="streak-number">${stats.streak}</div>
      <div class="streak-text">Week Streak</div>
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value">${stats.totalCheckIns}</div>
          <div class="stat-label">Check-ins</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.totalMiles.toFixed(1)}</div>
          <div class="stat-label">Miles</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${formatDate(currentProfile.created_at).split(',')[0]}</div>
          <div class="stat-label">Member Since</div>
        </div>
      </div>
    </div>

    <!-- Badges -->
    <div class="badges-section">
      <h3>Badges</h3>
      <div class="badges-grid">
        ${BADGE_DEFINITIONS.map(def => {
          const earned = earnedTypes.has(def.type);
          return `
            <div class="badge-item ${earned ? '' : 'locked'}" title="${def.description}">
              <div class="badge-icon">${def.icon}</div>
              <div class="badge-label">${def.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="leaderboard-section">
      <h3>Leaderboard</h3>
      <div class="leaderboard-tabs">
        <button class="${leaderboardMetric === 'streak' ? 'active' : ''}" onclick="setLeaderboardMetric('streak')">Streak</button>
        <button class="${leaderboardMetric === 'miles' ? 'active' : ''}" onclick="setLeaderboardMetric('miles')">Miles</button>
        <button class="${leaderboardMetric === 'checkins' ? 'active' : ''}" onclick="setLeaderboardMetric('checkins')">Check-ins</button>
      </div>
      <div class="leaderboard-time-tabs">
        <button class="${leaderboardPeriod === 'weekly' ? 'active' : ''}" onclick="setLeaderboardPeriod('weekly')">This Week</button>
        <button class="${leaderboardPeriod === 'alltime' ? 'active' : ''}" onclick="setLeaderboardPeriod('alltime')">All Time</button>
      </div>
      <div class="leaderboard-list">
        ${leaderboard.map((entry, i) => `
          <div class="leaderboard-item ${entry.id === currentProfile.id ? 'me' : ''}"
            onclick="viewMemberProfile('${entry.id}')">
            <span class="lb-rank">${i + 1}</span>
            <img src="${entry.avatar_url || DEFAULT_AVATAR}" class="avatar-sm" alt="">
            <div class="lb-info">
              <div class="lb-name">
                ${entry.display_name}
                ${paceGroupBadgeHTML(entry.pace_group)}
              </div>
            </div>
            <span class="lb-stat">${entry.statValue}${leaderboardMetric === 'miles' ? ' mi' : ''}</span>
          </div>
        `).join('')}
        ${leaderboard.length === 0 ? '<div class="empty-state"><p>No data yet. Check in to get on the board!</p></div>' : ''}
      </div>
    </div>
  `;
}

async function getLeaderboard(metric, period) {
  // Get all users with check-ins
  const { data: users } = await supabaseClient.from('users').select('id, display_name, avatar_url, pace_group, created_at');
  if (!users) return [];

  let sinceDate = null;
  if (period === 'weekly') {
    sinceDate = getWeekStart(new Date()).toISOString();
  }

  // Get all check-ins (filtered by period)
  let query = supabaseClient.from('check_ins').select('user_id, miles, checked_in_at, event_type');
  if (sinceDate) query = query.gte('checked_in_at', sinceDate);
  const { data: allCheckIns } = await query;

  // Calculate stats per user
  const userStats = users.map(user => {
    const userCheckIns = (allCheckIns || []).filter(ci => ci.user_id === user.id);
    const totalMiles = userCheckIns.reduce((sum, ci) => sum + (ci.miles || 0), 0);
    const totalCheckIns = userCheckIns.length;
    const streak = calculateStreak(userCheckIns);

    let statValue = 0;
    if (metric === 'streak') statValue = streak;
    else if (metric === 'miles') statValue = Math.round(totalMiles * 10) / 10;
    else if (metric === 'checkins') statValue = totalCheckIns;

    return { ...user, statValue };
  });

  // Sort and return top 10
  userStats.sort((a, b) => b.statValue - a.statValue);
  return userStats.filter(u => u.statValue > 0).slice(0, 10);
}

function setLeaderboardMetric(metric) {
  leaderboardMetric = metric;
  refreshStats();
}

function setLeaderboardPeriod(period) {
  leaderboardPeriod = period;
  refreshStats();
}
