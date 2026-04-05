// ===== AUTH STATE =====
let currentUser = null;
let currentProfile = null;

// ===== RENDER SPLASH =====
function renderSplash() {
  document.getElementById('screen-splash').innerHTML = `
    <div class="splash-hero" style="background-image: url('./assets/photos/low-angle-urban.jpg');">
      <div class="splash-hero-overlay">
        <img src="./assets/logo.png" alt="Run It UP!" class="splash-logo">
        <p class="splash-tagline">Built By the Community, Powered by Purpose</p>
        <p style="font-size: 0.75rem; color: var(--color-primary); font-weight: 600; margin-bottom: var(--space-md);">82K+ runners. Dallas's biggest run club.</p>
        <div class="splash-buttons">
          <button class="btn-primary" onclick="showScreen('signup')">JOIN THE CREW</button>
          <button class="btn-secondary btn-sm" onclick="loginAsGuest()" style="margin-top: var(--space-xs);">EXPLORE AS GUEST</button>
          <p class="splash-login-link">Already have an account? <a href="#" onclick="showScreen('login'); return false;">Log In</a></p>
        </div>
      </div>
    </div>
  `;
}

// ===== RENDER LOGIN =====
function renderLogin() {
  document.getElementById('screen-login').innerHTML = `
    <button class="auth-back" onclick="showScreen('splash')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>
    <div class="auth-header">
      <h1>Welcome Back</h1>
      <p>Log in to your Run It UP! account</p>
    </div>
    <form class="auth-form" onsubmit="handleLogin(event)">
      <div class="form-group">
        <label class="form-label" for="login-email">Email</label>
        <input class="form-input" type="email" id="login-email" placeholder="your@email.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">Password</label>
        <input class="form-input" type="password" id="login-password" placeholder="Enter your password" required autocomplete="current-password">
      </div>
      <div style="text-align: right; margin-top: -8px; margin-bottom: var(--space-md);">
        <a href="#" onclick="handleForgotPassword(); return false;" style="font-size: 0.75rem; color: var(--color-text-muted);">Forgot password?</a>
      </div>
      <div id="login-error" class="form-error hidden"></div>
      <div class="auth-actions">
        <button type="submit" class="btn-primary" id="btn-login">Log In</button>
        <div class="auth-divider">or</div>
        <button type="button" class="btn-google" onclick="handleGoogleAuth()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <button type="button" class="btn-apple" onclick="handleAppleAuth()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M13.545 8.32c-.023-2.147 1.752-3.179 1.832-3.229-1-1.46-2.552-1.66-3.103-1.683-1.318-.134-2.578.778-3.248.778-.671 0-1.707-.759-2.808-.738C4.858 3.47 3.62 4.298 2.93 5.564c-1.397 2.424-.357 6.014.998 7.98.666.96 1.458 2.04 2.5 2.001 1.003-.04 1.382-.648 2.596-.648 1.213 0 1.553.648 2.611.627 1.082-.018 1.765-1.001 2.424-1.963.764-1.112 1.079-2.19 1.098-2.247-.024-.01-2.107-.809-2.131-3.207v.213zM11.525 2.507C12.07 1.846 12.44.954 12.34.05c-.765.031-1.691.51-2.24 1.152-.493.57-.924 1.48-.808 2.353.853.066 1.724-.434 2.233-1.048z" fill="#FFFFFF"/></svg>
          Continue with Apple
        </button>
        <p class="auth-switch">Don't have an account? <a href="#" onclick="showScreen('signup'); return false;">Sign Up</a></p>
      </div>
    </form>
  `;
}

async function handleForgotPassword() {
  const email = document.getElementById('login-email').value;
  if (!email) { showToast('Enter your email first, then tap forgot password.', 'info'); return; }
  try {
    await supabaseClient.auth.resetPasswordForEmail(email);
    showToast('Password reset email sent! Check your inbox.', 'success');
  } catch (err) {
    showToast('Reset email didn\'t send — try again.', 'error');
  }
}

