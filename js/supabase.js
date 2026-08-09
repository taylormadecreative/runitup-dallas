// Demo mode: set to true to enable check-in at any time (disable for production)
const DEMO_MODE = false;

// Default avatar for users without a profile photo
// Person silhouette, not a "?" — a circled question mark reads as a Help
// button in the header, not a profile.
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23252525'/%3E%3Ccircle cx='50' cy='40' r='16' fill='%239A9A9A'/%3E%3Cpath d='M50 60c-16 0-27 9-29 22a50 50 0 0 0 58 0C77 69 66 60 50 60z' fill='%239A9A9A'/%3E%3C/svg%3E";

// Replace these with your Supabase project credentials
const SUPABASE_URL = 'https://rouvbfejsyfcmswlsezd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvdXZiZmVqc3lmY21zd2xzZXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTIzOTgsImV4cCI6MjA5MDU2ODM5OH0.Mvwj05OpyjtIrEO3pF86bm0JPFk4m1cLjKIwKSEMHWU';

// PKCE flow so the web OAuth fallback's code exchange actually works
// (native Apple/Google sign-in uses signInWithIdToken and is unaffected).
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce' }
});

// ===== AUTH HELPERS =====
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// OAuth deep-link scheme for web-fallback flow (matches Info.plist CFBundleURLSchemes)
const OAUTH_REDIRECT_NATIVE = 'com.runitupdallas.app://auth/callback';
// Web OAuth returns to the app's own base URL (subpath-safe for GitHub Pages);
// supabase-js PKCE + detectSessionInUrl exchanges the ?code= on load.
const OAUTH_REDIRECT_WEB = new URL('.', window.location.href).href;

// Google iOS OAuth client ID (from Google Cloud Console → Credentials → iOS client)
// Must match the REVERSED client ID registered in Info.plist CFBundleURLSchemes.
const GOOGLE_IOS_CLIENT_ID = '594459306324-t5fv35piul5nb8fjbaer3leufeabnkrj.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID = '594459306324-f6ot8qg27qlshq7c54fqcf8kdut5oi1g.apps.googleusercontent.com';

let socialLoginInitialized = false;
async function initSocialLogin() {
  if (socialLoginInitialized) return;
  if (!window.Capacitor?.isNativePlatform()) return;
  const SocialLogin = window.Capacitor.Plugins?.SocialLogin;
  if (!SocialLogin) return;
  await SocialLogin.initialize({
    google: GOOGLE_IOS_CLIENT_ID ? {
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      iOSServerClientId: GOOGLE_WEB_CLIENT_ID || undefined
    } : undefined,
    apple: {
      clientId: 'com.runitupdallas.app'
    }
  });
  socialLoginInitialized = true;
}

function randomNonce(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== NATIVE APPLE SIGN-IN (iOS) =====
async function signInWithApple() {
  if (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins?.SocialLogin) {
    await initSocialLogin();
    const rawNonce = randomNonce();
    const hashedNonce = await sha256Hex(rawNonce);
    const res = await window.Capacitor.Plugins.SocialLogin.login({
      provider: 'apple',
      options: { scopes: ['email', 'name'], nonce: hashedNonce }
    });
    const idToken = res?.result?.idToken;
    if (!idToken) throw new Error('Apple sign-in did not return an identity token.');
    const { data, error } = await supabaseClient.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
      nonce: rawNonce
    });
    if (error) throw error;
    return data;
  }
  // Web fallback: PKCE OAuth redirect
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: OAUTH_REDIRECT_WEB }
  });
  if (error) throw error;
  return data;
}

// ===== NATIVE GOOGLE SIGN-IN (iOS) =====
async function signInWithGoogle() {
  if (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins?.SocialLogin) {
    if (!GOOGLE_IOS_CLIENT_ID) {
      throw new Error('Google sign-in not configured — set GOOGLE_IOS_CLIENT_ID in supabase.js.');
    }
    await initSocialLogin();
    const res = await window.Capacitor.Plugins.SocialLogin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'] }
    });
    const idToken = res?.result?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return an identity token.');
    const { data, error } = await supabaseClient.auth.signInWithIdToken({
      provider: 'google',
      token: idToken
    });
    if (error) throw error;
    return data;
  }
  // Web fallback: PKCE OAuth redirect
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT_WEB }
  });
  if (error) throw error;
  return data;
}

