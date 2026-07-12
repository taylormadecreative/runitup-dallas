// ===== RUN BUDDY FEATURE =====
let buddyChannel = null;

async function openBuddyBoard(runDay, runDate) {
  if (buddyChannel) {
    supabaseClient.removeChannel(buddyChannel);
  }
  const container = document.getElementById('screen-buddy-board');

  // Get buddy requests for this run
  const { data: requests } = await supabaseClient
    .from('buddy_requests')
    .select('*, users(display_name, avatar_url, pace_group)')
    .eq('run_day', runDay)
    .eq('run_date', runDate)
    .order('created_at', { ascending: false });

  // Check if current user already has a request
  const myRequest = (requests || []).find(r => r.user_id === currentProfile.id);

  // If someone sent me a match request, fetch their profile for the card
  let pendingRequester = null;
  if (myRequest?.pending_request_from) {
    pendingRequester = await getUserProfile(myRequest.pending_request_from).catch(() => null);
  }

  // Sort: same pace group first
  const sorted = [...(requests || [])].sort((a, b) => {
    const aMatch = a.users?.pace_group === currentProfile.pace_group ? 0 : 1;
    const bMatch = b.users?.pace_group === currentProfile.pace_group ? 0 : 1;
    return aMatch - bMatch;
  });

  const dayLabel = runDay === 'monday' ? 'Monday — Trinity Groves'
    : runDay === 'tuesday' ? 'Tuesday — Deep Ellum'
    : runDay === 'saturday' ? 'Saturday — Fair Oaks'
    : 'Sunday — Levy Plaza';

  container.innerHTML = `
    <button class="auth-back" onclick="closeBuddyBoard()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Events
    </button>

    <h2 style="margin-bottom: var(--space-xs);">Run Buddies</h2>
    <p style="margin-bottom: var(--space-lg);">${dayLabel} \u00B7 ${formatDate(new Date(runDate + 'T12:00:00'))}</p>

    ${!myRequest ? `
      <div class="card" style="margin-bottom: var(--space-lg);">
        <h3 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal; font-size: 1rem; margin-bottom: var(--space-sm);">Looking for someone to run with?</h3>
        <div class="form-group">
          <input class="form-input" type="text" id="buddy-intro" placeholder="e.g. First time here, a little nervous!" maxlength="100">
        </div>
        <button class="btn-primary" onclick="createBuddyRequest(${jsArg(runDay)}, ${jsArg(runDate)})">
          ADD ME TO THE BOARD
        </button>
      </div>
    ` : `
      <div class="card" style="margin-bottom: var(--space-lg); border: 1px solid var(--color-primary);">
        <p style="color: var(--color-primary); font-weight: 600;">\u2713 You're on the board!</p>
        ${myRequest.matched_with ? `<p style="font-size: 0.875rem; margin-top: var(--space-xs);">Matched with a buddy — see you there!</p>`
          : pendingRequester ? `
            <div style="display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-sm); padding: var(--space-sm); background: rgba(191,255,0,0.08); border-radius: var(--radius-sm);">
              <img src="${safeAvatarUrl(pendingRequester.avatar_url)}" class="avatar-sm" alt="">
              <div style="flex: 1;">
                <strong style="font-size: 0.875rem;">${escapeHtml(pendingRequester.display_name)}</strong>
                ${paceGroupBadgeHTML(pendingRequester.pace_group)}
                <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px;">wants to run with you</div>
              </div>
            </div>
            <div style="display: flex; gap: var(--space-xs); margin-top: var(--space-sm);">
              <button class="btn-primary btn-sm" style="flex: 1;" onclick="acceptBuddyMatch(${jsArg(myRequest.id)}, ${jsArg(pendingRequester.id)}, ${jsArg(runDay)}, ${jsArg(runDate)})">Accept</button>
              <button class="btn-secondary btn-sm" style="flex: 1;" onclick="declineBuddyMatch(${jsArg(myRequest.id)}, ${jsArg(runDay)}, ${jsArg(runDate)})">Decline</button>
              <button class="btn-secondary btn-sm" style="color: var(--color-error); border-color: var(--color-error);" onclick="blockBuddyRequester(${jsArg(pendingRequester.id)}, ${jsArg(myRequest.id)}, ${jsArg(runDay)}, ${jsArg(runDate)})" title="Block">🚫</button>
            </div>
          ` : `<p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: var(--space-xs);">Waiting for a match...</p>`}
        <button class="btn-secondary btn-sm" style="margin-top: var(--space-sm); width: 100%;" onclick="cancelMyBuddyRequest(${jsArg(myRequest.id)}, ${jsArg(runDay)}, ${jsArg(runDate)})">Remove Me from the Board</button>
      </div>
    `}

    <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
      ${sorted.filter(r => r.user_id !== currentProfile.id && !(typeof isBlocked === 'function' && isBlocked(r.user_id))).map(r => `
        <div class="card" style="display: flex; align-items: flex-start; gap: var(--space-md); ${r.matched_with ? 'opacity: 0.5;' : ''}">
          <img src="${safeAvatarUrl(r.users?.avatar_url)}" class="avatar-md" alt="">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: 2px;">
              <strong style="font-size: 0.875rem;">${escapeHtml(r.users?.display_name || 'Member')}</strong>
              ${paceGroupBadgeHTML(r.users?.pace_group)}
            </div>
            ${r.intro_line ? `<p style="font-size: 0.875rem; margin-bottom: var(--space-sm);">${escapeHtml(r.intro_line)}</p>` : ''}
            ${r.matched_with ? `
              <span style="font-size: 0.75rem; color: var(--color-success);">\u2713 Matched</span>
            ` : r.pending_request_from === currentProfile.id ? `
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">Request sent · waiting for their reply</span>
            ` : r.pending_request_from ? `
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">Being reviewed</span>
            ` : `
              <button class="btn-primary btn-sm" onclick="sendBuddyMatchRequest(${jsArg(r.id)}, ${jsArg(r.user_id)}, ${jsArg(runDay)}, ${jsArg(runDate)})">
                Ask to Run Together
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
      filter: `run_day=eq.${runDay}` }, (payload) => {
      // Ignore changes for the same weekday on a different week
      const rowDate = payload?.new?.run_date || payload?.old?.run_date;
      if (rowDate && rowDate !== runDate) return;
      // Only re-render while the board is actually on screen — never yank
      // the user back here from another screen
      const screen = document.getElementById('screen-buddy-board');
      if (!screen || !screen.classList.contains('active')) return;
      openBuddyBoard(runDay, runDate);
    })
    .subscribe();
}

// Tear down the realtime channel when leaving the board (back button)
function closeBuddyBoard() {
  if (buddyChannel) {
    supabaseClient.removeChannel(buddyChannel);
    buddyChannel = null;
  }
  navigateTo('events');
}

async function createBuddyRequest(runDay, runDate) {
  if (guardGuest('the run buddy board')) return;
  const introLine = document.getElementById('buddy-intro')?.value.trim() || null;

  // Double-check we aren't already on the board for this run (belt-and-suspenders;
  // DB also enforces UNIQUE(user_id, run_day, run_date))
  const { data: existing } = await supabaseClient
    .from('buddy_requests')
    .select('id')
    .eq('user_id', currentProfile.id)
    .eq('run_day', runDay)
    .eq('run_date', runDate)
    .maybeSingle();
  if (existing) {
    showToast("You're already on the board for this run.", 'info');
    openBuddyBoard(runDay, runDate);
    return;
  }

  try {
    const { error } = await supabaseClient.from('buddy_requests').insert({
      user_id: currentProfile.id,
      run_day: runDay,
      run_date: runDate,
      intro_line: introLine
    });
    if (error) {
      // 23505 = unique_violation
      if (error.code === '23505') {
        showToast("You're already on the board for this run.", 'info');
      } else {
        throw error;
      }
    } else {
      showToast("You're on the board! We'll notify you when someone matches.", 'success');
      haptic('success');
    }
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    console.error('[buddy] create', err);
    showToast("Couldn't add you to the board — try again.", 'error');
  }
}

async function sendBuddyMatchRequest(targetRequestId, targetUserId, runDay, runDate) {
  if (guardGuest('the run buddy board')) return;
  try {
    // Ensure current user has a request on this run (auto-create if needed).
    // Handle unique violation gracefully in case of race.
    const { data: mine } = await supabaseClient
      .from('buddy_requests')
      .select('id')
      .eq('user_id', currentProfile.id)
      .eq('run_day', runDay)
      .eq('run_date', runDate)
      .maybeSingle();
    if (!mine) {
      const { error: insErr } = await supabaseClient.from('buddy_requests').insert({
        user_id: currentProfile.id,
        run_day: runDay,
        run_date: runDate,
        intro_line: null
      });
      if (insErr && insErr.code !== '23505') throw insErr;
    }
    // Send request — only if target has no pending request and isn't matched
    const { data, error } = await supabaseClient
      .from('buddy_requests')
      .update({ pending_request_from: currentProfile.id })
      .eq('id', targetRequestId)
      .is('matched_with', null)
      .is('pending_request_from', null)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      showToast('Someone else already asked them — try another runner.', 'info');
    } else {
      showToast("Request sent! We'll let you know when they reply.", 'success');
    }
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    console.error('[buddy] request', err);
    showToast('Could not send request — try again.', 'error');
  }
}

async function acceptBuddyMatch(myRequestId, requesterId, runDay, runDate) {
  if (guardGuest('the run buddy board')) return;
  try {
    // Atomic accept via RPC (updates both rows in one transaction)
    const { error } = await supabaseClient.rpc('accept_buddy_match', {
      p_my_request: myRequestId,
      p_other_user: requesterId
    });
    if (error) throw error;
    const otherUser = await getUserProfile(requesterId);
    const dayLabel = runDay === 'monday' ? 'Monday at Trinity Groves'
      : runDay === 'tuesday' ? 'Tuesday at Deep Ellum'
      : runDay === 'saturday' ? 'Saturday at Fair Oaks'
      : 'Sunday at Levy Plaza';
    showToast(`You and ${otherUser.display_name} are running together ${dayLabel}!`, 'success');
    haptic('success');
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    console.error('[buddy] accept', err);
    showToast("Couldn't accept — try again.", 'error');
  }
}

async function declineBuddyMatch(myRequestId, runDay, runDate) {
  try {
    await supabaseClient.from('buddy_requests').update({ pending_request_from: null }).eq('id', myRequestId);
    showToast('Declined.', 'info');
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    showToast("Couldn't decline — try again.", 'error');
  }
}

async function blockBuddyRequester(requesterId, myRequestId, runDay, runDate) {
  if (!(await confirmNative("Block this user? They won't be able to request to run with you again.", 'Block', 'Cancel'))) return;
  try {
    // blockUser() also updates _blockCache so the block takes effect immediately
    await blockUser(requesterId);
    await supabaseClient.from('buddy_requests').update({ pending_request_from: null }).eq('id', myRequestId);
    showToast('User blocked and request dismissed.', 'info');
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    console.error('[buddy] block', err);
    showToast('Could not block — try again.', 'error');
  }
}

// Legacy alias — routes to the new consent-based flow
const matchWithBuddy = sendBuddyMatchRequest;

async function cancelMyBuddyRequest(requestId, runDay, runDate) {
  if (!(await confirmNative('Take yourself off the board?', 'Remove', 'Stay on'))) return;
  const { error } = await supabaseClient
    .from('buddy_requests')
    .delete()
    .eq('id', requestId)
    .eq('user_id', currentProfile.id);
  if (error) {
    console.error('[cancelBuddy]', error);
    showToast("Could not remove — try again.", 'error');
    return;
  }
  showToast("You're off the board.", 'info');
  openBuddyBoard(runDay, runDate);
}

// Fetch the user's active buddy requests (for upcoming runs) and return a summary list
async function getMyActiveBuddyRequests() {
  if (!currentProfile) return [];
  const today = chicagoDateStr(); // Dallas-local day, not UTC (flips at 7 PM CT)
  const { data } = await supabaseClient
    .from('buddy_requests')
    .select('*')
    .eq('user_id', currentProfile.id)
    .gte('run_date', today)
    .order('run_date', { ascending: true });
  return data || [];
}

// escapeHtml is now defined in supabase.js (loaded first)
