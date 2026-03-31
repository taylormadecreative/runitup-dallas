// ===== EVENTS SCREEN =====
let eventsView = 'list'; // 'list' or 'calendar'
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

async function initEvents() {
  await refreshEvents();
}

async function refreshEvents() {
  const container = document.getElementById('screen-events');
  if (!currentProfile) return;

  // Get weekly run stats
  const tuesdayCount = await getCheckInCountForEvent('weekly_tuesday', 7);
  const saturdayCount = await getCheckInCountForEvent('weekly_saturday', 7);

  // Get buddy counts for next runs
  const nextTuesdayDate = getNextRunDate(2).toISOString().split('T')[0];
  const nextSaturdayDate = getNextRunDate(6).toISOString().split('T')[0];

  const { count: tuesdayBuddies } = await supabase
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('run_day', 'tuesday')
    .eq('run_date', nextTuesdayDate)
    .is('matched_with', null);

  const { count: saturdayBuddies } = await supabase
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('run_day', 'saturday')
    .eq('run_date', nextSaturdayDate)
    .is('matched_with', null);

  // Get check-in status
  const tuesdayChecked = await hasCheckedInToday('weekly_tuesday');
  const saturdayChecked = await hasCheckedInToday('weekly_saturday');

  // Get special events
  const { data: specialEvents } = await supabase
    .from('special_events')
    .select('*')
    .order('event_date');

  const now = new Date();
  const upcoming = (specialEvents || []).filter(e => new Date(e.event_date) >= now);
  const past = (specialEvents || []).filter(e => new Date(e.event_date) < now);

  // Get RSVP counts
  const rsvpCounts = {};
  if (specialEvents?.length) {
    const { data: rsvps } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', specialEvents.map(e => e.id));
    (rsvps || []).forEach(r => {
      rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] || 0) + 1;
    });
  }

  container.innerHTML = `
    <!-- Weekly Runs -->
    <div>
      <div class="events-section-header">
        <h2>Weekly Runs</h2>
      </div>
      <div class="weekly-runs">
        ${renderWeeklyRunCard(WEEKLY_RUNS[0], tuesdayCount, tuesdayBuddies || 0, tuesdayChecked, nextTuesdayDate)}
        ${renderWeeklyRunCard(WEEKLY_RUNS[1], saturdayCount, saturdayBuddies || 0, saturdayChecked, nextSaturdayDate)}
      </div>
    </div>

    <!-- Special Events -->
    <div>
      <div class="events-section-header">
        <h2>Special Events</h2>
        <div class="calendar-toggle">
          <button class="${eventsView === 'list' ? 'active' : ''}" onclick="setEventsView('list')">List</button>
          <button class="${eventsView === 'calendar' ? 'active' : ''}" onclick="setEventsView('calendar')">Calendar</button>
        </div>
      </div>

      ${eventsView === 'list' ? `
        <div class="special-events">
          ${upcoming.length === 0 && past.length === 0 ? `
            <div class="empty-state">
              <p>No special events on the calendar yet. Weekly runs are still going strong — pull up Tuesday or Saturday!</p>
            </div>
          ` : ''}
          ${upcoming.map(e => renderSpecialEventCard(e, rsvpCounts[e.id] || 0, false)).join('')}
          ${past.length > 0 ? `
            <h3 style="color: var(--color-text-muted); font-size: 0.875rem; font-family: var(--font-body); text-transform: uppercase; letter-spacing: 0.1em; margin-top: var(--space-sm);">Past Events</h3>
            ${past.map(e => renderSpecialEventCard(e, rsvpCounts[e.id] || 0, true)).join('')}
          ` : ''}
        </div>
      ` : renderCalendarView(specialEvents || [])}
    </div>
  `;
}

function renderWeeklyRunCard(run, lastCount, buddyCount, checkedIn, nextDate) {
  const nextRunDate = getNextRunDate(run.dayOfWeek);
  const windowOpen = isCheckInWindow(nextRunDate);

  let btnHtml = '';
  if (checkedIn) {
    btnHtml = `<button class="btn-primary btn-sm checked" disabled>✓ Checked In</button>`;
  } else if (windowOpen) {
    btnHtml = `<button class="btn-primary btn-sm" onclick="handleCheckIn('${run.eventType}')">Check In</button>`;
  } else {
    btnHtml = `<button class="btn-primary btn-sm" disabled>Check In</button>`;
  }

  return `
    <div class="weekly-run-card">
      <div class="weekly-run-header">
        <span class="weekly-run-day">${run.label}</span>
        <span class="weekly-run-time">${run.time}</span>
      </div>
      <div class="weekly-run-details">
        📍 ${run.location} · ${run.distance} · <a href="${run.mapsUrl}" target="_blank">Directions</a>
      </div>
      <div class="weekly-run-stats">${lastCount} showed up last week</div>
      <div class="weekly-run-actions">
        ${btnHtml}
        <button class="btn-buddy" onclick="openBuddyBoard('${run.day}', '${nextDate}')">
          🤝 Looking for a buddy?
        </button>
      </div>
      ${buddyCount > 0 ? `<div class="buddy-count">${buddyCount} looking for a buddy</div>` : ''}
    </div>
  `;
}

