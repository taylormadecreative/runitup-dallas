// ===== COMMUNITY / GROUP CHAT =====
let activeChannelId = null;
let activeChannelName = null;
let chatSubscription = null;
let lastReadTimestamps = {};

const CHANNEL_ICONS = {
  'monday-trinity-groves': 'MO',
  'tuesday-deep-ellum': 'TU',
  'saturday-fair-oaks': 'SA',
  'sunday-levy-plaza': 'SU',
  'trail-runs': 'TR',
  'walk-it-up': 'WK',
  'jog-it-up': 'JG',
  'run-it-up': 'RU',
  'sprint-it-up': 'SP',
  'general': 'GN',
  'newbies': 'NB',
  'post-run-pics': 'PP',
  'fit-check': 'FC'
};

const CHANNEL_COVERS = {
  'monday-trinity-groves': './assets/photos/motion-blur.webp',
  'tuesday-deep-ellum': './assets/photos/night-sprint.webp',
  'saturday-fair-oaks': './assets/photos/solo-skyline.webp',
  'sunday-levy-plaza': './assets/photos/low-angle-film.webp',
  'trail-runs': './assets/photos/solo-neon.webp',
  'walk-it-up': './assets/photos/duo-women.webp',
  'jog-it-up': './assets/photos/pack-street.webp',
  'run-it-up': './assets/photos/low-angle-alley.webp',
  'sprint-it-up': './assets/photos/motion-brick.webp',
  'general': './assets/photos/above-crowd.webp',
  'newbies': './assets/photos/low-angle-urban.webp',
  'post-run-pics': './assets/photos/above-night.webp',
  'fit-check': './assets/photos/hero.webp'
};

// Channel category drives the colored strip on the left of each row
// 'run' = lime green (run days), 'pace' = orange (pace groups), 'social' = white
const CHANNEL_CATEGORIES = {
  'monday-trinity-groves': 'run',
  'tuesday-deep-ellum': 'run',
  'saturday-fair-oaks': 'run',
  'sunday-levy-plaza': 'run',
  'trail-runs': 'run',
  'walk-it-up': 'pace',
  'jog-it-up': 'pace',
  'run-it-up': 'pace',
  'sprint-it-up': 'pace',
  'general': 'social',
  'newbies': 'social',
  'post-run-pics': 'social',
  'fit-check': 'social'
};

function getChannelCategory(name) {
  return CHANNEL_CATEGORIES[name] || 'social';
}

async function initCommunity() {
  // Load last-read timestamps from localStorage
  try {
    lastReadTimestamps = JSON.parse(localStorage.getItem('riu_last_read') || '{}');
  } catch { lastReadTimestamps = {}; }

  await refreshCommunity();
}

