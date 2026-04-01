// Demo mode: set to true to enable check-in at any time
const DEMO_MODE = true;

// Default avatar for users without a profile photo
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23252525'/%3E%3Ctext x='50' y='55' text-anchor='middle' dominant-baseline='middle' font-family='Inter,sans-serif' font-size='40' font-weight='600' fill='%239A9A9A'%3E%3F%3C/text%3E%3C/svg%3E";

// Replace these with your Supabase project credentials
const SUPABASE_URL = 'https://rouvbfejsyfcmswlsezd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvdXZiZmVqc3lmY21zd2xzZXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTIzOTgsImV4cCI6MjA5MDU2ODM5OH0.Mvwj05OpyjtIrEO3pF86bm0JPFk4m1cLjKIwKSEMHWU';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

async function signInWithGoogle() {
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
  return data;
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

// ===== SANITIZATION HELPERS =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Legacy alias
function sanitizeHTML(str) { return escapeHtml(str); }

// Validate avatar URLs to prevent XSS via src attributes
function safeAvatarUrl(url) {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return DEFAULT_AVATAR;
}

// ===== TOAST HELPER =====
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== DATE HELPERS =====
function getNextRunDate(dayOfWeek) {
  // dayOfWeek: 1 = Monday, 2 = Tuesday, 6 = Saturday
  const now = new Date();
  const current = now.getDay();
  let daysUntil = dayOfWeek - current;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0) {
    // If it's the same day, check if the run has passed
    const runHour = dayOfWeek === 6 ? 8 : 19; // 8AM Sat, 7PM Mon/Tue
    if (now.getHours() >= runHour + 1) daysUntil = 7;
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(dayOfWeek === 6 ? 8 : 19, 0, 0, 0);
  return next;
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
  const windowStart = new Date(targetDate.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(targetDate.getTime() + 60 * 60 * 1000);
  return now >= windowStart && now <= windowEnd;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
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
    address: 'Under the Bridge, Trinity Groves, Dallas, TX',
    mapsUrl: 'https://maps.google.com/?q=Trinity+Groves+Dallas+TX',
    time: '7:00 PM',
    distance: '2 miles',
    eventType: 'weekly_monday'
  },
  {
    day: 'tuesday',
    dayOfWeek: 2,
    label: 'TUESDAY',
    location: 'Deep Ellum',
    address: 'Kanvas Sports Bar, Deep Ellum, Dallas, TX',
    mapsUrl: 'https://maps.google.com/?q=Kanvas+Sports+Bar+Deep+Ellum+Dallas+TX',
    time: '7:00 PM',
    distance: '2 miles',
    eventType: 'weekly_tuesday'
  },
  {
    day: 'saturday',
    dayOfWeek: 6,
    label: 'SATURDAY',
    location: 'Fair Oaks Park',
    address: '7501 Fair Oaks Ave, Dallas, TX 75231',
    mapsUrl: 'https://maps.google.com/?q=Fair+Oaks+Park+Dallas+TX',
    time: '8:00 AM',
    distance: '3-5 miles',
    eventType: 'weekly_saturday'
  }
];
