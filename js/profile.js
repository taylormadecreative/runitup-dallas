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
      <button class="btn-secondary" onclick="showEditProfile()">Edit Profile</button>
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

    <button class="btn-primary btn-orange" onclick="openBuddyFromProfile('${userId}')">
      RUN TOGETHER
    </button>
  `;

  navigateToSub('member-profile');
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
    const path = `${currentProfile.id}/avatar.${ext}`;
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
      <div class="option-grid">
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
  document.querySelectorAll('#screen-profile .option-grid:first-of-type .option-card').forEach(c => c.classList.remove('selected'));
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
  if (confirm('Are you sure you want to log out?')) {
    await signOut();
  }
}

async function handleDeleteAccount() {
  if (!confirm('Are you sure? This will permanently delete your account and all your data. This cannot be undone.')) return;
  if (!confirm('Really delete everything? Your streak, badges, and check-in history will be gone forever.')) return;
  try {
    // Delete user profile data (cascades will handle related data)
    await supabaseClient.from('users').delete().eq('id', currentProfile.id);
    await signOut();
    showToast('Account deleted. We hope to see you on the pavement again.', 'info');
  } catch (err) {
    showToast('Couldn\'t delete right now — reach out to contactus@runitupdallas.com', 'error');
  }
}
