// ===== APP INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Render login/signup screens ahead of time
  renderLogin();
  renderSignup();

  // Show loading spinner while checking session
  document.getElementById('screen-splash').innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  document.getElementById('screen-splash').classList.add('active');

  // Check for existing session (with 10s timeout to avoid infinite spinner)
  const session = await Promise.race([
    getSession(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
  ]).catch(() => null);
  if (session) {
    await loadUserAndEnterApp();
  } else {
    renderSplash();
    showScreen('splash');
  }

  // Listen for auth state changes (e.g., Google OAuth redirect)
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loadUserAndEnterApp();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      document.getElementById('app-shell').classList.add('hidden');
      document.querySelectorAll('#screen-splash, #screen-login, #screen-signup, #screen-onboarding')
        .forEach(s => { s.style.display = ''; });
      renderSplash();
      showScreen('splash');
    }
  });

  // Tab bar navigation
  document.querySelectorAll('#tab-bar .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const screen = tab.dataset.screen;
      navigateTo(screen);
    });
  });

  // Header profile button
  document.getElementById('btn-header-profile')?.addEventListener('click', () => {
    navigateTo('profile');
  });
});

// ===== TAB NAVIGATION =====
let currentScreen = 'home';

function navigateTo(screen) {
  // Clean up any active sub-screens
  if (typeof closeChat === 'function' && activeChannelId) closeChat();

  // Hide all app screens
  document.querySelectorAll('#app-main > .screen').forEach(s => s.classList.remove('active'));

  // Show target screen
  const target = document.getElementById(`screen-${screen}`);
  if (target) target.classList.add('active');

  // Update tab bar active state
  document.querySelectorAll('#tab-bar .tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`#tab-bar .tab[data-screen="${screen}"]`);
  if (activeTab) activeTab.classList.add('active');

  currentScreen = screen;

  // Trigger screen-specific refresh if needed
  if (screen === 'home' && typeof refreshHome === 'function') refreshHome();
  if (screen === 'events' && typeof refreshEvents === 'function') refreshEvents();
  if (screen === 'community' && typeof refreshCommunity === 'function') refreshCommunity();
  if (screen === 'stats' && typeof refreshStats === 'function') refreshStats();
  if (screen === 'profile' && typeof refreshProfile === 'function') refreshProfile();
}

// Navigate to sub-screens (chat, buddy board, event detail, member profile)
function navigateToSub(screen) {
  document.querySelectorAll('#app-main > .screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${screen}`);
  if (target) target.classList.add('active');

  // Don't update tab bar — sub-screens keep parent tab active
}

function navigateBack() {
  navigateTo(currentScreen);
}