// ===== RENDER SIGNUP =====
function renderSignup() {
  document.getElementById('screen-signup').innerHTML = `
    <button class="auth-back" onclick="showScreen('splash')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>
    <div class="auth-header">
      <h1>Join the Crew</h1>
      <p>Create your Run It UP! account</p>
    </div>
    <form class="auth-form" onsubmit="handleSignup(event)">
      <div class="form-group">
        <label class="form-label" for="signup-email">Email</label>
        <input class="form-input" type="email" id="signup-email" placeholder="your@email.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="signup-password">Password</label>
        <input class="form-input" type="password" id="signup-password" placeholder="Create a password (min 6 chars)" required minlength="6" autocomplete="new-password">
      </div>
      <div id="signup-error" class="form-error hidden"></div>
      <div class="auth-actions">
        <button type="submit" class="btn-primary" id="btn-signup">Create Account</button>
        <div class="auth-divider">or</div>
        <button type="button" class="btn-google" onclick="handleGoogleAuth()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <button type="button" class="btn-apple" onclick="handleAppleAuth()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M13.545 8.32c-.023-2.147 1.752-3.179 1.832-3.229-1-1.46-2.552-1.66-3.103-1.683-1.318-.134-2.578.778-3.248.778-.671 0-1.707-.759-2.808-.738C4.858 3.47 3.62 4.298 2.93 5.564c-1.397 2.424-.357 6.014.998 7.98.666.96 1.458 2.04 2.5 2.001 1.003-.04 1.382-.648 2.596-.648 1.213 0 1.553.648 2.611.627 1.082-.018 1.765-1.001 2.424-1.963.764-1.112 1.079-2.19 1.098-2.247-.024-.01-2.107-.809-2.131-3.207v.213zM11.525 2.507C12.07 1.846 12.44.954 12.34.05c-.765.031-1.691.51-2.24 1.152-.493.57-.924 1.48-.808 2.353.853.066 1.724-.434 2.233-1.048z" fill="#FFFFFF"/></svg>
          Continue with Apple
        </button>
        <p class="auth-switch">Already have an account? <a href="#" onclick="showScreen('login'); return false;">Log In</a></p>
        <p class="auth-legal">By signing up, you agree to our <a href="terms.html" target="_blank">Terms of Service</a> and <a href="privacy.html" target="_blank">Privacy Policy</a></p>
      </div>
    </form>
  `;
}

// ===== RENDER ONBOARDING =====
let onboardingStep = 1;
let onboardingData = { display_name: '', avatar_url: null, pace_group: null, run_days: [] };

