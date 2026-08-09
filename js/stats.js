// ===== STATS SCREEN =====
let leaderboardMetric = 'streak'; // 'streak' | 'miles' | 'checkins'
let leaderboardPeriod = 'alltime'; // 'weekly' | 'alltime'

async function initStats() {
  await refreshStats();
}

// Renders the whole tab. Hero + challenge render first off `getUserStats`;
// badges + leaderboard fetch in parallel but don't block the hero paint.
async function refreshStats() {
  const container = document.getElementById('screen-stats');
  if (!currentProfile) return;
  try {
    // Show spinner only on first load
    if (!container.innerHTML || container.querySelector('.loading-screen')) {
      container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    }

    // Hero is highest priority — render as soon as user stats are known
    const stats = await getUserStats(currentProfile.id);
    container.innerHTML = renderStatsShell(stats);

    // Badges + leaderboard load in background
    const [badges, leaderboard] = await Promise.all([
      getUserBadges(currentProfile.id).catch(() => []),
      getLeaderboard(leaderboardMetric, leaderboardPeriod).catch(() => [])
    ]);
    const earnedTypes = new Set(badges.map(b => b.badge_type));

    const badgesEl = document.getElementById('stats-badges-grid');
    if (badgesEl) badgesEl.innerHTML = renderBadgesGrid(earnedTypes);

    const leaderboardEl = document.getElementById('stats-leaderboard-list');
    if (leaderboardEl) leaderboardEl.innerHTML = renderLeaderboardList(leaderboard);
  } catch (err) {
    console.error('[stats] refresh failed', err);
    container.innerHTML = `<div class="empty-state"><p>Couldn't load your stats — pull down to retry.</p></div>`;
  }
}

function renderStatsShell(stats) {
  const hasCheckIns = stats.totalCheckIns > 0;
  const memberSinceShort = new Date(currentProfile.created_at)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  // 8-week history bars
  const maxHeight = 8; // visual cap for normalized bars (all cells full when attended)
  const historyBars = (stats.weekHistory || []).map((attended, i) => `
    <div class="wk-bar ${attended ? 'filled' : ''}" title="${attended ? 'Ran that week' : 'Missed'}"></div>
  `).join('');

  // Clean flame SVG
  const flameSvg = `
    <svg class="flame-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 23c4.4 0 8-3.6 8-8 0-3.5-2.2-6.4-5-8-.2 1.4-.9 2.6-2 3.3.2-1.6-.3-3.2-1.3-4.3-1-1.1-2.5-1.7-4-2 0 3-1.7 5.6-3.7 7.6C2.8 13 2 14.9 2 17c0 3.3 2.7 6 6 6h4zm0-3c-1.7 0-3-1.3-3-3 0-1 .5-1.9 1.3-2.6.2 1 .9 1.9 1.7 2.3-.1-.9.2-1.8.8-2.5.6-.7 1.5-1.1 2.4-1.2 0 1.4-.7 2.6-1.8 3.5.2.6.3 1.2.3 1.8 0 1-.5 1.7-1.7 1.7z"/>
    </svg>
  `;

  // Share button: gated on having at least one check-in
  const shareBtn = hasCheckIns ? `
    <button class="btn-primary stats-hero-share" onclick="shareStatsCard()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px; vertical-align: middle;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
      Share Your Streak
    </button>
  ` : `
    <button class="btn-primary stats-hero-share" onclick="navigateTo('home')">
      Check In to Start Your Streak
    </button>
  `;

  return `
    <!-- Stats Hero -->
    <div class="stats-hero">
      <div class="flame">${flameSvg}</div>
      <div class="streak-number">${stats.streak}</div>
      <div class="streak-text">Week Streak</div>

      <div class="wk-history" aria-label="Last 8 weeks">
        ${historyBars}
      </div>

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
          <div class="stat-value">${memberSinceShort}</div>
          <div class="stat-label">In the Crew</div>
        </div>
      </div>

      ${shareBtn}
    </div>

    <!-- Challenge -->
    <div class="challenge-section">
      <h3>This Month</h3>
      ${(() => {
        const challenge = getCurrentChallenge();
        const progress = getChallengeProgress(challenge, stats.checkIns, stats.streak);
        return renderChallengeCard(challenge, progress, true);
      })()}
    </div>

    <!-- Badges -->
    <div class="badges-section">
      <h3>Badges</h3>
      <div class="badges-grid" id="stats-badges-grid">
        <div class="loading-inline"><div class="spinner spinner-sm"></div></div>
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
      <div class="leaderboard-list" id="stats-leaderboard-list">
        <div class="loading-inline"><div class="spinner spinner-sm"></div></div>
      </div>
    </div>
  `;
}

