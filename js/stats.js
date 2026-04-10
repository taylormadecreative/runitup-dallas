// ===== STATS SCREEN =====
let leaderboardMetric = 'streak'; // 'streak', 'miles', 'checkins'
let leaderboardPeriod = 'alltime'; // 'weekly', 'alltime'

async function initStats() {
  await refreshStats();
}

async function refreshStats() {
  const container = document.getElementById('screen-stats');
  if (!currentProfile) return;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';

  const stats = await getUserStats(currentProfile.id);
  const badges = await getUserBadges(currentProfile.id);
  const earnedTypes = new Set(badges.map(b => b.badge_type));
  const leaderboard = await getLeaderboard(leaderboardMetric, leaderboardPeriod);

  container.innerHTML = `
    <!-- Stats Hero -->
    <div class="stats-hero">
      <div class="flame">&#9650;</div>
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

    <!-- Challenge -->
    <div class="challenge-section">
      <h3>Challenge</h3>
      ${(() => {
        const challenge = getCurrentChallenge();
        const progress = getChallengeProgress(challenge, stats.checkIns, stats.streak);
        return renderChallengeCard(challenge, progress, true);
      })()}
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
            <img src="${safeAvatarUrl(entry.avatar_url)}" class="avatar-sm" alt="">
            <div class="lb-info">
              <div class="lb-name">
                ${escapeHtml(entry.display_name)}
                ${paceGroupBadgeHTML(entry.pace_group)}
              </div>
            </div>
            <span class="lb-stat">${entry.statValue}${leaderboardMetric === 'miles' ? ' mi' : ''}</span>
          </div>
        `).join('')}
        ${leaderboard.length === 0 ? '<div class="empty-state"><p>Your journey starts now. Check in at your next run and watch this light up.</p></div>' : ''}
      </div>
    </div>
  `;
}

// Cache leaderboard data for 60s to avoid refetching on every tab switch
let leaderboardCache = { key: null, data: null, expires: 0 };

async function getLeaderboard(metric, period) {
  const cacheKey = period; // data fetched depends only on period
  const now = Date.now();

  let rows;
  if (leaderboardCache.key === cacheKey && leaderboardCache.expires > now) {
    rows = leaderboardCache.data;
  } else {
    // Only pull last 90 days — enough for "weekly" and recent stats, keeps payload small
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Single query with user info joined, limited to 500 rows (top 10 only needs recent activity)
    const { data: checkIns } = await supabaseClient
      .from('check_ins')
      .select('user_id, checked_in_at, miles, users!inner(display_name, avatar_url, pace_group)')
      .gte('checked_in_at', ninetyDaysAgo)
      .order('checked_in_at', { ascending: false })
      .limit(500);

    rows = checkIns || [];
    leaderboardCache = { key: cacheKey, data: rows, expires: now + 60 * 1000 };
  }

  // Filter by period if weekly
  let filteredRows = rows;
  if (period === 'weekly') {
    const sinceDate = getWeekStart(new Date()).toISOString();
    filteredRows = rows.filter(ci => ci.checked_in_at >= sinceDate);
  }

  // Group check-ins by user
  const byUser = new Map();
  for (const ci of filteredRows) {
    if (!ci.users) continue;
    if (!byUser.has(ci.user_id)) {
      byUser.set(ci.user_id, {
        id: ci.user_id,
        display_name: ci.users.display_name,
        avatar_url: ci.users.avatar_url,
        pace_group: ci.users.pace_group,
        checkIns: []
      });
    }
    byUser.get(ci.user_id).checkIns.push(ci);
  }

  // Calculate stats per user
  const userStats = Array.from(byUser.values()).map(user => {
    const totalMiles = user.checkIns.reduce((sum, ci) => sum + (ci.miles || 0), 0);
    const totalCheckIns = user.checkIns.length;
    const streak = calculateStreak(user.checkIns);

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
