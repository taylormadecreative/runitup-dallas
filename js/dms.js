// ===== DIRECT MESSAGES (1:1) =====
let activeDmThreadId = null;
let activeDmOtherUser = null;
let dmSubscription = null;

async function openDmInbox() {
  const container = document.getElementById('screen-dm-inbox');
  if (!container || !currentProfile) return;
  if (!container.innerHTML || container.querySelector('.loading-screen')) {
    container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  }

  // Single-query inbox via RPC (no more N+1)
  const { data: inbox, error } = await supabaseClient.rpc('get_dm_inbox');
  if (error) {
    console.error('[dm] inbox load', error);
    container.innerHTML = '<div class="empty-state"><p>Could not load messages.</p></div>';
    return;
  }
  const rows = (inbox || []).map(r => ({
    thread: { id: r.thread_id },
    otherUser: { id: r.other_user_id, display_name: r.other_display_name, avatar_url: r.other_avatar_url, pace_group: r.other_pace_group },
    lastMsg: r.last_message_content ? { content: r.last_message_content, created_at: r.last_message_at, user_id: r.last_message_from } : null,
    unread: Number(r.unread_count) || 0
  }));

  container.innerHTML = `
    <button class="auth-back" onclick="navigateTo('community')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>
    <h2 style="margin-bottom: var(--space-sm);">Direct Messages</h2>
    <p style="margin-bottom: var(--space-lg); color: var(--color-text-muted); font-size: 0.875rem;">Private 1:1 conversations with other runners.</p>

    ${rows.length === 0 ? `
      <div class="empty-state">
        <p>No DMs yet. Tap any runner's avatar in chat to start a private conversation.</p>
      </div>
    ` : `
      <div class="dm-inbox-list">
        ${rows.map(r => `
          <div class="dm-inbox-row" role="button" tabindex="0" aria-label="Open conversation with ${escapeAttr(r.otherUser?.display_name || 'member')}" onclick="openDmThread('${r.thread.id}', '${r.otherUser?.id || ''}')">
            <img src="${safeAvatarUrl(r.otherUser?.avatar_url)}" class="avatar-md" alt="">
            <div class="dm-inbox-row-main">
              <div class="dm-inbox-row-top">
                <strong>${escapeHtml(r.otherUser?.display_name || 'Member')}</strong>
                ${r.lastMsg ? `<span class="dm-inbox-row-time">${formatRelativeTime(r.lastMsg.created_at)}</span>` : ''}
              </div>
              <div class="dm-inbox-row-preview">
                ${r.lastMsg ? `${r.lastMsg.user_id === currentProfile.id ? 'You: ' : ''}${escapeHtml((r.lastMsg.content || '').slice(0, 80))}` : '<em>Say hi.</em>'}
              </div>
            </div>
            ${r.unread > 0 ? `<span class="badge dm-unread-badge">${r.unread}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `}
  `;
  navigateToSub('dm-inbox');
}

async function openDmThread(threadId, otherUserId) {
  if (dmSubscription) {
    try { await supabaseClient.removeChannel(dmSubscription); } catch {}
    dmSubscription = null;
  }
  activeDmThreadId = threadId;
  const container = document.getElementById('screen-dm-thread');
  if (!container) return;

  const [otherUser, messagesRes] = await Promise.all([
    otherUserId ? getUserProfile(otherUserId).catch(() => null) : Promise.resolve(null),
    supabaseClient.from('dm_messages')
      .select('*, users:user_id(display_name, avatar_url, pace_group)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(100)
  ]);
  activeDmOtherUser = otherUser;
  const messages = (messagesRes.data || []).reverse();

  container.innerHTML = `
    <div class="chat-header">
      <button class="auth-back" onclick="closeDmThread();openDmInbox()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Back
      </button>
      <div class="dm-thread-header" role="button" tabindex="0" aria-label="View profile" onclick="viewMemberProfile('${otherUserId}')">
        <img src="${safeAvatarUrl(otherUser?.avatar_url)}" class="avatar-sm" alt="">
        <div>
          <strong>${escapeHtml(otherUser?.display_name || 'Member')}</strong>
          ${paceGroupBadgeHTML(otherUser?.pace_group)}
        </div>
      </div>
      <button class="dm-header-menu" onclick="openDmThreadMenu('${threadId}','${otherUserId}')" aria-label="Options">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
      </button>
    </div>

    <div class="chat-messages" id="dm-messages">
      ${messages.map(m => renderDmMessage(m)).join('')}
    </div>
    <div class="chat-input-row">
      <input type="text" class="chat-input" id="dm-input" placeholder="Message ${escapeHtml(otherUser?.display_name || '')}..."
        onkeydown="if(event.key==='Enter')sendDmMessage()">
      <button class="chat-send-btn" onclick="sendDmMessage()" aria-label="Send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;
  navigateToSub('dm-thread');

  // Mark unread messages as read
  try {
    await supabaseClient.from('dm_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .neq('user_id', currentProfile.id)
      .is('read_at', null);
  } catch {}

  // Scroll to bottom
  setTimeout(() => {
    const m = document.getElementById('dm-messages');
    if (m) m.scrollTop = m.scrollHeight;
  }, 50);

  // Realtime
  dmSubscription = supabaseClient
    .channel(`dm-${threadId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'dm_messages',
      filter: `thread_id=eq.${threadId}`
    }, async (payload) => {
      const user = await getUserProfile(payload.new.user_id).catch(() => null);
      const msg = { ...payload.new, users: user };
      const m = document.getElementById('dm-messages');
      if (m) {
        m.insertAdjacentHTML('beforeend', renderDmMessage(msg));
        m.scrollTop = m.scrollHeight;
      }
      // Only mark as read if the user is actually viewing this thread
      const threadScreenActive = document.getElementById('screen-dm-thread')?.classList.contains('active');
      if (payload.new.user_id !== currentProfile.id && activeDmThreadId === threadId && threadScreenActive) {
        try {
          await supabaseClient.from('dm_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', payload.new.id);
        } catch {}
      }
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'dm_messages',
      filter: `thread_id=eq.${threadId}`
    }, (payload) => {
      document.querySelector(`[data-dm-id="${payload.old.id}"]`)?.remove();
    })
    .subscribe();
}

function renderDmMessage(msg) {
  const isMine = msg.user_id === currentProfile?.id;
  return `
    <div class="message-row ${isMine ? 'mine' : ''}" data-dm-id="${msg.id}">
      <img src="${safeAvatarUrl(msg.users?.avatar_url)}" class="avatar-sm message-avatar" alt="">
      <div>
        <div class="message-bubble">
          ${escapeHtml(msg.content)}
          ${isMine ? `<button class="message-delete-btn" onclick="deleteDmMessage('${msg.id}')" aria-label="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
        </div>
        <div class="message-time">${formatRelativeTime(msg.created_at)}</div>
      </div>
    </div>
  `;
}

async function sendDmMessage() {
  const input = document.getElementById('dm-input');
  const content = input?.value.trim();
  if (!content || !activeDmThreadId) return;
  if (content.length > 2000) { showToast('Too long — max 2000 chars.', 'error'); return; }
  input.value = '';
  try {
    const { error } = await supabaseClient.from('dm_messages').insert({
      thread_id: activeDmThreadId,
      user_id: currentProfile.id,
      content
    });
    if (error) throw error;
    // Touch last_message_at
    const { error: touchErr } = await supabaseClient.from('dm_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeDmThreadId);
    if (touchErr) console.error('[dm] touch thread', touchErr);
  } catch (err) {
    console.error('[dm] send', err);
    showToast('Message didn\'t send — try again.', 'error');
    input.value = content;
  }
}

async function deleteDmMessage(messageId) {
  if (!(await confirmNative('Delete this message?', 'Delete', 'Keep'))) return;
  const { error } = await supabaseClient.from('dm_messages').delete().eq('id', messageId);
  if (error) { showToast('Could not delete.', 'error'); return; }
  document.querySelector(`[data-dm-id="${messageId}"]`)?.remove();
}

async function startDmWith(otherUserId) {
  if (guardGuest('direct messages')) return;
  if (!otherUserId || otherUserId === currentProfile?.id) return;
  const { data, error } = await supabaseClient.rpc('get_or_create_dm_thread', { other_user: otherUserId });
  if (error || !data) {
    console.error('[dm] create', error);
    showToast('Could not open DM — try again.', 'error');
    return;
  }
  await openDmThread(data, otherUserId);
}

async function openDmThreadMenu(threadId, otherUserId) {
  const menu = document.createElement('div');
  menu.className = 'confirm-overlay';
  menu.innerHTML = `
    <div class="confirm-modal" style="max-width: 320px;">
      <div style="font-family: var(--font-display); font-weight: 800; font-size: 1rem; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-md);">Conversation Options</div>
      <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
        <button class="btn-secondary" data-choice="profile">View Profile</button>
        <button class="btn-secondary" data-choice="mute" disabled title="Coming soon">Mute Notifications</button>
        <button class="btn-secondary" data-choice="report" style="color: var(--color-warning, #F59E0B);">Report</button>
        <button class="btn-secondary" data-choice="block" style="color: var(--color-error, #EF4444);">Block User</button>
        <button class="btn-secondary btn-sm" data-choice="cancel" style="margin-top: var(--space-sm);">Cancel</button>
      </div>
    </div>
  `;
  const cleanup = () => menu.remove();
  menu.onclick = (e) => {
    if (e.target === menu || e.target.dataset.choice === 'cancel') { cleanup(); return; }
    const choice = e.target.dataset.choice;
    if (!choice) return;
    cleanup();
    if (choice === 'profile') viewMemberProfile(otherUserId);
    else if (choice === 'block') blockDmUser(otherUserId);
    else if (choice === 'report') reportDmUser(otherUserId);
  };
  document.body.appendChild(menu);
}

async function blockDmUser(otherUserId) {
  if (!(await confirmNative("Block this user? They won't be able to message you. You can unblock later from Profile settings.", 'Block', 'Cancel'))) return;
  try {
    const { error } = await supabaseClient.from('user_blocks').insert({
      blocker_id: currentProfile.id,
      blocked_id: otherUserId
    });
    if (error && !error.message?.includes('duplicate')) throw error;
    showToast('User blocked.', 'info');
    haptic('warning');
    closeDmThread();
    openDmInbox();
  } catch (err) {
    console.error('[dm] block', err);
    showToast('Could not block — try again.', 'error');
  }
}

async function reportDmUser(otherUserId) {
  const reason = await pickReportReason();
  if (!reason) return;
  try {
    const { error } = await supabaseClient.from('user_reports').insert({
      reporter_id: currentProfile.id,
      reported_id: otherUserId,
      reason: reason.key,
      notes: reason.notes || null
    });
    if (error) throw error;
    showToast('Thanks — we\'ll review this report.', 'success');
    haptic('success');
    // Offer to block too, if they haven't
    if (!isBlockingByMe(otherUserId)) {
      if (await confirmNative('Also block this user so you won\'t hear from them again?', 'Block Too', 'Just Report')) {
        await blockDmUser(otherUserId);
      }
    }
  } catch (err) {
    console.error('[report]', err);
    showToast('Could not submit report — try again.', 'error');
  }
}

function pickReportReason() {
  return new Promise((resolve) => {
    const REASONS = [
      { key: 'spam', label: 'Spam or scams' },
      { key: 'harassment', label: 'Harassment or bullying' },
      { key: 'inappropriate', label: 'Inappropriate content' },
      { key: 'impersonation', label: 'Pretending to be someone else' },
      { key: 'threats', label: 'Threats or violence' },
      { key: 'other', label: 'Something else' }
    ];
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal" style="max-width: 360px;">
        <div style="font-family: var(--font-display); font-weight: 800; font-size: 1rem; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-xs);">Report</div>
        <p style="font-size: 0.8rem; color: var(--color-text-muted); text-align: center; margin-bottom: var(--space-md);">Why are you reporting this user?</p>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${REASONS.map(r => `<button class="btn-secondary" style="text-align: left; justify-content: flex-start;" data-reason="${r.key}">${escapeHtml(r.label)}</button>`).join('')}
          <button class="btn-secondary btn-sm" style="margin-top: var(--space-sm);" data-reason="cancel">Cancel</button>
        </div>
      </div>
    `;
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.onclick = (e) => {
      const key = e.target.closest('[data-reason]')?.dataset.reason;
      if (!key) return;
      if (key === 'cancel') return cleanup(null);
      cleanup({ key });
    };
    document.body.appendChild(overlay);
  });
}

function closeDmThread() {
  if (dmSubscription) {
    try { supabaseClient.removeChannel(dmSubscription); } catch {}
    dmSubscription = null;
  }
  activeDmThreadId = null;
}
