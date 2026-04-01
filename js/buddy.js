// ===== RUN BUDDY FEATURE =====
let buddyChannel = null;

async function openBuddyBoard(runDay, runDate) {
  if (buddyChannel) {
    supabaseClient.removeChannel(buddyChannel);
  }
  const container = document.getElementById('screen-buddy-board');

  // Get buddy requests for this run
  const { data: requests } = await supabase
    .from('buddy_requests')
    .select('*, users(display_name, avatar_url, pace_group)')
    .eq('run_day', runDay)
    .eq('run_date', runDate)
    .order('created_at', { ascending: false });

  // Check if current user already has a request
  const myRequest = (requests || []).find(r => r.user_id === currentProfile.id);

  // Sort: same pace group first
  const sorted = [...(requests || [])].sort((a, b) => {
    const aMatch = a.users?.pace_group === currentProfile.pace_group ? 0 : 1;
    const bMatch = b.users?.pace_group === currentProfile.pace_group ? 0 : 1;
    return aMatch - bMatch;
  });

  const dayLabel = runDay === 'tuesday' ? 'Tuesday — Deep Ellum' : 'Saturday — Fair Oaks';

  container.innerHTML = `
    <button class="auth-back" onclick="navigateTo('events')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Events
    </button>

    <h2 style="margin-bottom: var(--space-xs);">Run Buddies</h2>
    <p style="margin-bottom: var(--space-lg);">${dayLabel} \u00B7 ${formatDate(runDate)}</p>

    ${!myRequest ? `
      <div class="card" style="margin-bottom: var(--space-lg);">
        <h3 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal; font-size: 1rem; margin-bottom: var(--space-sm);">Looking for someone to run with?</h3>
        <div class="form-group">
          <input class="form-input" type="text" id="buddy-intro" placeholder="e.g. First time here, a little nervous!" maxlength="100">
        </div>
        <button class="btn-primary" onclick="createBuddyRequest('${runDay}', '${runDate}')">
          \u{1F91D} Add Me to the Board
        </button>
      </div>
    ` : `
      <div class="card" style="margin-bottom: var(--space-lg); border: 1px solid var(--color-primary);">
        <p style="color: var(--color-primary); font-weight: 600;">\u2713 You're on the board!</p>
        ${myRequest.matched_with ? `<p style="font-size: 0.875rem; margin-top: var(--space-xs);">Matched with a buddy — see you there!</p>` : `<p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: var(--space-xs);">Waiting for a match...</p>`}
      </div>
    `}

    <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
      ${sorted.filter(r => r.user_id !== currentProfile.id).map(r => `
        <div class="card" style="display: flex; align-items: flex-start; gap: var(--space-md); ${r.matched_with ? 'opacity: 0.5;' : ''}">
          <img src="${r.users?.avatar_url || DEFAULT_AVATAR}" class="avatar-md" alt="${r.users?.display_name}">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: 2px;">
              <strong style="font-size: 0.875rem;">${r.users?.display_name || 'Member'}</strong>
              ${paceGroupBadgeHTML(r.users?.pace_group)}
            </div>
            ${r.intro_line ? `<p style="font-size: 0.875rem; margin-bottom: var(--space-sm);">${escapeHtml(r.intro_line)}</p>` : ''}
            ${r.matched_with ? `
              <span style="font-size: 0.75rem; color: var(--color-success);">\u2713 Matched</span>
            ` : `
              <button class="btn-primary btn-sm" onclick="matchWithBuddy('${r.id}', '${r.user_id}', '${runDay}', '${runDate}')">
                Run Together
              </button>
            `}
          </div>
        </div>
      `).join('')}

      ${sorted.filter(r => r.user_id !== currentProfile.id).length === 0 ? `
        <div class="empty-state">
          <p>You'd be the first on the board. Drop your name and someone will match with you before the run.</p>
        </div>
      ` : ''}
    </div>
  `;

  navigateToSub('buddy-board');

  // Subscribe to realtime updates
  buddyChannel = supabaseClient
    .channel(`buddy-${runDay}-${runDate}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'buddy_requests',
      filter: `run_day=eq.${runDay}` }, () => {
      openBuddyBoard(runDay, runDate);
    })
    .subscribe();
}

async function createBuddyRequest(runDay, runDate) {
  const introLine = document.getElementById('buddy-intro')?.value.trim() || null;

  try {
    await supabaseClient.from('buddy_requests').insert({
      user_id: currentProfile.id,
      run_day: runDay,
      run_date: runDate,
      intro_line: introLine
    });
    showToast("You're on the board! We'll notify you when someone matches.", 'success');
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    showToast("Couldn't add you to the board — try again.", 'error');
  }
}

async function matchWithBuddy(requestId, otherUserId, runDay, runDate) {
  try {
    // Update the other person's request (only if not already matched — race condition guard)
    const { data, error } = await supabase
      .from('buddy_requests')
      .update({ matched_with: currentProfile.id })
      .eq('id', requestId)
      .is('matched_with', null)
      .select()
      .single();

    if (!data) {
      showToast('Someone else already matched with them!', 'info');
      openBuddyBoard(runDay, runDate);
      return;
    }

    // Create our own request if we don't have one, and mark matched
    const { data: myRequest } = await supabase
      .from('buddy_requests')
      .select('id')
      .eq('user_id', currentProfile.id)
      .eq('run_day', runDay)
      .eq('run_date', runDate)
      .maybeSingle();

    if (myRequest) {
      await supabaseClient.from('buddy_requests').update({
        matched_with: otherUserId
      }).eq('id', myRequest.id);
    } else {
      await supabaseClient.from('buddy_requests').insert({
        user_id: currentProfile.id,
        run_day: runDay,
        run_date: runDate,
        matched_with: otherUserId
      });
    }

    // Get the other user's name
    const otherUser = await getUserProfile(otherUserId);
    const dayLabel = runDay === 'tuesday' ? 'Tuesday at Deep Ellum' : 'Saturday at Fair Oaks';
    showToast(`You and ${otherUser.display_name} are running together ${dayLabel}!`, 'success');

    openBuddyBoard(runDay, runDate);
  } catch (err) {
    showToast("Match didn't go through — give it one more shot.", 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