function renderOnboarding() {
  onboardingStep = 1;
  onboardingData = { display_name: '', avatar_url: null, pace_group: null, run_days: [] };

  document.getElementById('screen-onboarding').innerHTML = `
    <div class="onboarding-progress">
      <div class="progress-dot active" id="progress-1"></div>
      <div class="progress-dot" id="progress-2"></div>
      <div class="progress-dot" id="progress-3"></div>
    </div>

    <!-- Step 1: Name + Avatar -->
    <div class="onboarding-step active" id="onboarding-step-1">
      <h2>Who Are You?</h2>
      <p>Let the crew know who's pulling up</p>
      <div class="avatar-upload">
        <label class="avatar-upload-preview" for="avatar-input">
          <svg class="placeholder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </label>
        <input type="file" id="avatar-input" accept="image/*" class="hidden" onchange="handleAvatarUpload(event)">
        <span style="font-size: 0.75rem; color: var(--color-text-muted);">Tap to add a photo</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="onboarding-name">Display Name</label>
        <input class="form-input" type="text" id="onboarding-name" placeholder="What should we call you?" required maxlength="50">
      </div>
      <div class="onboarding-actions">
        <button class="btn-primary" onclick="nextOnboardingStep()">Next</button>
      </div>
    </div>

    <!-- Step 2: Pace Group -->
    <div class="onboarding-step" id="onboarding-step-2">
      <button class="auth-back" onclick="prevOnboardingStep()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Back
      </button>
      <h2>Your Pace</h2>
      <p>No wrong answers — every level is welcome</p>
      <div class="option-grid">
        <button class="option-card" onclick="selectPaceGroup(this, 'walk_it_up')">
          <div class="option-info">
            <h4>Walk It Up</h4>
            <p>16+ min/mile — every step counts</p>
          </div>
        </button>
        <button class="option-card" onclick="selectPaceGroup(this, 'jog_it_up')">
          <div class="option-info">
            <h4>Jog It Up</h4>
            <p>12-16 min/mile — finding our rhythm</p>
          </div>
        </button>
        <button class="option-card" onclick="selectPaceGroup(this, 'run_it_up')">
          <div class="option-info">
            <h4>Run It Up</h4>
            <p>8-12 min/mile — let's get it</p>
          </div>
        </button>
        <button class="option-card" onclick="selectPaceGroup(this, 'sprint_it_up')">
          <div class="option-info">
            <h4>Sprint It Up</h4>
            <p>Under 8 min/mile — catch us if you can</p>
          </div>
        </button>
      </div>
      <div class="onboarding-actions">
        <button class="btn-primary" onclick="nextOnboardingStep()" id="btn-pace-next" disabled>Next</button>
      </div>
    </div>

    <!-- Step 3: Run Days -->
    <div class="onboarding-step" id="onboarding-step-3">
      <button class="auth-back" onclick="prevOnboardingStep()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Back
      </button>
      <h2>When Do You Run?</h2>
      <p>Pick your days — you can always change this later</p>
      <div class="option-grid">
        <button class="option-card" onclick="toggleRunDay(this, 'monday')">
          <div class="option-info">
            <h4>Monday Nights</h4>
            <p>Trinity Groves — 7:00 PM — 2 miles</p>
          </div>
        </button>
        <button class="option-card" onclick="toggleRunDay(this, 'tuesday')">
          <div class="option-info">
            <h4>Tuesday Nights</h4>
            <p>Kanvas Sports Bar, Deep Ellum — 7:00 PM — 2 miles</p>
          </div>
        </button>
        <button class="option-card" onclick="toggleRunDay(this, 'saturday')">
          <div class="option-info">
            <h4>Saturday Mornings</h4>
            <p>Fair Oaks Park — 8:30 AM — 3-5 miles</p>
          </div>
        </button>
        <button class="option-card" onclick="toggleRunDay(this, 'sunday')">
          <div class="option-info">
            <h4>Sunday Mornings</h4>
            <p>Levy Event Plaza, Irving — 8:30 AM — 3 miles</p>
          </div>
        </button>
      </div>
      <div class="onboarding-actions">
        <button class="btn-primary" onclick="completeOnboarding()" id="btn-days-done" disabled>Let's Run</button>
      </div>
    </div>
  `;
}

// ===== FRIENDLY ERROR MESSAGES =====
function friendlyError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('Invalid login credentials')) return "That didn't match. Double-check your email and password.";
  if (msg.includes('already registered') || msg.includes('already been registered')) return "Looks like you already have an account. Try logging in!";
  if (msg.includes('Password should be')) return "Password needs to be at least 6 characters.";
  if (msg.includes('valid email')) return "Please enter a valid email address.";
  return "Something went wrong. Try again in a sec.";
}

// ===== AUTH HANDLERS =====
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');

  btn.disabled = true;
  btn.textContent = 'Logging in...';
  errorEl.classList.add('hidden');

  try {
    await signIn(email, password);
    await loadUserAndEnterApp();
  } catch (err) {
    errorEl.textContent = friendlyError(err);
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Log In';
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  const btn = document.getElementById('btn-signup');

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  errorEl.classList.add('hidden');

  try {
    const { session } = await signUp(email, password);
    if (session) {
      // Email confirmation disabled — session is immediate, go to onboarding
      renderOnboarding();
      showScreen('onboarding');
    } else {
      // Email confirmation enabled — show confirmation screen
      showEmailConfirmation(email);
    }
  } catch (err) {
    errorEl.textContent = friendlyError(err);
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleGoogleAuth() {
  try {
    await signInWithGoogle();
  } catch (err) {
    showToast("Google didn't connect — try again.", 'error');
  }
}

async function handleAppleAuth() {
  try {
    await signInWithApple();
  } catch (err) {
    showToast("Apple sign-in didn't connect — try again.", 'error');
  }
}

// ===== ONBOARDING HANDLERS =====
function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  onboardingData._avatarFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.querySelector('.avatar-upload-preview');
    preview.innerHTML = `<img src="${e.target.result}" alt="Avatar preview">`;
  };
  reader.readAsDataURL(file);
}