// Handle OAuth deep-link callback (web-fallback path only; native path returns directly)
async function handleOAuthCallback(url) {
  try {
    // exchangeCodeForSession expects the auth code, not the full deep-link URL
    const code = new URL(url).searchParams.get('code');
    if (!code) throw new Error('No auth code in callback URL');
    const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } catch (err) {
    console.error('OAuth exchange failed:', err);
    showToast('Sign-in didn\'t complete — try again.', 'error');
  } finally {
    if (window.Capacitor?.Plugins?.Browser) {
      try { await window.Capacitor.Plugins.Browser.close(); } catch {}
    }
  }
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

async function getSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabaseClient
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ===== PROFILE HELPERS =====
async function createUserProfile(profile) {
  const { data, error } = await supabaseClient
    .from('users')
    .insert(profile)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateUserProfile(id, updates) {
  const { data, error } = await supabaseClient
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getUserProfile(id) {
  const { data, error } = await supabaseClient
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ===== UPLOAD HELPER =====
async function uploadFile(bucket, path, file) {
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabaseClient.storage
    .from(bucket)
    .getPublicUrl(path);
  return publicUrl;
}

// ===== HAPTIC HELPERS =====
// Trigger native haptic feedback on Capacitor (iOS/Android). Silently no-ops
// on web or when the Haptics plugin isn't available.
async function haptic(style = 'light') {
  try {
    if (!window.Capacitor?.isNativePlatform()) return;
    const Haptics = window.Capacitor.Plugins?.Haptics;
    if (!Haptics) return;
    if (style === 'success') {
      await Haptics.notification({ type: 'SUCCESS' });
    } else if (style === 'warning') {
      await Haptics.notification({ type: 'WARNING' });
    } else if (style === 'error') {
      await Haptics.notification({ type: 'ERROR' });
    } else if (style === 'medium') {
      await Haptics.impact({ style: 'MEDIUM' });
    } else if (style === 'heavy') {
      await Haptics.impact({ style: 'HEAVY' });
    } else {
      await Haptics.impact({ style: 'LIGHT' });
    }
  } catch (err) {
    // Silently ignore haptic errors
  }
}

// ===== SHARE HELPER =====
async function shareRun(title, text, url) {
  const shareData = { title, text, url };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('Link copied — send it to your crew!', 'success');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast('Link copied!', 'success');
      } catch {
        showToast('Could not share — try copying the link manually.', 'error');
      }
    }
  }
}

function shareWeeklyRun(day, location, time, address) {
  const inviter = (typeof currentProfile !== 'undefined' && currentProfile?.display_name) ? currentProfile.display_name : null;
  const ref = (typeof currentProfile !== 'undefined' && currentProfile?.id) ? `?ref=${encodeURIComponent(currentProfile.id)}` : '';
  const url = `https://taylormadecreative.github.io/runitup-app-site${ref}`;
  const intro = inviter ? `${inviter} invited you to Run It UP! Dallas 🏃🏾‍♂️💨` : `Pull up to Run It UP! Dallas 🏃🏾‍♂️💨`;
  const text = `${intro}\n\n${day} @ ${location}\n${time} · ${address}\n\nAll paces welcome. No fees, just community.\n\nMap: https://maps.google.com/?q=${encodeURIComponent(address)}\nMore runs + RSVP: ${url}`;
  shareRun(`Run It UP! · ${day}`, text, url);
}

function shareSpecialEvent(title, date, location) {
  const text = `${title} with Run It UP! Dallas — ${date} at ${location}. You coming?`;
  const url = 'https://taylormadecreative.github.io/runitup-app-site';
  shareRun(title, text, url);
}

// ===== SANITIZATION HELPERS =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Legacy alias
function sanitizeHTML(str) { return escapeHtml(str); }

// Full attribute-safe escaping — unlike escapeHtml, also covers quotes,
// so values are safe inside single- OR double-quoted HTML attributes.
function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Safely embed a value as a JS string literal inside an inline on* handler:
//   `onclick="viewMember(${jsArg(user.id)})"`
// JSON.stringify produces the quoted, backslash-escaped literal; escapeAttr
// keeps it from breaking out of the surrounding HTML attribute.
function jsArg(value) {
  return escapeAttr(JSON.stringify(String(value ?? '')));
}

// Validate avatar URLs to prevent XSS via src attributes
function safeAvatarUrl(url) {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return DEFAULT_AVATAR;
}

// Same idea for arbitrary image URLs (chat images, event covers): only allow
// http(s)/data URLs, and escape for attribute context. Returns '' if unsafe.
function safeImageUrl(url) {
  if (!url) return '';
  const u = String(url);
  if (u.startsWith('https://') || u.startsWith('http://') || u.startsWith('data:image/')) return escapeAttr(u);
  return '';
}

// ===== GUEST DETECTION =====
// True if the current session is an anonymous / demo guest.
// Guest users have limited write access — can browse but can't DM, buddy, invite.
let _cachedGuestState = null;
async function isGuestUser() {
  if (_cachedGuestState !== null) return _cachedGuestState;
  try {
    const session = await getSession();
    const u = session?.user;
    if (!u) return false;
    // Supabase anonymous auth sets is_anonymous=true
    if (u.is_anonymous) { _cachedGuestState = true; return true; }
    // Fallback demo path: signup with guest_xxxx@runitup.demo email
    if (u.email && u.email.endsWith('@runitup.demo')) { _cachedGuestState = true; return true; }
    _cachedGuestState = false;
    return false;
  } catch {
    return false;
  }
}

function isGuestDisplayName() {
  return currentProfile?.display_name === 'Guest Runner';
}

// Synchronous-ish guard — relies on cache populated at login
function guardGuest(featureName = 'this feature') {
  if (_cachedGuestState === true || isGuestDisplayName()) {
    showGuestUpgradePrompt(featureName);
    return true;
  }
  return false;
}

function showGuestUpgradePrompt(featureName) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal" style="max-width: 340px;">
      <div style="font-size: 2.5rem; text-align: center; margin-bottom: var(--space-sm);">🔒</div>
      <div style="font-family: var(--font-display); font-weight: 900; font-size: 1.25rem; text-align: center; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: var(--space-xs);">Crew Members Only</div>
      <p class="confirm-message">Sign up to unlock ${escapeHtml(featureName)}. It takes 30 seconds.</p>
      <div class="confirm-actions">
        <button class="btn-secondary btn-sm" data-choice="cancel">Maybe Later</button>
        <button class="btn-primary btn-sm" data-choice="signup">Join the Crew</button>
      </div>
    </div>
  `;
  const cleanup = () => overlay.remove();
  overlay.querySelector('[data-choice="cancel"]').onclick = cleanup;
  overlay.querySelector('[data-choice="signup"]').onclick = async () => {
    cleanup();
    await signOut();
    renderSignup();
    showScreen('signup');
  };
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
  document.body.appendChild(overlay);
}

// ===== BLOCK LIST (client-side cache) =====
// Load once on login, update on block/unblock. Consulted synchronously by
// group chat, buddy board, and member profile to hide/disable blocked users.
const _blockCache = { blockedBy: new Set(), blocking: new Set() };

async function loadBlockLists() {
  if (!currentProfile) return;
  try {
    const { data } = await supabaseClient.from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${currentProfile.id},blocked_id.eq.${currentProfile.id}`);
    _blockCache.blocking.clear();
    _blockCache.blockedBy.clear();
    (data || []).forEach(b => {
      if (b.blocker_id === currentProfile.id) _blockCache.blocking.add(b.blocked_id);
      if (b.blocked_id === currentProfile.id) _blockCache.blockedBy.add(b.blocker_id);
    });
  } catch (err) {
    console.warn('[blocks] load failed', err);
  }
}

