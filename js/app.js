// ===== APP INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker (relative path — works at a domain root AND on
  // GitHub Pages project sites like /runitup-app-site/)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Native: listen for OAuth deep-link callback (com.runitupdallas.app://auth/callback)
  if (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener('appUrlOpen', ({ url }) => {
      if (url && url.includes('auth/callback')) {
        handleOAuthCallback(url);
      }
    });
    if (typeof initSocialLogin === 'function') {
      initSocialLogin().catch(() => {});
    }
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
      _cachedGuestState = null; // new session — re-evaluate guest state
      // Fresh anonymous sessions are driven by loginAsGuest(), which creates
      // the profile itself — don't race it into onboarding here.
      if (session.user?.is_anonymous && !currentProfile) return;
      await loadUserAndEnterApp();
    }
    if (event === 'TOKEN_REFRESHED' && !session) {
      // Token refresh failed — session expired
      showToast('Session expired. Please log in again.', 'info');
      await signOut();
    }
    if (event === 'SIGNED_OUT') {
      // Clean up realtime subscriptions
      if (typeof cleanupHome === 'function') cleanupHome();
      if (typeof closeChat === 'function') closeChat();
      if (typeof closeDmThread === 'function') closeDmThread();
      if (typeof buddyChannel !== 'undefined' && buddyChannel) { supabaseClient.removeChannel(buddyChannel); buddyChannel = null; }
      currentUser = null;
      currentProfile = null;
      _cachedGuestState = null; // don't gate the next login with stale guest state
      document.getElementById('app-shell').classList.add('hidden');
      document.querySelectorAll('#screen-splash, #screen-login, #screen-signup, #screen-onboarding')
        .forEach(s => { s.style.display = ''; });
      // Re-render auth forms — otherwise the login button stays stuck on
      // "Logging in..." and the previous password lingers in the field.
      renderSplash();
      renderLogin();
      renderSignup();
      showScreen('splash');
    }
  });

  // Tab bar navigation
  document.querySelectorAll('#tab-bar .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const screen = tab.dataset.screen;
      if (screen !== currentScreen) haptic('light');
      navigateTo(screen);
    });
  });

  // Header profile button
  document.getElementById('btn-header-profile')?.addEventListener('click', () => {
    navigateTo('profile');
  });

  // Offline banner — listeners registered once here
  initOfflineBanner();
});

// ===== OFFLINE BANNER =====
// Slim fixed banner under the app header, toggled by connectivity events.
function initOfflineBanner() {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.textContent = "You're offline — some things won't load.";
    document.body.appendChild(banner);
  }
  const setOffline = (offline) => banner.classList.toggle('visible', offline);
  window.addEventListener('online', () => setOffline(false));
  window.addEventListener('offline', () => {
    setOffline(true);
    haptic('warning');
  });
  // Reflect connectivity on load too
  if (navigator.onLine === false) setOffline(true);
}

// ===== TAB NAVIGATION =====
let currentScreen = 'home';

function navigateTo(screen) {
  // Clean up any active sub-screens
  if (typeof closeChat === 'function' && activeChannelId) closeChat();
  if (typeof closeDmThread === 'function' && typeof activeDmThreadId !== 'undefined' && activeDmThreadId) closeDmThread();

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