function selectPaceGroup(el, group) {
  document.querySelectorAll('#onboarding-step-2 .option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  onboardingData.pace_group = group;
  document.getElementById('btn-pace-next').disabled = false;
}

function toggleRunDay(el, day) {
  el.classList.toggle('selected');
  const idx = onboardingData.run_days.indexOf(day);
  if (idx >= 0) {
    onboardingData.run_days.splice(idx, 1);
  } else {
    onboardingData.run_days.push(day);
  }
  document.getElementById('btn-days-done').disabled = onboardingData.run_days.length === 0;
}

function nextOnboardingStep() {
  if (onboardingStep === 1) {
    const name = document.getElementById('onboarding-name').value.trim();
    if (!name) { showToast('We need a name to put on the leaderboard!', 'error'); return; }
    onboardingData.display_name = escapeHtml(name);
  }

  document.getElementById(`onboarding-step-${onboardingStep}`).classList.remove('active');
  document.getElementById(`progress-${onboardingStep}`).classList.remove('active');
  document.getElementById(`progress-${onboardingStep}`).classList.add('done');

  onboardingStep++;

  document.getElementById(`onboarding-step-${onboardingStep}`).classList.add('active');
  document.getElementById(`progress-${onboardingStep}`).classList.add('active');
}

function prevOnboardingStep() {
  document.getElementById(`onboarding-step-${onboardingStep}`).classList.remove('active');
  document.getElementById(`progress-${onboardingStep}`).classList.remove('active');

  onboardingStep--;

  document.getElementById(`onboarding-step-${onboardingStep}`).classList.add('active');
  document.getElementById(`progress-${onboardingStep}`).classList.remove('done');
  document.getElementById(`progress-${onboardingStep}`).classList.add('active');
}

async function completeOnboarding() {
  const btn = document.getElementById('btn-days-done');
  btn.disabled = true;
  btn.textContent = 'Setting up...';

  try {
    const session = await getSession();
    if (!session) throw new Error('No session — please try signing up again.');

    // Upload avatar if selected
    let avatarUrl = null;
    if (onboardingData._avatarFile) {
      const ext = onboardingData._avatarFile.name.split('.').pop();
      const path = `${session.user.id}/avatar.${ext}`;
      avatarUrl = await uploadFile('avatars', path, onboardingData._avatarFile);
    }

    // Create user profile
    const profile = await createUserProfile({
      id: session.user.id,
      display_name: onboardingData.display_name,
      avatar_url: avatarUrl,
      pace_group: onboardingData.pace_group,
      run_days: onboardingData.run_days,
      role: 'member'
    });

    // Auto-join channels
    await autoJoinChannels(profile);

    currentProfile = profile;
    enterApp();
  } catch (err) {
    showToast(err.message || 'Setup hit a snag — try again.', 'error');
    btn.disabled = false;
    btn.textContent = "Let's Run";
  }
}

async function autoJoinChannels(profile) {
  // Get all channels
  const { data: channels } = await supabaseClient.from('channels').select('id, name, type');
  if (!channels) return;

  const toJoin = [];

  // Always join general + newbies
  channels.filter(c => c.name === 'general' || c.name === 'newbies')
    .forEach(c => toJoin.push({ channel_id: c.id, user_id: profile.id }));

  // Join pace group channel
  const paceChannelName = profile.pace_group.replace(/_/g, '-');
  const paceChannel = channels.find(c => c.name === paceChannelName);
  if (paceChannel) toJoin.push({ channel_id: paceChannel.id, user_id: profile.id });

  // Join run day channels
  if (profile.run_days.includes('monday')) {
    const ch = channels.find(c => c.name === 'monday-trinity-groves');
    if (ch) toJoin.push({ channel_id: ch.id, user_id: profile.id });
  }
  if (profile.run_days.includes('tuesday')) {
    const ch = channels.find(c => c.name === 'tuesday-deep-ellum');
    if (ch) toJoin.push({ channel_id: ch.id, user_id: profile.id });
  }
  if (profile.run_days.includes('saturday')) {
    const ch = channels.find(c => c.name === 'saturday-fair-oaks');
    if (ch) toJoin.push({ channel_id: ch.id, user_id: profile.id });
  }
  if (profile.run_days.includes('sunday')) {
    const ch = channels.find(c => c.name === 'sunday-levy-plaza');
    if (ch) toJoin.push({ channel_id: ch.id, user_id: profile.id });
  }

  if (toJoin.length > 0) {
    await supabaseClient.from('channel_members').insert(toJoin);
  }
}

// ===== APP ENTRY =====
async function loadUserAndEnterApp() {
  try {
    const profile = await getCurrentUser();
    if (!profile) {
      renderOnboarding();
      showScreen('onboarding');
      return;
    }
    currentProfile = profile;
    enterApp();
  } catch (err) {
    console.error('Failed to load user:', err);
    renderSplash();
    showScreen('splash');
    showToast('Having trouble connecting. Check your connection and try again.', 'error');
  }
}

function enterApp() {
  // Hide all auth screens
  document.querySelectorAll('#screen-splash, #screen-login, #screen-signup, #screen-onboarding')
    .forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });

  // Show app shell
  document.getElementById('app-shell').classList.remove('hidden');

  // Set header avatar
  const headerAvatar = document.getElementById('header-avatar');
  headerAvatar.src = safeAvatarUrl(currentProfile.avatar_url);
  headerAvatar.alt = currentProfile.display_name;

  // Initialize screens
  if (typeof initHome === 'function') initHome();
  if (typeof initEvents === 'function') initEvents();
  if (typeof initCommunity === 'function') initCommunity();
  if (typeof initStats === 'function') initStats();
  if (typeof initProfile === 'function') initProfile();

  // Show home screen
  navigateTo('home');
}