async function refreshCommunity() {
  const container = document.getElementById('screen-community');
  if (!currentProfile) return;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';

  // Get user's channels
  const { data: memberships } = await supabaseClient
    .from('channel_members')
    .select('channel_id, channels(id, name, type, description)')
    .eq('user_id', currentProfile.id);

  const channels = (memberships || []).map(m => m.channels).filter(Boolean);
  const channelIds = channels.map(ch => ch.id);

  // Batch: latest message per channel + unread rows — 2 queries total instead of 2 per channel
  const lastMsgByChannel = {};
  const unreadByChannel = {};
  if (channelIds.length) {
    const unreadFilter = channels
      .map(ch => `and(channel_id.eq.${ch.id},created_at.gt."${lastReadTimestamps[ch.id] || '1970-01-01'}")`)
      .join(',');

    const [{ data: lastMsgRows }, { data: unreadRows }] = await Promise.all([
      supabaseClient
        .from('channels')
        .select('id, messages(content, created_at, users(display_name))')
        .in('id', channelIds)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' }),
      supabaseClient
        .from('messages')
        .select('channel_id')
        .or(unreadFilter)
        .limit(1000)
    ]);

    (lastMsgRows || []).forEach(row => {
      lastMsgByChannel[row.id] = row.messages?.[0] || null;
    });
    (unreadRows || []).forEach(row => {
      unreadByChannel[row.channel_id] = (unreadByChannel[row.channel_id] || 0) + 1;
    });
  }

  const channelData = channels.map(ch => ({
    ...ch,
    lastMsg: lastMsgByChannel[ch.id] || null,
    unread: unreadByChannel[ch.id] || 0
  }));

  // Sort: channels with unread first, then by last message time
  channelData.sort((a, b) => {
    if (a.unread && !b.unread) return -1;
    if (!a.unread && b.unread) return 1;
    const aTime = a.lastMsg?.created_at || a.created_at || '';
    const bTime = b.lastMsg?.created_at || b.created_at || '';
    return bTime.localeCompare(aTime);
  });

  // Update community tab badge
  const totalUnread = channelData.reduce((sum, ch) => sum + ch.unread, 0);
  const communityBadge = document.getElementById('community-badge');
  if (communityBadge) {
    if (totalUnread > 0) {
      communityBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      communityBadge.classList.remove('hidden');
    } else {
      communityBadge.classList.add('hidden');
    }
  }

  // Count DM unread
  let dmUnread = 0;
  try {
    const { data: threads } = await supabaseClient
      .from('dm_threads')
      .select('id')
      .or(`user_a.eq.${currentProfile.id},user_b.eq.${currentProfile.id}`);
    if (threads?.length) {
      const { count } = await supabaseClient
        .from('dm_messages')
        .select('id', { count: 'exact', head: true })
        .in('thread_id', threads.map(t => t.id))
        .neq('user_id', currentProfile.id)
        .is('read_at', null);
      dmUnread = count || 0;
    }
  } catch {}

  container.innerHTML = `
    <div class="channel-list-header">
      <h2>Chat</h2>
    </div>
    <div class="dm-entry-card" role="button" tabindex="0" aria-label="Open direct messages" onclick="openDmInbox()">
      <div class="dm-entry-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
      </div>
      <div class="dm-entry-text">
        <div class="dm-entry-title">Direct Messages</div>
        <div class="dm-entry-sub">Private 1:1 with other runners</div>
      </div>
      ${dmUnread > 0 ? `<span class="badge dm-unread-badge">${dmUnread}</span>` : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.4;"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>'}
    </div>
    <div class="channel-list">
      ${channelData.map(ch => {
        const category = getChannelCategory(ch.name);
        const cover = CHANNEL_COVERS[ch.name];
        return `
        <div class="channel-item channel-item--${category}" role="button" tabindex="0" aria-label="Open ${escapeAttr(ch.name)} channel" onclick="openChat('${ch.id}', '${ch.name}')">
          <div class="channel-strip" aria-hidden="true"></div>
          <div class="channel-icon">${CHANNEL_ICONS[ch.name] || 'CH'}</div>
          <div class="channel-info">
            <div class="channel-name">#${ch.name}</div>
            <div class="channel-preview">${ch.lastMsg ? `${escapeHtml(ch.lastMsg.users?.display_name || 'Someone')}: ${escapeHtml(ch.lastMsg.content)}` : escapeHtml(ch.description || 'No messages yet')}</div>
          </div>
          <div class="channel-meta">
            ${ch.lastMsg ? `<span class="channel-time">${formatRelativeTime(ch.lastMsg.created_at)}</span>` : ''}
            ${ch.unread > 0 ? `<span class="channel-unread">${ch.unread}</span>` : ''}
          </div>
          ${cover ? `<div class="channel-thumb" style="background-image: url('${cover}');" aria-hidden="true"></div>` : ''}
        </div>
      `;}).join('')}
    </div>
  `;
}

async function openChat(channelId, channelName) {
  activeChannelId = channelId;
  activeChannelName = channelName;

  // Mark as read
  lastReadTimestamps[channelId] = new Date().toISOString();
  localStorage.setItem('riu_last_read', JSON.stringify(lastReadTimestamps));

  const container = document.getElementById('screen-chat');

  container.innerHTML = `
    <div class="chat-header">
      <button class="icon-btn" onclick="closeChat()" aria-label="Back">
        <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <h3>#${channelName}</h3>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="loading-screen"><div class="spinner"></div></div>
    </div>
    <div class="chat-input-bar">
      <label class="chat-photo-btn" for="chat-photo-input">
        <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        <input type="file" id="chat-photo-input" accept="image/*" class="hidden" onchange="handleChatPhoto(event)">
      </label>
      <input class="chat-input" type="text" id="chat-input" placeholder="Message #${channelName}" autocomplete="off"
        onkeydown="if(event.key==='Enter')sendMessage()">
      <button class="chat-send-btn" onclick="sendMessage()" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;

  navigateToSub('chat');

  // Load messages
  await loadMessages();

  // Subscribe to realtime
  if (chatSubscription) {
    supabaseClient.removeChannel(chatSubscription);
  }

  chatSubscription = supabaseClient
    .channel(`chat-${channelId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `channel_id=eq.${channelId}`
    }, async (payload) => {
      await appendMessage(payload.new);
      scrollToBottom();
      lastReadTimestamps[channelId] = new Date().toISOString();
      localStorage.setItem('riu_last_read', JSON.stringify(lastReadTimestamps));
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'messages',
      filter: `channel_id=eq.${channelId}`
    }, (payload) => {
      document.querySelector(`[data-message-id="${payload.old.id}"]`)?.remove();
    })
    .subscribe();
}