function isBlocked(userId) {
  // True if EITHER side has blocked the other (mutual invisibility)
  return _blockCache.blocking.has(userId) || _blockCache.blockedBy.has(userId);
}
function isBlockingByMe(userId) { return _blockCache.blocking.has(userId); }

async function blockUser(userId) {
  const { error } = await supabaseClient.from('user_blocks').insert({
    blocker_id: currentProfile.id,
    blocked_id: userId
  });
  if (error && !error.message?.includes('duplicate')) throw error;
  _blockCache.blocking.add(userId);
}

async function unblockUser(userId) {
  const { error } = await supabaseClient.from('user_blocks')
    .delete()
    .eq('blocker_id', currentProfile.id)
    .eq('blocked_id', userId);
  if (error) throw error;
  _blockCache.blocking.delete(userId);
}

async function getBlockedProfiles() {
  if (_blockCache.blocking.size === 0) return [];
  const ids = Array.from(_blockCache.blocking);
  const { data } = await supabaseClient.from('users')
    .select('id, display_name, avatar_url, pace_group')
    .in('id', ids);
  return data || [];
}

// ===== NATIVE-LOOKING CONFIRM MODAL =====
// Replaces ugly browser confirm() with an in-app styled prompt.
function confirmNative(message, confirmText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal">
        <p class="confirm-message">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn-secondary btn-sm" data-choice="cancel">${escapeHtml(cancelText)}</button>
          <button class="btn-primary btn-sm" data-choice="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('[data-choice="ok"]').onclick = () => cleanup(true);
    overlay.querySelector('[data-choice="cancel"]').onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    document.body.appendChild(overlay);
  });
}

