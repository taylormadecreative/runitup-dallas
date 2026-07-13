// ===== PROFILE SCREEN =====

async function initProfile() {
  await refreshProfile();
}

async function refreshProfile() {
  const container = document.getElementById('screen-profile');
  if (!currentProfile) return;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';

  const stats = await getUserStats(currentProfile.id);
  const badges = await getUserBadges(currentProfile.id);
  const pinned = await getPinnedBadges(currentProfile.id);

  const pinnedSlots = [null, null, null];
  pinned.forEach(p => {
    if (p.slot >= 1 && p.slot <= 3 && p.badges) {
      const def = BADGE_DEFINITIONS.find(d => d.type === p.badges.badge_type);
      if (def) pinnedSlots[p.slot - 1] = def;
    }
  });

  const runDaysLabel = (() => {
    const days = currentProfile.run_days;
    const parts = [];
    if (days.includes('monday')) parts.push('Mon');
    if (days.includes('tuesday')) parts.push('Tue');
    if (days.includes('saturday')) parts.push('Sat');
    if (days.includes('sunday')) parts.push('Sun');
    return parts.length > 0 ? parts.join(' / ') : 'No days set';
  })();

  container.innerHTML = `
    <div class="profile-avatar-wrapper">
      <img src="${safeAvatarUrl(currentProfile.avatar_url)}" class="avatar-xl" alt="${escapeHtml(currentProfile.display_name)}">
      <label class="profile-edit-avatar" for="profile-avatar-input">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
      </label>
      <input type="file" id="profile-avatar-input" accept="image/*" class="hidden" onchange="updateProfileAvatar(event)">
    </div>

    <div>
      <div class="profile-name">${escapeHtml(currentProfile.display_name)}</div>
      <div class="profile-meta">
        ${paceGroupBadgeHTML(currentProfile.pace_group)}
        <span class="detail">${runDaysLabel}</span>
        <span class="detail">Joined ${formatDate(currentProfile.created_at)}</span>
      </div>
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat">
        <div class="value" style="color: var(--color-secondary);">${stats.streak}</div>
        <div class="label">Streak</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalCheckIns}</div>
        <div class="label">Check-ins</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalMiles.toFixed(1)}</div>
        <div class="label">Miles</div>
      </div>
    </div>

    <div>
      <h3 style="font-size: 0.75rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm); text-align: center;">Badge Showcase</h3>
      <div class="profile-badges">
        ${pinnedSlots.map((def, i) => def
          ? `<div class="profile-badge-slot">${def.icon}</div>`
          : `<div class="profile-badge-slot empty">+</div>`
        ).join('')}
      </div>
    </div>

    <div style="width: 100%; display: flex; flex-direction: column; gap: var(--space-xs);">
      <a href="#" onclick="window.open('./privacy.html', '_blank'); return false;" style="font-size: 0.75rem; color: var(--color-text-muted); padding: var(--space-sm) 0;">Privacy Policy</a>
      <a href="#" onclick="window.open('./terms.html', '_blank'); return false;" style="font-size: 0.75rem; color: var(--color-text-muted); padding: var(--space-sm) 0;">Terms of Service</a>
    </div>

    <div class="profile-actions">
      <button class="btn-primary" onclick="shareCrewInvite()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px; vertical-align: middle;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
        Invite the Crew
      </button>
      <button class="btn-secondary" onclick="showEditProfile()">Edit Profile</button>
      <button class="btn-secondary" onclick="showBlockedUsers()">Blocked Users</button>
      <button class="btn-logout" onclick="handleLogout()">Log Out</button>
      <button class="btn-logout" style="color: var(--color-error); opacity: 0.6; font-size: 0.75rem;" onclick="handleDeleteAccount()">Delete My Account</button>
    </div>
  `;
}

