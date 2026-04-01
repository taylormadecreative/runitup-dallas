// ===== HOME SCREEN =====
let countdownInterval = null;

function cleanupHome() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

async function initHome() {
  await refreshHome();
}

async function refreshHome() {
  const container = document.getElementById('screen-home');
  if (!currentProfile) return;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';

  // Determine next run (Monday, Tuesday, or Saturday — whichever is soonest)
  const runDates = WEEKLY_RUNS.map(run => ({
    run,
    date: getNextRunDate(run.dayOfWeek)
  }));
  runDates.sort((a, b) => a.date - b.date);
  const nextRun = runDates[0].run;
  const nextRunDate = runDates[0].date;

  // Get user stats
  const stats = await getUserStats(currentProfile.id);

  // Get check-in status for today
  const alreadyCheckedIn = await hasCheckedInToday(nextRun.eventType);
  const windowOpen = isCheckInWindow(nextRunDate);

  // Get last week's check-in count
  const lastCount = await getCheckInCountForEvent(nextRun.eventType, 7);

  // Get upcoming special event
  const { data: upcomingEvents } = await supabaseClient
    .from('special_events')
    .select('*, event_rsvps(count)')
    .gte('event_date', new Date().toISOString())
    .order('event_date')
    .limit(1);

  const upcomingEvent = upcomingEvents?.[0] || null;

  // Get community highlights
  const highlights = await getCommunityHighlights();

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
    <!-- Next Run Card -->
    <div class="next-run-card">
      <div class="next-run-label">Next Run</div>
      <div class="next-run-title">${nextRun.label} \u2014 <span>${nextRun.location}</span></div>
      <div class="countdown" id="home-countdown"></div>
      <div class="next-run-address">
        ${nextRun.address} \u00B7 <a href="${nextRun.mapsUrl}" target="_blank">Get Directions</a>
      </div>
      <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: var(--space-sm);">
        ${nextRun.time} \u00B7 ${nextRun.distance} \u00B7 ${lastCount} showed up last week
      </div>
      <button class="${checkInBtnClass}" ${checkInBtnDisabled}
        onclick="handleCheckIn('${nextRun.eventType}')">${checkInBtnText}</button>
    </div>

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

    <!-- Community Highlights -->
    ${highlights.length > 0 ? `
    <div class="highlights-section">
      <h3>Community</h3>
      <div class="highlights-scroll">
        ${highlights.map(h => `
          <div class="highlight-card">
            <div class="highlight-icon">${h.icon}</div>
            <div class="highlight-text">${h.text}</div>
          </div>
        `).join('')}
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

  // Start countdown timer
  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdown(nextRunDate);
  countdownInterval = setInterval(() => updateCountdown(nextRunDate), 10000);
}

function updateCountdown(targetDate) {
  const el = document.getElementById('home-countdown');
  if (!el) return;
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
    showToast("Check-in didn't go through — give it one more try.", 'error');
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

  return highlights;
}