// ===== TOAST HELPER =====
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.remove();
  };

  // Animated exit: .toast-exit transitions out, remove on transitionend
  // (setTimeout fallback covers reduced-motion / interrupted transitions).
  const dismiss = () => {
    if (removed || toast.classList.contains('toast-exit')) return;
    toast.classList.add('toast-exit');
    toast.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 350);
  };

  // Swipe horizontally to dismiss
  let startX = null;
  let deltaX = 0;
  toast.addEventListener('touchstart', (e) => {
    if (removed) return;
    startX = e.touches[0].clientX;
    deltaX = 0;
    toast.style.transition = 'none'; // track the finger directly
  }, { passive: true });
  toast.addEventListener('touchmove', (e) => {
    if (startX === null) return;
    deltaX = e.touches[0].clientX - startX;
    toast.style.transform = `translateX(${deltaX}px)`;
    toast.style.opacity = String(Math.max(0.35, 1 - Math.abs(deltaX) / 200));
  }, { passive: true });
  const settleSwipe = () => {
    if (startX === null) return;
    startX = null;
    toast.style.transition = ''; // re-enable the CSS transition
    if (Math.abs(deltaX) > 60) {
      // Past threshold: fling off in swipe direction, fade, then remove
      toast.style.transform = `translateX(${deltaX > 0 ? '110%' : '-110%'})`;
      toast.style.opacity = '0';
      toast.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 350);
    } else {
      // Below threshold: spring back
      toast.style.transform = '';
      toast.style.opacity = '';
    }
  };
  toast.addEventListener('touchend', settleSwipe);
  toast.addEventListener('touchcancel', settleSwipe);

  setTimeout(dismiss, 3000);
}

// ===== DATE HELPERS =====
// All run days/times are Dallas-local (America/Chicago). Never derive them
// from the device timezone or UTC — both break for evening runs (7 PM CT is
// midnight UTC) and for traveling members.

// 'YYYY-MM-DD' of a Date in Chicago
function chicagoDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

// Normalize a timestamp to local noon of its Chicago calendar day — safe for
// week grouping (streaks, badges, challenges) on any device.
function chicagoDay(dateStr) {
  return new Date(chicagoDateStr(new Date(dateStr)) + 'T12:00:00');
}

// The absolute instant when a Chicago wall clock shows dateStr @ hour:minute.
// Two Intl round-trips converge across DST boundaries.
function chicagoWallClockToDate(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(guess);
    const get = t => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
    const shownHour = get('hour') === 24 ? 0 : get('hour');
    const shown = Date.UTC(get('year'), get('month') - 1, get('day'), shownHour, get('minute'));
    const want = Date.UTC(y, m - 1, d, hour, minute);
    guess = new Date(guess.getTime() + (want - shown));
  }
  return guess;
}