async function loadMessages() {
  const msgContainer = document.getElementById('chat-messages');
  if (!msgContainer || !activeChannelId) return;

  // Get pinned messages
  const { data: pinned } = await supabaseClient
    .from('messages')
    .select('*, users(display_name)')
    .eq('channel_id', activeChannelId)
    .eq('is_pinned', true)
    .order('created_at', { ascending: false })
    .limit(1);

  // Get recent messages
  const { data: messages } = await supabaseClient
    .from('messages')
    .select('*, users(display_name, avatar_url, pace_group)')
    .eq('channel_id', activeChannelId)
    .order('created_at', { ascending: false })
    .limit(50);

  const reversed = (messages || []).reverse();

  let html = '';

  // Pinned message
  if (pinned?.[0]) {
    html += `
      <div class="pinned-message">
        <span class="pin-icon">&#9650;</span>
        <span><strong>${escapeHtml(pinned[0].users?.display_name || 'Member')}:</strong> ${escapeHtml(pinned[0].content)}</span>
      </div>
    `;
  }

  // Messages
  html += reversed.map(m => renderMessage(m)).join('');

  msgContainer.innerHTML = html;
  scrollToBottom();
}

function renderMessage(msg) {
  const isMine = msg.user_id === currentProfile?.id;
  const isAdmin = currentProfile?.role === 'admin';
  const canDelete = isMine || isAdmin;
  const imageUrl = safeImageUrl(msg.image_url);
  // Hide messages from anyone I've blocked (or who blocked me)
  if (!isMine && typeof isBlocked === 'function' && isBlocked(msg.user_id)) {
    return `<div class="message-row message-hidden" data-message-id="${msg.id}"><em>Message hidden</em></div>`;
  }

  return `
    <div class="message-row ${isMine ? 'mine' : ''}" data-message-id="${msg.id}">
      <img src="${safeAvatarUrl(msg.users?.avatar_url)}" class="avatar-sm message-avatar" alt="" onclick="viewMemberProfile('${msg.user_id}')" style="cursor: pointer;">
      <div>
        <div class="message-sender" ${!isMine ? `role="button" tabindex="0" aria-label="View ${escapeAttr(msg.users?.display_name || 'member')}'s profile" onclick="viewMemberProfile('${msg.user_id}')" style="cursor: pointer;"` : ''}>
          ${escapeHtml(msg.users?.display_name || 'Member')}
          ${paceGroupBadgeHTML(msg.users?.pace_group)}
        </div>
        <div class="message-bubble">
          ${escapeHtml(msg.content)}
          ${imageUrl ? `<img src="${imageUrl}" class="message-image" alt="Shared photo">` : ''}
          ${canDelete ? `<button class="message-delete-btn" onclick="deleteMessage('${msg.id}')" aria-label="Delete message" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
        </div>
        <div class="message-time">${formatRelativeTime(msg.created_at)}</div>
      </div>
    </div>
  `;
}

async function deleteMessage(messageId) {
  if (!(await confirmNative('Delete this message?', 'Delete', 'Keep'))) return;
  const { error } = await supabaseClient
    .from('messages')
    .delete()
    .eq('id', messageId);
  if (error) {
    console.error('[deleteMessage]', error);
    showToast('Could not delete — try again.', 'error');
    return;
  }
  // Remove from UI immediately
  document.querySelector(`[data-message-id="${messageId}"]`)?.remove();
  haptic('success');
}

async function appendMessage(msg) {
  const msgContainer = document.getElementById('chat-messages');
  if (!msgContainer) return;

  // Fetch user info for the message
  const user = await getUserProfile(msg.user_id);
  msg.users = user;

  const html = renderMessage(msg);
  msgContainer.insertAdjacentHTML('beforeend', html);
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input?.value.trim();
  if (!content || !activeChannelId || !currentProfile) return;

  if (content.length > 2000) {
    showToast('Message too long — keep it under 2000 characters', 'error');
    return;
  }

  input.value = '';

  const { error } = await supabaseClient.from('messages').insert({
    channel_id: activeChannelId,
    user_id: currentProfile.id,
    content: content
  });
  if (error) {
    console.error('[sendMessage]', error);
    showToast("That message didn't go through — try one more time.", 'error');
    input.value = content;
  }
}

async function handleChatPhoto(event) {
  const file = event.target.files[0];
  if (!file || !activeChannelId || !currentProfile) return;

  try {
    const ext = file.name.split('.').pop();
    const path = `${activeChannelId}/${Date.now()}.${ext}`;
    const url = await uploadFile('chat-images', path, file);

    const { error } = await supabaseClient.from('messages').insert({
      channel_id: activeChannelId,
      user_id: currentProfile.id,
      content: 'Photo',
      image_url: url
    });
    if (error) throw error;
  } catch (err) {
    showToast("Photo didn't upload — try again.", 'error');
  }

  event.target.value = '';
}

function closeChat() {
  if (chatSubscription) {
    supabaseClient.removeChannel(chatSubscription);
    chatSubscription = null;
  }
  activeChannelId = null;
  navigateTo('community');
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}
