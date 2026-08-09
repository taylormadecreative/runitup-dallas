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

  // Toast live region must exist BEFORE the first toast is appended, or
  // screen readers miss the first announcement.
  if (!document.getElementById('toast-container')) {
    const tc = document.createElement('div');
    tc.id = 'toast-container';
    tc.setAttribute('role', 'status');
    tc.setAttribute('aria-live', 'polite');
    document.body.appendChild(tc);
  }

  // Desktop web extras (no-ops in the native app)
  initSidebarNextRun();
  initDesktopShortcuts();
  initKeyboardActivation();
});

// Mark the web build so CSS can hide iPhone-only features (GPS run tracking).
// Runs immediately — before first paint — so the button never flashes.
if (!window.Capacitor?.isNativePlatform()) {
  document.documentElement.classList.add('web');
}

// ===== DESKTOP EXTRAS (web only; components.css hides #sidebar-nextrun
// below 940px, desktop.css shows it in the sidebar at ≥940px) =====
// Live next-run card pinned to the bottom of the sidebar.
let _snrInterval = null;
function initSidebarNextRun() {
  if (window.Capacitor?.isNativePlatform()) return;
  if (document.getElementById('sidebar-nextrun')) return;
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  const card = document.createElement('div');
  card.id = 'sidebar-nextrun';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.addEventListener('click', () => navigateTo('home'));
  bar.appendChild(card);

  const render = () => {
    const next = WEEKLY_RUNS
      .map(r => ({ ...r, date: getNextRunDate(r.dayOfWeek) }))
      .sort((a, b) => a.date - b.date)[0];
    const diff = next.date - Date.now();
    let count;
    if (diff <= 0) {
      count = 'Happening now — pull up';
    } else {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      count = (d > 0 ? `${d}d ` : '') + `${h}h ${m}m to go`;
    }
    card.innerHTML = `
      <div class="snr-label"><span class="dot"></span> Next run</div>
      <div class="snr-run">${next.label} · <em>${next.location}</em></div>
      <div class="snr-count">${next.time} · ${count}</div>
    `;
  };
  render();
  if (_snrInterval) clearInterval(_snrInterval);
  _snrInterval = setInterval(render, 30000);
}

// Keyboard shortcuts: 1-5 switch tabs (ignored while typing).
function initDesktopShortcuts() {
  if (window.Capacitor?.isNativePlatform()) return;
  const map = { '1': 'home', '2': 'events', '3': 'community', '4': 'stats', '5': 'profile' };
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.getElementById('app-shell').classList.contains('hidden')) return;
    if (map[e.key]) { navigateTo(map[e.key]); haptic('light'); }
  });
}

// Enter/Space activate any role="button" div (divs don't synthesize click
// from the keyboard the way real buttons do).
function initKeyboardActivation() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.matches('button, a, input, textarea, select, [contenteditable]')) return;
    if (el.getAttribute('role') === 'button') {
      e.preventDefault();
      el.click();
    }
  });
}

// ===== OFFLINE BANNER =====
// Slim fixed banner under the app header, toggled by connectivity events.
function initOfflineBanner() {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.setAttribute('role', 'status');
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