function renderSpecialEventCard(event, rsvpCount, isPast) {
  return `
    <div class="special-event-card" onclick="viewEventDetail('${event.id}')">
      ${event.cover_image_url ? `<img src="${event.cover_image_url}" alt="${event.title}">` : ''}
      <div class="special-event-body">
        <h3>${event.title}</h3>
        <div class="special-event-meta">
          <span>📅 ${formatDate(event.event_date)} · ${formatTime(event.event_date)}</span>
          <span>📍 ${event.location_name}</span>
        </div>
        <div class="special-event-actions">
          <div class="rsvp-count"><strong>${rsvpCount}</strong> going</div>
          ${!isPast ? `<button class="btn-primary btn-sm btn-orange" onclick="event.stopPropagation(); toggleRSVP('${event.id}')">RSVP</button>` : `<span style="font-size: 0.75rem; color: var(--color-text-muted);">Event ended</span>`}
        </div>
      </div>
    </div>
  `;
}

function renderCalendarView(events) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6; // Monday = 0

  const today = new Date();

  let daysHtml = dayLabels.map(d => `<div class="calendar-day-label">${d}</div>`).join('');

  // Empty cells for days before month starts
  for (let i = 0; i < startDay; i++) {
    daysHtml += `<div class="calendar-day"></div>`;
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(calendarYear, calendarMonth, day);
    const dow = date.getDay();
    const isToday = date.toDateString() === today.toDateString();
    const isTuesday = dow === 2;
    const isSaturday = dow === 6;
    const hasSpecialEvent = events.some(e => new Date(e.event_date).toDateString() === date.toDateString());

    let dotHtml = '';
    if (isTuesday || isSaturday) dotHtml += `<div class="cal-dot weekly"></div>`;
    if (hasSpecialEvent) dotHtml += `<div class="cal-dot special" style="left: calc(50% + 4px);"></div>`;

    daysHtml += `<div class="calendar-day ${isToday ? 'today' : ''}">${day}${dotHtml}</div>`;
  }

  return `
    <div class="mini-calendar">
      <div class="calendar-header">
        <h3>${monthNames[calendarMonth]} ${calendarYear}</h3>
        <div class="calendar-nav">
          <button onclick="changeCalendarMonth(-1)">‹</button>
          <button onclick="changeCalendarMonth(1)">›</button>
        </div>
      </div>
      <div class="calendar-grid">${daysHtml}</div>
    </div>
  `;
}

function setEventsView(view) {
  eventsView = view;
  refreshEvents();
}

function changeCalendarMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  refreshEvents();
}

async function toggleRSVP(eventId) {
  if (!currentProfile) return;

  const { data: existing } = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', currentProfile.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('event_rsvps').delete().eq('id', existing.id);
    showToast('RSVP removed', 'info');
  } else {
    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      user_id: currentProfile.id
    });
    showToast("Locked in! See you out there — let's run it up!", 'success');
  }

  refreshEvents();
}

async function viewEventDetail(eventId) {
  const { data: event } = await supabase
    .from('special_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) return;

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('user_id, users(display_name, avatar_url)')
    .eq('event_id', eventId);

  const { data: photos } = await supabase
    .from('event_photos')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  const isPast = new Date(event.event_date) < new Date();
  const userRsvp = (rsvps || []).find(r => r.user_id === currentProfile?.id);

  const container = document.getElementById('screen-event-detail');
  container.innerHTML = `
    <button class="auth-back" onclick="navigateTo('events')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Events
    </button>
    ${event.cover_image_url ? `<img src="${event.cover_image_url}" alt="${event.title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: var(--space-md);">` : ''}
    <h2 style="margin-bottom: var(--space-sm);">${event.title}</h2>
    <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: var(--space-md);">
      📅 ${formatDate(event.event_date)} · ${formatTime(event.event_date)}<br>
      📍 ${event.location_name} — ${event.location_address}
      <br><a href="https://maps.google.com/?q=${encodeURIComponent(event.location_address)}" target="_blank" style="color: var(--color-primary);">Get Directions</a>
    </div>
    ${event.description ? `<p style="margin-bottom: var(--space-lg);">${event.description}</p>` : ''}

    ${!isPast ? `
      <button class="btn-primary ${userRsvp ? 'btn-orange' : ''}" onclick="toggleRSVP('${event.id}'); viewEventDetail('${event.id}');">
        ${userRsvp ? "Cancel RSVP" : "RSVP — I'm Going!"}
      </button>
    ` : ''}

    <div style="margin-top: var(--space-lg);">
      <h3 style="font-size: 0.875rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm);">
        ${(rsvps || []).length} Going
      </h3>
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm);">
        ${(rsvps || []).map(r => `
          <div style="display: flex; align-items: center; gap: var(--space-xs); background: var(--color-surface); padding: 4px 8px; border-radius: var(--radius-full); font-size: 0.75rem;">
            <img src="${r.users?.avatar_url || ''}" class="avatar-sm" style="width: 20px; height: 20px;" alt="">
            ${r.users?.display_name || 'Member'}
          </div>
        `).join('')}
      </div>
    </div>

    ${isPast && (photos || []).length > 0 ? `
      <div style="margin-top: var(--space-lg);">
        <h3 style="font-size: 0.875rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm);">
          Photos
        </h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-xs);">
          ${(photos || []).map(p => `<img src="${p.photo_url}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm);">`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  navigateToSub('event-detail');
}