async function viewMemberProfile(userId) {
  if (userId === currentProfile?.id) {
    navigateTo('profile');
    return;
  }

  const container = document.getElementById('screen-member-profile');
  const profile = await getUserProfile(userId);
  if (!profile) return;

  const stats = await getUserStats(userId);
  const badges = await getUserBadges(userId);
  const pinned = await getPinnedBadges(userId);

  const pinnedSlots = [null, null, null];
  pinned.forEach(p => {
    if (p.slot >= 1 && p.slot <= 3 && p.badges) {
      const def = BADGE_DEFINITIONS.find(d => d.type === p.badges.badge_type);
      if (def) pinnedSlots[p.slot - 1] = def;
    }
  });

  const runDaysLabel = (() => {
    const days = profile.run_days;
    const parts = [];
    if (days.includes('monday')) parts.push('Mon');
    if (days.includes('tuesday')) parts.push('Tue');
    if (days.includes('saturday')) parts.push('Sat');
    if (days.includes('sunday')) parts.push('Sun');
    return parts.length > 0 ? parts.join(' / ') : 'No days set';
  })();

  container.innerHTML = `
    <button class="auth-back" onclick="navigateBack()" style="align-self: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>

    <img src="${safeAvatarUrl(profile.avatar_url)}" class="avatar-xl" alt="${escapeHtml(profile.display_name)}">

    <div>
      <div class="profile-name">${escapeHtml(profile.display_name)}</div>
      <div class="profile-meta">
        ${paceGroupBadgeHTML(profile.pace_group)}
        <span class="detail">${runDaysLabel}</span>
        <span class="detail">Joined ${formatDate(profile.created_at)}</span>
      </div>
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat">
        <div class="value" style="color: var(--color-secondary);">${stats.streak}</div>
        <div class="label">Streak</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalCheckIns}</div>
        <div class="label">Check-ins</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalMiles.toFixed(1)}</div>
        <div class="label">Miles</div>
      </div>
    </div>

    <div>
      <h3 style="font-size: 0.75rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm); text-align: center;">Badge Showcase</h3>
      <div class="profile-badges">
        ${pinnedSlots.map(def => def
          ? `<div class="profile-badge-slot">${def.icon}</div>`
          : `<div class="profile-badge-slot empty"></div>`
        ).join('')}
      </div>
    </div>

    ${typeof isBlocked === 'function' && isBlocked(userId) ? `
      <div class="blocked-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-8 10c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>
        <div>
          <strong>Blocked</strong>
          <p>This user is blocked. You won't see messages or run together until you unblock.</p>
        </div>
        <button class="btn-secondary btn-sm" onclick="unblockFromProfile('${userId}')">Unblock</button>
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: var(--space-sm); width: 100%;">
        <button class="btn-primary" onclick="startDmWith('${userId}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px; vertical-align: middle;"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          Message ${escapeHtml(profile.display_name.split(' ')[0])}
        </button>
        <button class="btn-secondary" onclick="openBuddyFromProfile('${userId}')">
          Ask to Run Together
        </button>
        <button class="btn-secondary btn-sm" style="color: var(--color-error); border-color: rgba(239,68,68,0.3); margin-top: var(--space-sm);" onclick="blockFromMemberProfile(${jsArg(userId)},${jsArg(profile.display_name)})">Block ${escapeHtml(profile.display_name.split(' ')[0])}</button>
      </div>
    `}
  `;

  navigateToSub('member-profile');
}

async function blockFromMemberProfile(userId, name) {
  if (!(await confirmNative(`Block ${name}? They won't be able to message you, match with you, or see your activity. You can unblock anytime from Profile → Settings.`, 'Block', 'Cancel'))) return;
  try {
    await blockUser(userId);
    showToast(`${name} blocked.`, 'info');
    haptic('warning');
    viewMemberProfile(userId); // Re-render in blocked state
  } catch (err) {
    console.error('[block]', err);
    showToast('Could not block — try again.', 'error');
  }
}

