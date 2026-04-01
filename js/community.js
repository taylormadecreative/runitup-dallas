// ===== COMMUNITY / GROUP CHAT =====
let activeChannelId = null;
let activeChannelName = null;
let chatSubscription = null;
let lastReadTimestamps = {};

const CHANNEL_ICONS = {
  'tuesday-deep-ellum': '\u{1F303}',
  'saturday-fair-oaks': '\u{1F305}',
  'trail-runs': '\u{26F0}',
  'walk-it-up': '\u{1F6B6}',
  'jog-it-up': '\u{1F3C3}',
  'run-it-up': '\u{1F525}',
  'sprint-it-up': '\u{26A1}',
  'general': '\u{1F4AC}',
  'newbies': '\u{1F44B}',
  'post-run-pics': '\u{1F4F8}',
  'fit-check': '\u{1F457}'
};

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

  // Get user's channels
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, channels(id, name, type, description)')
    .eq('user_id', currentProfile.id);

  const channels = (memberships || []).map(m => m.channels).filter(Boolean);

  // Get last message for each channel
  const channelData = await Promise.all(channels.map(async (ch) => {
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('content, created_at, users(display_name)')
      .eq('channel_id', ch.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Count unread
    const lastRead = lastReadTimestamps[ch.id] || '1970-01-01';
    const { count: unread } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', ch.id)
      .gt('created_at', lastRead);

    return { ...ch, lastMsg, unread: unread || 0 };
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

  container.innerHTML = `
    <div class="channel-list-header">
      <h2>Community</h2>
    </div>
    <div class="channel-list">
      ${channelData.map(ch => `
        <div class="channel-item" onclick="openChat('${ch.id}', '${ch.name}')">
          <div class="channel-icon">${CHANNEL_ICONS[ch.name] || '\u{1F4AC}'}</div>
          <div class="channel-info">
            <div class="channel-name">#${ch.name}</div>
            <div class="channel-preview">${ch.lastMsg ? `${ch.lastMsg.users?.display_name || 'Someone'}: ${ch.lastMsg.content}` : ch.description || 'No messages yet'}</div>
          </div>
          <div class="channel-meta">
            ${ch.lastMsg ? `<span class="channel-time">${formatRelativeTime(ch.lastMsg.created_at)}</span>` : ''}
            ${ch.unread > 0 ? `<span class="channel-unread">${ch.unread}</span>` : ''}
          </div>
        </div>
      `).join('')}
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
      // Update last read
      lastReadTimestamps[channelId] = new Date().toISOString();
      localStorage.setItem('riu_last_read', JSON.stringify(lastReadTimestamps));
    })
    .subscribe();
}

async function loadMessages() {
  const msgContainer = document.getElementById('chat-messages');
  if (!msgContainer || !activeChannelId) return;

  // Get pinned messages
  const { data: pinned } = await supabase
    .from('messages')
    .select('*, users(display_name)')
    .eq('channel_id', activeChannelId)
    .eq('is_pinned', true)
    .order('created_at', { ascending: false })
    .limit(1);

  // Get recent messages
  const { data: messages } = await supabase
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
        <span class="pin-icon">\u{1F4CC}</span>
        <span><strong>${pinned[0].users?.display_name}:</strong> ${escapeHtml(pinned[0].content)}</span>
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

  return `
    <div class="message-row ${isMine ? 'mine' : ''}">
      <img src="${msg.users?.avatar_url || DEFAULT_AVATAR}" class="avatar-sm message-avatar" alt="">
      <div>
        <div class="message-sender">
          ${msg.users?.display_name || 'Member'}
          ${paceGroupBadgeHTML(msg.users?.pace_group)}
        </div>
        <div class="message-bubble">
          ${escapeHtml(msg.content)}
          ${msg.image_url ? `<img src="${msg.image_url}" class="message-image" alt="Shared photo">` : ''}
        </div>
        <div class="message-time">${formatRelativeTime(msg.created_at)}</div>
      </div>
    </div>
  `;
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

  input.value = '';

  try {
    await supabaseClient.from('messages').insert({
      channel_id: activeChannelId,
      user_id: currentProfile.id,
      content: content
    });
  } catch (err) {
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

    await supabaseClient.from('messages').insert({
      channel_id: activeChannelId,
      user_id: currentProfile.id,
      content: '\u{1F4F7} Photo',
      image_url: url
    });
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