function getNextRunDate(dayOfWeek) {
  // dayOfWeek: 0 = Sunday, 1 = Monday, 2 = Tuesday, 6 = Saturday
  const isEvening = (dayOfWeek === 1 || dayOfWeek === 2);
  const runHour = isEvening ? 19 : 8;       // 7 PM Mon/Tue, 8:30 AM Sat/Sun
  const runMinute = isEvening ? 0 : 30;
  const now = new Date();
  // Walk forward through Chicago calendar days to the next matching weekday.
  // Today's run stays selected until Chicago midnight — even after the run —
  // so post-run check-ins work (isCheckInWindow promises "through 11:59 PM").
  for (let i = 0; i < 8; i++) {
    const dstr = chicagoDateStr(new Date(now.getTime() + i * 24 * 60 * 60 * 1000));
    const dow = new Date(dstr + 'T12:00:00Z').getUTCDay();
    if (dow !== dayOfWeek) continue;
    if (i === 0 && now > chicagoWallClockToDate(dstr, 23, 59)) continue;
    return chicagoWallClockToDate(dstr, runHour, runMinute);
  }
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // unreachable fallback
}

function formatCountdown(targetDate) {
  const now = new Date();
  const diff = targetDate - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, active: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, active: false };
}

function isCheckInWindow(targetDate) {
  if (typeof DEMO_MODE !== 'undefined' && DEMO_MODE) return true;
  const now = new Date();
  // Open window: 4 hours before through end of the run's CHICAGO day (11:59 PM
  // Dallas time) — generous so runners can check in any time that day, even
  // after the run, and correct on devices in other timezones.
  const windowStart = new Date(targetDate.getTime() - 4 * 60 * 60 * 1000);
  const windowEnd = chicagoWallClockToDate(chicagoDateStr(targetDate), 23, 59);
  return now >= windowStart && now <= windowEnd;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

// When does check-in open for a run? (window opens 4h before start —
// keep in sync with isCheckInWindow above). Returns e.g. "TUE 3 PM".
function checkInOpensLabel(targetDate) {
  const opens = new Date(targetDate.getTime() - 4 * 60 * 60 * 1000);
  const day = opens.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Chicago' });
  const time = opens.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
  }).replace(':00', '');
  return `${day} ${time}`.toUpperCase();
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit'
  });
}

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// ===== PACE GROUP DISPLAY =====
const PACE_GROUPS = {
  walk_it_up: { label: 'Walk It Up', pace: '16+ min/mi' },
  jog_it_up: { label: 'Jog It Up', pace: '12-16 min/mi' },
  run_it_up: { label: 'Run It Up', pace: '8-12 min/mi' },
  sprint_it_up: { label: 'Sprint It Up', pace: 'Under 8 min/mi' }
};

function paceGroupBadgeHTML(paceGroup) {
  const info = PACE_GROUPS[paceGroup];
  if (!info) return '';
  return `<span class="pace-badge ${paceGroup}">${info.label}</span>`;
}

// ===== WEEKLY RUN DATA =====
const WEEKLY_RUNS = [
  {
    day: 'monday',
    dayOfWeek: 1,
    label: 'MONDAY',
    location: 'Trinity Groves',
    address: '3118 Gulden Lane, Dallas, TX',
    mapsUrl: 'https://maps.google.com/?q=3118+Gulden+Lane+Dallas+TX',
    time: '7:00 PM',
    distance: '2 miles',
    eventType: 'weekly_monday'
  },
  {
    day: 'tuesday',
    dayOfWeek: 2,
    label: 'TUESDAY',
    location: 'Deep Ellum',
    address: '2823 Main St, Dallas, TX',
    mapsUrl: 'https://maps.google.com/?q=2823+Main+St+Dallas+TX',
    time: '7:00 PM',
    distance: '2 miles',
    eventType: 'weekly_tuesday'
  },
  {
    day: 'saturday',
    dayOfWeek: 6,
    label: 'SATURDAY',
    location: 'Fair Oaks Park',
    address: '7621 Fair Oaks Ave, Dallas, TX 75231',
    mapsUrl: 'https://maps.google.com/?q=7621+Fair+Oaks+Ave+Dallas+TX+75231',
    time: '8:30 AM',
    distance: '3-5 miles',
    eventType: 'weekly_saturday'
  },
  {
    day: 'sunday',
    dayOfWeek: 0,
    label: 'SUNDAY',
    location: 'Levy Event Plaza',
    address: '501 E Las Colinas Blvd, Irving, TX',
    mapsUrl: 'https://maps.google.com/?q=501+E+Las+Colinas+Blvd+Irving+TX',
    time: '8:30 AM',
    distance: '3 miles',
    eventType: 'weekly_sunday'
  }
];