async function showBlockedUsers() {
  const container = document.getElementById('screen-member-profile');
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  navigateToSub('member-profile');
  const blocked = await getBlockedProfiles();
  container.innerHTML = `
    <button class="auth-back" onclick="navigateTo('profile')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Profile
    </button>
    <h2 style="margin-bottom: var(--space-xs);">Blocked Users</h2>
    <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: var(--space-lg);">People you've blocked. They can't message you, match with you, or see your activity. Unblock anytime.</p>
    ${blocked.length === 0 ? `
      <div class="empty-state"><p>You haven't blocked anyone. Nice.</p></div>
    ` : `
      <div class="blocked-list">
        ${blocked.map(u => `
          <div class="blocked-list-row">
            <img src="${safeAvatarUrl(u.avatar_url)}" class="avatar-sm" alt="">
            <div>
              <strong>${escapeHtml(u.display_name)}</strong>
              <small>${PACE_GROUPS[u.pace_group]?.label || ''}</small>
            </div>
            <button class="btn-secondary btn-sm" onclick="unblockFromList('${u.id}')">Unblock</button>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

async function unblockFromList(userId) {
  if (!(await confirmNative('Unblock this user?', 'Unblock', 'Cancel'))) return;
  try {
    await unblockUser(userId);
    showToast('Unblocked.', 'info');
    showBlockedUsers(); // refresh list
  } catch (err) {
    console.error('[unblock]', err);
    showToast('Could not unblock — try again.', 'error');
  }
}

async function unblockFromProfile(userId) {
  if (!(await confirmNative('Unblock this user? They\'ll be able to message you again.', 'Unblock', 'Cancel'))) return;
  try {
    await unblockUser(userId);
    showToast('Unblocked.', 'info');
    viewMemberProfile(userId);
  } catch (err) {
    console.error('[unblock]', err);
    showToast('Could not unblock — try again.', 'error');
  }
}

function openBuddyFromProfile(userId) {
  // Determine next run day and open buddy board
  const nextTuesday = getNextRunDate(2);
  const nextSaturday = getNextRunDate(6);
  const nextDate = nextTuesday < nextSaturday ? nextTuesday : nextSaturday;
  const runDay = nextTuesday < nextSaturday ? 'tuesday' : 'saturday';
  openBuddyBoard(runDay, nextDate.toISOString().split('T')[0]);
}

async function updateProfileAvatar(event) {
  let file;
  try {
    file = event.target.files[0];
  } catch (err) {
    showToast('Could not access photo — try choosing from your library instead.', 'error');
    return;
  }
  if (!file || !currentProfile) return;

  // Validate file type and size
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Photo is too large — please choose one under 10MB.', 'error');
    return;
  }

  try {
    const ext = file.name.split('.').pop() || 'jpg';
    // Unique path per upload so the new public URL isn't served from the
    // old cached image (uploadFile uses upsert: true on a fixed path).
    const path = `${currentProfile.id}/avatar_${Date.now()}.${ext}`;
    const url = await uploadFile('avatars', path, file);
    currentProfile = await updateUserProfile(currentProfile.id, { avatar_url: url });

    // Update header avatar too
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.src = url;

    showToast('New pic, who dis?', 'success');
    refreshProfile();
  } catch (err) {
    showToast('Photo didn\'t save — try again.', 'error');
  }

  // Reset input so the same file can be re-selected
  event.target.value = '';
}

function showEditProfile() {
  editPaceGroup = currentProfile.pace_group;
  editRunDays = [...currentProfile.run_days];
  const container = document.getElementById('screen-profile');

  container.innerHTML = `
    <button class="auth-back" onclick="refreshProfile()" style="align-self: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Cancel
    </button>

    <h2>Edit Profile</h2>

    <div class="form-group" style="width: 100%;">
      <label class="form-label">Display Name</label>
      <input class="form-input" type="text" id="edit-name" value="${escapeHtml(currentProfile.display_name)}" maxlength="50">
    </div>

    <div style="width: 100%;">
      <label class="form-label" style="display: block; margin-bottom: var(--space-sm);">Pace Group</label>
      <div class="option-grid" id="edit-pace-grid">
        ${Object.entries(PACE_GROUPS).map(([key, info]) => `
          <button class="option-card ${currentProfile.pace_group === key ? 'selected' : ''}" onclick="selectEditPaceGroup(this, '${key}')">
            <div class="option-info">
              <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">${info.label}</h4>
              <p>${info.pace}</p>
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <div style="width: 100%;">
      <label class="form-label" style="display: block; margin-bottom: var(--space-sm);">Run Days</label>
      <div class="option-grid">
        <button class="option-card ${currentProfile.run_days.includes('monday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'monday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Monday Nights</h4>
            <p>Trinity Groves — 7:00 PM</p>
          </div>
        </button>
        <button class="option-card ${currentProfile.run_days.includes('tuesday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'tuesday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Tuesday Nights</h4>
            <p>Kanvas Sports Bar, Deep Ellum — 7:00 PM</p>
          </div>
        </button>
        <button class="option-card ${currentProfile.run_days.includes('saturday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'saturday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Saturday Mornings</h4>
            <p>Fair Oaks Park — 8:30 AM</p>
          </div>
        </button>
        <button class="option-card ${currentProfile.run_days.includes('sunday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'sunday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Sunday Mornings</h4>
            <p>Levy Event Plaza, Irving — 8:30 AM</p>
          </div>
        </button>
      </div>
    </div>

    <div class="profile-actions">
      <button class="btn-primary" onclick="saveProfile()">Save Changes</button>
    </div>
  `;
}

let editPaceGroup = null;
let editRunDays = [];

function selectEditPaceGroup(el, group) {
  document.querySelectorAll('#edit-pace-grid .option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  editPaceGroup = group;
}

function toggleEditRunDay(el, day) {
  el.classList.toggle('selected');
  if (!editRunDays) editRunDays = [...currentProfile.run_days];
  const idx = editRunDays.indexOf(day);
  if (idx >= 0) editRunDays.splice(idx, 1);
  else editRunDays.push(day);
}

async function saveProfile() {
  const name = document.getElementById('edit-name')?.value.trim();
  if (!name) { showToast('We need a name for the leaderboard!', 'error'); return; }

  const updates = { display_name: name };
  if (editPaceGroup) updates.pace_group = editPaceGroup;
  if (editRunDays && editRunDays.length > 0) updates.run_days = editRunDays;

  try {
    currentProfile = await updateUserProfile(currentProfile.id, updates);
    showToast('Profile updated — looking good!', 'success');
    editPaceGroup = null;
    editRunDays = [];
    refreshProfile();
  } catch (err) {
    showToast('That didn\'t save — give it another shot.', 'error');
  }
}

async function handleLogout() {
  if (await confirmNative('Log out of Run It UP!?', 'Log Out', 'Stay')) {
    await signOut();
  }
}

async function handleDeleteAccount() {
  if (!(await confirmNative('Permanently delete your account and all your data? This cannot be undone.', 'Delete', 'Cancel'))) return;
  if (!(await confirmNative('Really? Your streak, badges, and check-in history will be gone forever.', 'Yes, Delete', 'Cancel'))) return;
  try {
    // Call the Supabase Edge Function for a full atomic deletion of
    // both the public profile AND the auth.users record (required by
    // Apple App Store Guideline 5.1.1v). The Edge Function uses the
    // service role key to perform the admin-level deletion that the
    // client cannot do directly.
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const { error } = await supabaseClient.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });

    if (error) throw error;

    await signOut();
    showToast('Account deleted. We hope to see you on the pavement again.', 'info');
  } catch (err) {
    console.error('Delete account error:', err);
    showToast("Couldn't delete right now — reach out to contactus@runitupdallas.com", 'error');
  }
}
