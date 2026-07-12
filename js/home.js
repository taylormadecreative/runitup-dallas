// ===== HOME SCREEN =====
let countdownInterval = null;
let rollCallChannel = null;  // realtime live roll-call subscription
let _rollCallRows = [];      // today's roll-call rows currently rendered

function cleanupHome() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (rollCallChannel) {
    supabaseClient.removeChannel(rollCallChannel);
    rollCallChannel = null;
  }
}

async function initHome() {
  await refreshHome();
}

// ===== WEATHER =====
// Open-Meteo (no key required). Dallas metro coords for all runs.
const RUN_COORDS = {
  monday: { lat: 32.7812, lng: -96.8411 },   // Trinity Groves
  tuesday: { lat: 32.7843, lng: -96.7819 },  // Deep Ellum
  saturday: { lat: 32.8642, lng: -96.7749 }, // Fair Oaks Park
  sunday: { lat: 32.8696, lng: -96.9419 }    // Levy Event Plaza, Irving
};
const _weatherCache = new Map(); // key -> { data, fetchedAt }
const _WEATHER_TTL_MS = 30 * 60 * 1000;

function _wmoCode(code) {
  if ([0].includes(code)) return { icon: '☀️', summary: 'Clear' };
  if ([1, 2].includes(code)) return { icon: '🌤️', summary: 'Partly cloudy' };
  if ([3].includes(code)) return { icon: '☁️', summary: 'Cloudy' };
  if ([45, 48].includes(code)) return { icon: '🌫️', summary: 'Foggy' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', summary: 'Drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', summary: 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '❄️', summary: 'Snow' };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', summary: 'Thunder' };
  return { icon: '🌡️', summary: 'Forecast' };
}

// Build a "YYYY-MM-DDTHH:00" string in the America/Chicago timezone for ANY Date,
// regardless of the device's local timezone. Prevents traveling users from seeing wrong weather.
function _chicagoHourKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:00`;
}

async function getRunWeather(run, runDate) {
  const coords = RUN_COORDS[run.day] || RUN_COORDS.monday;
  const targetHour = _chicagoHourKey(new Date(runDate));
  const cacheKey = `${run.day}_${targetHour}`;
  const cached = _weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < _WEATHER_TTL_MS) {
    return cached.data;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&hourly=temperature_2m,apparent_temperature,weathercode&temperature_unit=fahrenheit&timezone=America/Chicago&forecast_days=8`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const hourly = json?.hourly;
    if (!hourly?.time?.length) return null;
    let idx = hourly.time.indexOf(targetHour);
    if (idx === -1) {
      // Find closest hour to the target (future fallback)
      const target = Date.parse(targetHour);
      idx = 0;
      let best = Infinity;
      hourly.time.forEach((t, i) => {
        const diff = Math.abs(Date.parse(t) - target);
        if (diff < best) { best = diff; idx = i; }
      });
    }
    const code = hourly.weathercode?.[idx];
    const wmo = _wmoCode(code);
    const data = {
      temp: Math.round(hourly.temperature_2m[idx]),
      feels: Math.round(hourly.apparent_temperature[idx]),
      icon: wmo.icon,
      summary: wmo.summary
    };
    _weatherCache.set(cacheKey, { data, fetchedAt: Date.now() });
    // Cap cache size
    if (_weatherCache.size > 20) {
      const oldestKey = _weatherCache.keys().next().value;
      _weatherCache.delete(oldestKey);
    }
    return data;
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[weather]', err);
    return null;
  }
}