// ===== SCREEN NAVIGATION (auth screens) =====
function showScreen(name) {
  // Only toggle auth screens, not app screens
  ['screen-splash', 'screen-login', 'screen-signup', 'screen-onboarding'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
}

// ===== GUEST LOGIN =====
async function loginAsGuest() {
  try {
    // Sign in anonymously using Supabase anonymous auth
    const { data, error } = await supabaseClient.auth.signInAnonymously();
    if (error) throw error;

    // Create a guest profile
    const guestProfile = await createUserProfile({
      id: data.session.user.id,
      display_name: 'Guest Runner',
      avatar_url: null,
      pace_group: 'jog_it_up',
      run_days: ['tuesday', 'saturday'],
      role: 'member'
    });

    // Auto-join default channels
    await autoJoinChannels(guestProfile);

    currentProfile = guestProfile;
    enterApp();
  } catch (err) {
    // Fallback: if anonymous auth is not enabled, create a temp guest session
    // by signing up with a random guest email
    try {
      const guestId = Math.random().toString(36).substring(2, 10);
      const guestEmail = `guest_${guestId}@runitup.demo`;
      const guestPass = `guest_${guestId}_pass`;

      await signUp(guestEmail, guestPass);
      const session = await getSession();

      if (!session) {
        showToast('Guest login not available right now — try signing up.', 'info');
        return;
      }

      const guestProfile = await createUserProfile({
        id: session.user.id,
        display_name: 'Guest Runner',
        avatar_url: null,
        pace_group: 'jog_it_up',
        run_days: ['tuesday', 'saturday'],
        role: 'member'
      });

      await autoJoinChannels(guestProfile);
      currentProfile = guestProfile;
      enterApp();
    } catch (err2) {
      showToast('Guest login not available right now — try signing up.', 'info');
    }
  }
}

// ===== EMAIL CONFIRMATION SCREEN =====
function showEmailConfirmation(email) {
  document.getElementById('screen-signup').innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: var(--space-xl);">
      <div style="width: 64px; height: 64px; border-radius: var(--radius-full); background: var(--color-surface); display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-lg);">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--color-primary)"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
      </div>
      <h2 style="margin-bottom: var(--space-sm);">Check Your Email</h2>
      <p style="color: var(--color-text-muted); margin-bottom: var(--space-md);">We sent a confirmation link to <strong style="color: var(--color-text);">${escapeHtml(email)}</strong></p>
      <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: var(--space-xl);">Tap the link in your email, then come back here. The app will pick you up automatically.</p>
      <button class="btn-secondary btn-sm" onclick="renderSplash(); showScreen('splash');">Back to Home</button>
    </div>
  `;
  showScreen('signup');
}
