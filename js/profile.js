// ===== PROFILE SCREEN =====

async function initProfile() {
  await refreshProfile();
}

async function refreshProfile() {
  const container = document.getElementById('screen-profile');
  if (!currentProfile) return;

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

  const runDaysLabel = currentProfile.run_days.includes('tuesday') && currentProfile.run_days.includes('saturday')
    ? 'Both Days'
    : currentProfile.run_days.includes('tuesday') ? 'Tuesdays' : 'Saturdays';

  container.innerHTML = `
    <div class="profile-avatar-wrapper">
      <img src="${currentProfile.avatar_url || DEFAULT_AVATAR}" class="avatar-xl" alt="${currentProfile.display_name}">
      <label class="profile-edit-avatar" for="profile-avatar-input">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
      </label>
      <input type="file" id="profile-avatar-input" accept="image/*" class="hidden" onchange="updateProfileAvatar(event)">
    </div>

    <div>
      <div class="profile-name">${currentProfile.display_name}</div>
      <div class="profile-meta">
        ${paceGroupBadgeHTML(currentProfile.pace_group)}
        <span class="detail">&#x1F4C5; ${runDaysLabel}</span>
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

    <div class="profile-actions">
      <button class="btn-secondary" onclick="showEditProfile()">Edit Profile</button>
      <button class="btn-logout" onclick="handleLogout()">Log Out</button>
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

  const runDaysLabel = profile.run_days.includes('tuesday') && profile.run_days.includes('saturday')
    ? 'Both Days'
    : profile.run_days.includes('tuesday') ? 'Tuesdays' : 'Saturdays';

  container.innerHTML = `
    <button class="auth-back" onclick="navigateBack()" style="align-self: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>

    <img src="${profile.avatar_url || DEFAULT_AVATAR}" class="avatar-xl" alt="${profile.display_name}">

    <div>
      <div class="profile-name">${profile.display_name}</div>
      <div class="profile-meta">
        ${paceGroupBadgeHTML(profile.pace_group)}
        <span class="detail">&#x1F4C5; ${runDaysLabel}</span>
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
      &#x1F91D; Run Together
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
  const file = event.target.files[0];
  if (!file || !currentProfile) return;

  try {
    const ext = file.name.split('.').pop();
    const path = `${currentProfile.id}/avatar.${ext}`;
    const url = await uploadFile('avatars', path, file);
    currentProfile = await updateUserProfile(currentProfile.id, { avatar_url: url });

    // Update header avatar too
    document.getElementById('header-avatar').src = url;

    showToast('Avatar updated!', 'success');
    refreshProfile();
  } catch (err) {
    showToast('Failed to update avatar', 'error');
  }
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
      <input class="form-input" type="text" id="edit-name" value="${currentProfile.display_name}">
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
        <button class="option-card ${currentProfile.run_days.includes('tuesday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'tuesday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Tuesday Nights</h4>
            <p>Deep Ellum — 7:00 PM</p>
          </div>
        </button>
        <button class="option-card ${currentProfile.run_days.includes('saturday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'saturday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Saturday Mornings</h4>
            <p>Fair Oaks Park — 8:00 AM</p>
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
  if (!name) { showToast('Name cannot be empty', 'error'); return; }

  const updates = { display_name: name };
  if (editPaceGroup) updates.pace_group = editPaceGroup;
  if (editRunDays && editRunDays.length > 0) updates.run_days = editRunDays;

  try {
    currentProfile = await updateUserProfile(currentProfile.id, updates);
    showToast('Profile updated!', 'success');
    editPaceGroup = null;
    editRunDays = [];
    refreshProfile();
  } catch (err) {
    showToast('Update failed', 'error');
  }
}

async function handleLogout() {
  if (confirm('Are you sure you want to log out?')) {
    await signOut();
  }
}