async function refreshHome() {
  const container = document.getElementById('screen-home');
  if (!currentProfile) return;
  // Only show spinner on first load (empty container). Subsequent refreshes keep stale content visible.
  if (!container.innerHTML || container.querySelector('.loading-screen')) {
    container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  }

  // Determine next run (Monday, Tuesday, or Saturday — whichever is soonest)
  const runDates = WEEKLY_RUNS.map(run => ({
    run,
    date: getNextRunDate(run.dayOfWeek)
  }));
  runDates.sort((a, b) => a.date - b.date);
  const nextRun = runDates[0].run;
  const nextRunDate = runDates[0].date;
  const windowOpen = isCheckInWindow(nextRunDate);

  // Parallelize all independent queries
  const [
    stats,
    alreadyCheckedIn,
    lastCount,
    rollCall,
    upcomingEventsRes,
    highlights,
    myBuddyRequests
  ] = await Promise.all([
    getUserStats(currentProfile.id),
    hasCheckedInToday(nextRun.eventType),
    windowOpen ? Promise.resolve(0) : getCheckInCountForEvent(nextRun.eventType, 7),
    windowOpen ? getTodayRollCall(nextRun.eventType) : Promise.resolve([]),
    supabaseClient.from('special_events')
      .select('*, event_rsvps(count)')
      .gte('event_date', new Date().toISOString())
      .order('event_date').limit(1),
    getCommunityHighlights(),
    (typeof getMyActiveBuddyRequests === 'function') ? getMyActiveBuddyRequests() : Promise.resolve([])
  ]);
  const upcomingEvent = upcomingEventsRes?.data?.[0] || null;
  _rollCallRows = rollCall || [];

  // Render
  let checkInBtnClass = 'btn-primary btn-checkin';
  let checkInBtnText = 'CHECK IN';
  let checkInBtnDisabled = '';

  if (alreadyCheckedIn) {
    checkInBtnClass += ' checked';
    checkInBtnText = '\u2713 CHECKED IN';
    checkInBtnDisabled = 'disabled';
  } else if (!windowOpen) {
    checkInBtnDisabled = 'disabled';
  }

  container.innerHTML = `
    <!-- Hero Banner -->
    <div class="home-hero" style="background-image: url('./assets/photos/hero.jpg');">
      <div class="home-hero-overlay">
        <div class="next-run-label">Next Run</div>
        <div class="next-run-title">${nextRun.label} \u2014 <span>${nextRun.location}</span></div>
        <div class="countdown" id="home-countdown"></div>
        ${windowOpen ? `
          <div class="next-run-meta">${nextRun.time} \u00B7 ${nextRun.distance}</div>
          <div class="rollcall-strip" id="home-rollcall">${renderRollCallStrip(_rollCallRows)}</div>
        ` : `
          <div class="next-run-meta">${nextRun.time} \u00B7 ${nextRun.distance} \u00B7 ${lastCount} showed up last week</div>
        `}
        <div class="next-run-address">
          ${nextRun.address} \u00B7 <a href="${nextRun.mapsUrl}" target="_blank">Directions</a>
        </div>
        <div class="hero-action-row">
          <button class="${checkInBtnClass} hero-action-primary" ${checkInBtnDisabled}
            onclick="handleCheckIn('${nextRun.eventType}')">${checkInBtnText}</button>
          <button class="btn-primary hero-action-primary hero-action-run" onclick="openRunTrackerPrep()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px; vertical-align: middle;"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/></svg>
            START RUN
          </button>
          <button class="btn-share-hero" onclick="shareWeeklyRun('${nextRun.label}', '${nextRun.location}', '${nextRun.time}', '${nextRun.address}')" aria-label="Share this run">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div id="weather-slot"></div>

    ${myBuddyRequests.length > 0 ? `
      <div class="buddy-active-banner">
        ${myBuddyRequests.map(r => {
          const dayLabel = r.run_day === 'monday' ? 'Monday · Trinity Groves'
            : r.run_day === 'tuesday' ? 'Tuesday · Deep Ellum'
            : r.run_day === 'saturday' ? 'Saturday · Fair Oaks'
            : 'Sunday · Levy Plaza';
          const matched = !!r.matched_with;
          return `
            <div class="buddy-active-card" onclick="openBuddyBoard('${r.run_day}', '${r.run_date}')">
              <div class="buddy-active-icon">${matched ? '✅' : '👀'}</div>
              <div style="flex: 1;">
                <div class="buddy-active-title">${matched ? 'Matched with a buddy' : 'Looking for a buddy'}</div>
                <div class="buddy-active-sub">${dayLabel} · ${formatDate(r.run_date)}</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.5;"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    ${stats.totalCheckIns === 0 ? `
    <!-- First-Run Welcome (replaces the wall-of-zeros streak bar + quick stats) -->
    <div class="welcome-card">
      <div class="welcome-title">Your First Run Starts Here</div>
      <p class="welcome-copy">Pull up to any run and hit CHECK IN — your streak starts that day.</p>
      <div class="welcome-next-run">
        <span class="welcome-next-day">${nextRun.label}</span>
        <span class="welcome-next-detail">${nextRun.location} · ${nextRun.time}</span>
      </div>
    </div>
    ` : `
    ${renderStreakSaverBanner(stats)}

    <!-- Streak Bar -->
    <div class="streak-bar" onclick="navigateTo('stats')">
      <div class="streak-info">
        <span class="streak-flame" style="color: var(--color-secondary); font-family: var(--font-display); font-weight: 800;">&#9650;</span>
        <span class="streak-count">${stats.streak}</span>
        <span class="streak-label">Week Streak</span>
      </div>
      <div class="streak-dots">
        ${stats.weekHistory.map(w => `<div class="streak-dot ${w ? 'filled' : ''}"></div>`).join('')}
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="quick-stats-row">
      <div class="quick-stat-card">
        <div class="quick-stat-value">${stats.totalCheckIns || 0}</div>
        <div class="quick-stat-label">Check-ins</div>
      </div>
      <div class="quick-stat-card">
        <div class="quick-stat-value">${stats.totalMiles || 0}</div>
        <div class="quick-stat-label">Miles</div>
      </div>
      <div class="quick-stat-card">
        <div class="quick-stat-value">${stats.streak || 0}</div>
        <div class="quick-stat-label">Streak</div>
      </div>
    </div>
    `}

    <!-- Monthly Challenge -->
    ${(() => {
      const challenge = getCurrentChallenge();
      const progress = getChallengeProgress(challenge, stats.checkIns, stats.streak);
      return renderChallengeCard(challenge, progress, true);
    })()}

    <!-- Community Highlights -->
    ${highlights.length > 0 ? `
    <div class="highlights-section">
      <h3>Community</h3>
      <div class="highlights-scroll">
        ${highlights.map((h, i) => {
          const covers = [
            './assets/photos/night-sprint.jpg',
            './assets/photos/solo-skyline.jpg',
            './assets/photos/low-angle-alley.jpg',
            './assets/photos/solo-neon.jpg',
            './assets/photos/above-night.jpg',
            './assets/photos/motion-brick.jpg',
            './assets/photos/pack-street.jpg',
            './assets/photos/duo-women.jpg',
            './assets/photos/hero.jpg',
            './assets/photos/low-angle-urban.jpg',
            './assets/photos/above-crowd.jpg',
            './assets/photos/motion-blur.jpg',
            './assets/photos/motion-night.jpg',
            './assets/photos/low-angle-film.jpg'
          ];
          const cover = covers[i % covers.length];
          return `
          <div class="highlight-card">
            <div class="highlight-cover" style="background-image: url('${cover}');"></div>
            <div class="highlight-body">
              <div class="highlight-icon">${h.icon}</div>
              <div class="highlight-text">${h.text}</div>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Upcoming Special Event -->
    ${upcomingEvent ? `
    <div class="upcoming-event-card" onclick="viewEventDetail('${upcomingEvent.id}')">
      ${upcomingEvent.cover_image_url ? `<img src="${upcomingEvent.cover_image_url}" alt="${escapeHtml(upcomingEvent.title)}">` : ''}
      <div class="upcoming-event-info">
        <h4>${escapeHtml(upcomingEvent.title)}</h4>
        <div class="upcoming-event-meta">
          <span>${formatDate(upcomingEvent.event_date)}</span>
          <span>${escapeHtml(upcomingEvent.location_name)}</span>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // Weather for the next run — fetched AFTER first paint so the API (up to a
  // 5s timeout) never blocks the home screen. Cached in-memory (30 min TTL).
  getRunWeather(nextRun, nextRunDate).then(weather => {
    const slot = document.getElementById('weather-slot');
    if (!slot || !weather) return;
    slot.innerHTML = `
      <div class="weather-card">
        <span class="weather-icon">${weather.icon}</span>
        <div class="weather-main">
          <div class="weather-temp">${weather.temp}°F</div>
          <div class="weather-label">${nextRun.label} ${nextRun.time} · ${weather.summary}</div>
        </div>
        <div class="weather-side">Feels ${weather.feels}°</div>
      </div>
    `;
  }).catch(() => {});

  // Start countdown timer
  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdown(nextRunDate);
  countdownInterval = setInterval(() => updateCountdown(nextRunDate), 10000);

  // Live roll call: keep the hero strip in sync with new check-ins while the
  // window is open. Safe to call on every refreshHome — subscribeRollCall
  // tears down the previous channel before re-subscribing.
  if (windowOpen) {
    subscribeRollCall(nextRun.eventType);
  } else if (rollCallChannel) {
    supabaseClient.removeChannel(rollCallChannel);
    rollCallChannel = null;
  }
}

// ===== LIVE ROLL CALL =====
// Who's locked in for today's run — shown in the hero while the check-in
// window is open, kept live via a realtime INSERT subscription.
async function getTodayRollCall(eventType) {
  const todayStr = chicagoDateStr();
  const dayStart = chicagoWallClockToDate(todayStr, 0, 0);
  const dayEnd = chicagoWallClockToDate(todayStr, 23, 59);
  const { data, error } = await supabaseClient
    .from('check_ins')
    .select('user_id, checked_in_at, users(display_name, avatar_url)')
    .eq('event_type', eventType)
    .gte('checked_in_at', dayStart.toISOString())
    .lte('checked_in_at', dayEnd.toISOString())
    .order('checked_in_at', { ascending: true });
  if (error) {
    console.warn('[rollcall]', error);
    return [];
  }
  return (data || []).filter(r => r.users?.display_name && !isBlocked(r.user_id));
}

function renderRollCallStrip(rows) {
  if (!rows.length) {
    return `<span class="rollcall-text rollcall-empty">Be the first to lock in</span>`;
  }
  const avatars = rows.slice(0, 5).map(r =>
    `<img src="${safeAvatarUrl(r.users?.avatar_url)}" class="avatar-sm rollcall-avatar" alt="">`
  ).join('');
  const names = rows.slice(0, 2).map(r => escapeHtml(r.users?.display_name || 'A runner'));
  let who;
  if (rows.length === 1) who = `${names[0]} is`;
  else if (rows.length === 2) who = `${names[0]}, ${names[1]} are`;
  else who = `${names[0]}, ${names[1]} + ${rows.length - 2} more are`;
  return `
    <div class="rollcall-avatars">${avatars}</div>
    <span class="rollcall-text">${who} <strong>LOCKED IN</strong></span>
  `;
}

function subscribeRollCall(eventType) {
  // Guard against duplicate subscriptions on repeated refreshHome calls —
  // always remove the existing channel before re-subscribing.
  if (rollCallChannel) {
    supabaseClient.removeChannel(rollCallChannel);
    rollCallChannel = null;
  }
  rollCallChannel = supabaseClient
    .channel('home-rollcall')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'check_ins',
      filter: `event_type=eq.${eventType}`
    }, async (payload) => {
      // Only react while Home is actually on screen — never touch the DOM
      // of a backgrounded screen.
      const screen = document.getElementById('screen-home');
      if (!screen || !screen.classList.contains('active')) return;
      const row = payload?.new;
      if (!row?.user_id || !row.checked_in_at) return;
      // Today's Chicago day only; hide blocked users; skip duplicates (the
      // user's OWN check-in also re-renders via refreshHome).
      if (chicagoDateStr(new Date(row.checked_in_at)) !== chicagoDateStr()) return;
      if (isBlocked(row.user_id)) return;
      if (_rollCallRows.some(r => r.user_id === row.user_id)) return;
      // Realtime payloads carry no join — fetch the runner's display info
      const { data: user, error } = await supabaseClient
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', row.user_id)
        .maybeSingle();
      if (error || !user?.display_name) return;
      // Re-check after the await — a refreshHome may have re-rendered meanwhile
      if (_rollCallRows.some(r => r.user_id === row.user_id)) return;
      _rollCallRows.push({ user_id: row.user_id, users: user });
      const strip = document.getElementById('home-rollcall');
      if (strip) strip.innerHTML = renderRollCallStrip(_rollCallRows);
    })
    .subscribe();
}

// ===== STREAK SAVER =====
// The streak is genuinely at risk when: streak >= 2, nothing logged in the
// current Chicago week, and at least one weekly run is still ahead this week.
function getStreakSaverRun(stats) {
  if (!stats || stats.streak < 2) return null;
  const weekKey = getWeekStart(chicagoDay(new Date())).toISOString().split('T')[0];
  const checkedInThisWeek = (stats.checkIns || []).some(ci =>
    getWeekStart(chicagoDay(ci.checked_in_at)).toISOString().split('T')[0] === weekKey);
  if (checkedInThisWeek) return null;
  // Runs whose next occurrence still lands inside the current Chicago week
  // (getNextRunDate keeps today's run selected until Chicago midnight)
  const candidates = WEEKLY_RUNS
    .map(run => ({ run, date: getNextRunDate(run.dayOfWeek) }))
    .filter(rd => getWeekStart(chicagoDay(rd.date)).toISOString().split('T')[0] === weekKey)
    .sort((a, b) => a.date - b.date);
  return candidates[0] || null;
}

function renderStreakSaverBanner(stats) {
  const saver = getStreakSaverRun(stats);
  if (!saver) return '';
  const dayName = saver.run.label.charAt(0) + saver.run.label.slice(1).toLowerCase();
  return `
    <div class="streak-saver-banner" role="button" tabindex="0" onclick="scrollHomeHeroIntoView()">
      <span class="streak-saver-flame" aria-hidden="true">\u{1F525}</span>
      <div class="streak-saver-body">
        <div class="streak-saver-title">Your ${stats.streak}-week streak is on the line</div>
        <div class="streak-saver-sub">${dayName} · ${saver.run.location} ${saver.run.time} is your shot</div>
      </div>
    </div>
  `;
}

function scrollHomeHeroIntoView() {
  const hero = document.querySelector('#screen-home .home-hero');
  if (!hero) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  hero.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function updateCountdown(targetDate) {
  const el = document.getElementById('home-countdown');
  if (!el) return;
  // Past the end of the run's Chicago day: stop ticking and roll the whole
  // home screen over to the next run (getNextRunDate keeps today's run
  // selected until Chicago midnight, so only refresh after that).
  if (new Date() > chicagoWallClockToDate(chicagoDateStr(targetDate), 23, 59)) {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    refreshHome();
    return;
  }
  const cd = formatCountdown(targetDate);

  if (cd.active) {
    el.innerHTML = `
      <div class="countdown-unit">
        <div class="countdown-value" style="color: var(--color-success);">LIVE</div>
        <div class="countdown-label">Now</div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="countdown-unit">
        <div class="countdown-value">${cd.days}</div>
        <div class="countdown-label">Days</div>
      </div>
      <div class="countdown-unit">
        <div class="countdown-value">${cd.hours}</div>
        <div class="countdown-label">Hours</div>
      </div>
      <div class="countdown-unit">
        <div class="countdown-value">${cd.minutes}</div>
        <div class="countdown-label">Min</div>
      </div>
    `;
  }
}

async function handleCheckIn(eventType) {
  const btn = document.querySelector('.btn-checkin');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking in...'; }
  try {
    const result = await checkIn(eventType);
    if (result) {
      showMilesSlider(result.id);
      await refreshHome();
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = 'CHECK IN';
    }
  } catch (err) {
    // checkIn() already shows an error toast — just restore the button.
    if (btn) { btn.disabled = false; btn.textContent = 'CHECK IN'; }
  }
}

async function getCommunityHighlights() {
  const highlights = [];

  // Recent check-in counts
  const tuesdayCount = await getCheckInCountForEvent('weekly_tuesday', 7);
  const saturdayCount = await getCheckInCountForEvent('weekly_saturday', 7);

  if (tuesdayCount > 0) {
    highlights.push({
      icon: 'TU',
      text: `<strong>${tuesdayCount}</strong> checked in at Deep Ellum this week`
    });
  }

  if (saturdayCount > 0) {
    highlights.push({
      icon: 'SA',
      text: `<strong>${saturdayCount}</strong> showed up at Fair Oaks this week`
    });
  }

  // Recent badges earned (by anyone)
  const { data: recentBadges } = await supabaseClient
    .from('badges')
    .select('badge_type, users(display_name)')
    .order('earned_at', { ascending: false })
    .limit(3);

  if (recentBadges) {
    recentBadges.forEach(b => {
      const def = BADGE_DEFINITIONS.find(d => d.type === b.badge_type);
      if (def && b.users) {
        highlights.push({
          icon: def.icon,
          text: `<strong>${escapeHtml(b.users.display_name)}</strong> earned ${escapeHtml(def.label)}`
        });
      }
    });
  }

  // Recent check-in activity — single query with user join (no N+1)
  const { data: recentCheckIns } = await supabaseClient
    .from('check_ins')
    .select('user_id, checked_in_at, event_type, users(display_name)')
    .order('checked_in_at', { ascending: false })
    .limit(10);

  if (recentCheckIns) {
    const seenUsers = new Set();
    for (const ci of recentCheckIns) {
      if (!ci.users?.display_name) continue;
      if (seenUsers.has(ci.user_id)) continue;
      seenUsers.add(ci.user_id);
      highlights.push({
        icon: 'RU',
        text: `<strong>${escapeHtml(ci.users.display_name)}</strong> just checked in`
      });
    }
  }

  return highlights;
}