function renderBadgesGrid(earnedTypes) {
  // Cache for detail modal lookup
  window._earnedBadgeTypes = earnedTypes;
  return BADGE_DEFINITIONS.map(def => {
    const earned = earnedTypes.has(def.type);
    return `
      <div class="badge-item ${earned ? '' : 'locked'}" onclick="showBadgeDetail('${def.type}')" role="button" tabindex="0" aria-label="${def.label}">
        <div class="badge-icon">${def.icon}</div>
        <div class="badge-label">${def.label}</div>
      </div>
    `;
  }).join('');
}

async function showBadgeDetail(badgeType) {
  const def = BADGE_DEFINITIONS.find(b => b.type === badgeType);
  if (!def) return;
  const earned = (window._earnedBadgeTypes || new Set()).has(badgeType);
  const earnedDate = earned ? await _getBadgeEarnedDate(badgeType) : null;

  const opener = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'badge-detail-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', def.label);
  // Restore focus to the badge that opened the dialog, whichever way it closes
  const origRemove = overlay.remove.bind(overlay);
  overlay.remove = () => { origRemove(); opener?.focus?.(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });
  overlay.innerHTML = `
    <div class="badge-detail-modal">
      <button class="badge-detail-close" onclick="this.closest('.badge-detail-overlay').remove()" aria-label="Close">×</button>
      <div class="badge-detail-icon-wrap">
        <div class="badge-detail-glow ${earned ? '' : 'locked'}"></div>
        <div class="badge-detail-icon ${earned ? '' : 'locked'}">${def.icon}</div>
      </div>
      <div class="badge-detail-name">${escapeHtml(def.label)}</div>
      <div class="badge-detail-status">${earned ? '✓ UNLOCKED' : '🔒 LOCKED'}</div>
      <div class="badge-detail-desc">${escapeHtml(def.description)}</div>
      ${earnedDate ? `<div class="badge-detail-date">Earned ${formatDate(earnedDate)}</div>` : ''}
      <div class="badge-detail-actions">
        ${earned ? `<button class="btn-primary" onclick="shareBadge('${badgeType}')">Share Badge</button>` : ''}
        <button class="btn-secondary btn-sm" onclick="this.closest('.badge-detail-overlay').remove()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    overlay.querySelector('.badge-detail-close')?.focus();
  });
  haptic('light');
}

async function _getBadgeEarnedDate(badgeType) {
  try {
    const { data } = await supabaseClient.from('badges')
      .select('earned_at')
      .eq('user_id', currentProfile.id)
      .eq('badge_type', badgeType)
      .maybeSingle();
    return data?.earned_at || null;
  } catch { return null; }
}

async function shareBadge(badgeType) {
  const def = BADGE_DEFINITIONS.find(b => b.type === badgeType);
  if (!def) return;
  // Reuse the check-in card generator pattern to make a branded 1080x1920 badge card
  try {
    const [, logoImg, bgImg] = await Promise.all([
      loadBigShouldersFont(),
      loadImageSafe('./assets/logo.png'),
      loadImageSafe('./assets/photos/low-angle-urban.webp')
    ]);
    const displayFont = '"Big Shoulders Display", "Arial Black", Impact, sans-serif';
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, 0, 1080, 1920);
    if (bgImg) {
      ctx.globalAlpha = 0.25;
      const r = bgImg.width / bgImg.height, cr = 1080/1920;
      let w,h,x,y;
      if (r > cr) { h=1920; w=h*r; x=(1080-w)/2; y=0; } else { w=1080; h=w/r; x=0; y=(1920-h)/2; }
      ctx.drawImage(bgImg, x, y, w, h); ctx.globalAlpha = 1;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, 'rgba(10,10,10,0.5)');
    grad.addColorStop(0.5, 'rgba(10,10,10,0.85)');
    grad.addColorStop(1, 'rgba(10,10,10,0.95)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1920);
    if (logoImg) ctx.drawImage(logoImg, 470, 200, 140, 140);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#BFFF00';
    ctx.font = `900 100px ${displayFont}`;
    ctx.fillText('BADGE UNLOCKED', 540, 480);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 140px ${displayFont}`;
    ctx.fillText(def.label.toUpperCase(), 540, 1080);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '500 40px Inter, sans-serif';
    ctx.fillText(def.description, 540, 1160);
    ctx.fillStyle = '#BFFF00'; ctx.fillRect(440, 1680, 200, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `700 32px ${displayFont}`;
    ctx.fillText('RUN IT UP! DALLAS', 540, 1740);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `riu-badge-${badgeType}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ title: 'Run It UP!', text: `Just unlocked the ${def.label} badge on Run It UP! #RunItUpDallas`, files: [file] }); }
        catch (err) { if (err.name !== 'AbortError') downloadCheckInCard(canvas); }
      } else {
        const link = document.createElement('a');
        link.download = `riu-badge-${badgeType}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    }, 'image/png');
  } catch (err) {
    console.error('[shareBadge]', err);
    showToast('Could not share — try again.', 'error');
  }
}

function renderLeaderboardList(result) {
  // getLeaderboard resolves { top, me, tenthValue }; error fallbacks still
  // pass a bare [] — normalize both shapes here.
  const top = Array.isArray(result) ? result : (result?.top || []);
  const me = Array.isArray(result) ? null : (result?.me || null);
  const tenthValue = Array.isArray(result) ? null : (result?.tenthValue ?? null);

  if (!top.length) {
    return `<div class="empty-state"><p>Be the first on the board. Check in at the next run.</p></div>`;
  }

  const rows = top.map((entry, i) => _leaderboardRowHTML(entry, i + 1, false)).join('');

  // Signed-in user inside the top 10 already gets the .me highlight on their
  // own row — only pin a YOUR RANK row when they rank below the visible list.
  if (!me || me.rank <= top.length) return rows;

  // Gap to the #10 entry in the active metric. Hidden when it's zero (tied)
  // or unknowable (board shorter than 10 shouldn't happen here, but guard).
  const gap = tenthValue != null
    ? Math.round((tenthValue - me.entry.statValue) * 10) / 10
    : 0;
  const gapHint = gap > 0 ? `
    <div class="lb-gap-hint">${gap} more ${_leaderboardMetricNoun(gap)} to crack the top 10</div>
  ` : '';

  return `
    ${rows}
    <div class="lb-divider" aria-hidden="true">· · ·</div>
    ${_leaderboardRowHTML(me.entry, me.rank, true)}
    ${gapHint}
  `;
}

function _leaderboardRowHTML(entry, rank, pinned) {
  const isMe = currentProfile && entry.id === currentProfile.id;
  return `
    <div class="leaderboard-item ${isMe ? 'me' : ''}${pinned ? ' lb-pinned' : ''}"
      role="button" tabindex="0" aria-label="View ${escapeAttr(entry.display_name)}'s profile"
      onclick="viewMemberProfile(${jsArg(entry.id)})">
      <span class="lb-rank">${rank}</span>
      <img src="${safeAvatarUrl(entry.avatar_url)}" class="avatar-sm" alt="">
      <div class="lb-info">
        <div class="lb-name">
          ${escapeHtml(entry.display_name)}
          ${paceGroupBadgeHTML(entry.pace_group)}
        </div>
      </div>
      <span class="lb-stat">${entry.statValue}${leaderboardMetric === 'miles' ? ' mi' : ''}</span>
    </div>
  `;
}

// Singular/plural noun for the active metric, used in the gap hint
function _leaderboardMetricNoun(n) {
  const one = n === 1;
  if (leaderboardMetric === 'streak') return one ? 'week' : 'weeks';
  if (leaderboardMetric === 'miles') return one ? 'mile' : 'miles';
  return one ? 'check-in' : 'check-ins';
}

// Cache leaderboard data for 60s to avoid refetching on every tab switch
let leaderboardCache = { key: null, data: null, expires: 0 };

async function getLeaderboard(metric, period) {
  const cacheKey = 'all'; // one full-history fetch serves both periods
  const now = Date.now();

  let rows;
  if (leaderboardCache.key === cacheKey && leaderboardCache.expires > now) {
    rows = leaderboardCache.data;
  } else {
    // Full history — "All Time" means all time, no hidden date window.
    // Paged because Supabase caps a single request at 1000 rows; hard cap
    // keeps the payload sane until totals move to a server-side aggregate.
    const PAGE = 1000, MAX_ROWS = 5000;
    rows = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data: page, error } = await supabaseClient
        .from('check_ins')
        .select('user_id, checked_in_at, miles, users!inner(display_name, avatar_url, pace_group)')
        .order('checked_in_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) break;
      rows = rows.concat(page || []);
      if (!page || page.length < PAGE) break;
    }
    leaderboardCache = { key: cacheKey, data: rows, expires: now + 60 * 1000 };
  }

  const sinceDate = period === 'weekly' ? getWeekStart(new Date()).toISOString() : null;

  // Group check-ins by user (skip blocked users). Keep the full history per
  // user — streaks are multi-week, so they must never be computed from a
  // week-filtered slice.
  const byUser = new Map();
  for (const ci of rows) {
    if (!ci.users) continue;
    if (typeof isBlocked === 'function' && isBlocked(ci.user_id)) continue;
    if (!byUser.has(ci.user_id)) {
      byUser.set(ci.user_id, {
        id: ci.user_id,
        display_name: ci.users.display_name,
        avatar_url: ci.users.avatar_url,
        pace_group: ci.users.pace_group,
        checkIns: [],
        periodCheckIns: []
      });
    }
    const user = byUser.get(ci.user_id);
    user.checkIns.push(ci);
    if (!sinceDate || ci.checked_in_at >= sinceDate) user.periodCheckIns.push(ci);
  }

  const userStats = Array.from(byUser.values())
    // Weekly board only ranks people who checked in this week
    .filter(user => !sinceDate || user.periodCheckIns.length > 0)
    .map(user => {
      const totalMiles = user.periodCheckIns.reduce((sum, ci) => sum + (ci.miles || 0), 0);
      const totalCheckIns = user.periodCheckIns.length;
      const streak = calculateStreak(user.checkIns); // full history, never the weekly slice
      let statValue = 0;
      if (metric === 'streak') statValue = streak;
      else if (metric === 'miles') statValue = Math.round(totalMiles * 10) / 10;
      else if (metric === 'checkins') statValue = totalCheckIns;
      return { ...user, statValue };
    });

  userStats.sort((a, b) => b.statValue - a.statValue);
  const ranked = userStats.filter(u => u.statValue > 0);

  // Capture the signed-in user's spot in the FULL ranked list before slicing
  // so the UI can pin a YOUR RANK row when they fall outside the top 10.
  // Guests / users with no qualifying stat simply aren't on the board.
  let me = null;
  if (currentProfile) {
    const idx = ranked.findIndex(u => u.id === currentProfile.id);
    if (idx !== -1) me = { rank: idx + 1, entry: ranked[idx] };
  }

  return {
    top: ranked.slice(0, 10),
    me,
    tenthValue: ranked.length >= 10 ? ranked[9].statValue : null
  };
}

// Partial re-render of just the leaderboard list + tab highlights — no full tab rebuild
async function setLeaderboardMetric(metric) {
  leaderboardMetric = metric;
  _updateLeaderboardTabs();
  await _refreshLeaderboardOnly();
}

async function setLeaderboardPeriod(period) {
  leaderboardPeriod = period;
  _updateLeaderboardTabs();
  await _refreshLeaderboardOnly();
}

function _updateLeaderboardTabs() {
  document.querySelectorAll('.leaderboard-tabs button').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().toLowerCase().replace('-', '') === leaderboardMetric);
  });
  document.querySelectorAll('.leaderboard-time-tabs button').forEach(b => {
    const p = b.textContent.trim().toLowerCase().includes('week') ? 'weekly' : 'alltime';
    b.classList.toggle('active', p === leaderboardPeriod);
  });
}

async function _refreshLeaderboardOnly() {
  const el = document.getElementById('stats-leaderboard-list');
  if (!el) return;
  el.innerHTML = '<div class="loading-inline"><div class="spinner spinner-sm"></div></div>';
  const leaderboard = await getLeaderboard(leaderboardMetric, leaderboardPeriod).catch(() => []);
  el.innerHTML = renderLeaderboardList(leaderboard);
}
