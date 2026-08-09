const CACHE_NAME = 'runitup-v18';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/auth.css',
  './css/home.css',
  './css/events.css',
  './css/community.css',
  './css/stats.css',
  './css/profile.css',
  './css/desktop.css',
  './css/desktop-home.css',
  './css/desktop-stats.css',
  './css/desktop-community.css',
  './css/desktop-events.css',
  './css/desktop-auth.css',
  './assets/vendor/supabase.min.js',
  './js/app.js',
  './js/supabase.js',
  './js/auth.js',
  './js/home.js',
  './js/events.js',
  './js/buddy.js',
  './js/community.js',
  './js/dms.js',
  './js/run-tracker.js',
  './js/stats.js',
  './js/profile.js',
  './js/checkin.js',
  './assets/logo.png',
  './assets/logo-192.png'
];
// Photos are NOT precached — the stale-while-revalidate fetch handler caches
// them on first natural use, so first-time visitors don't pay ~6MB up front.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Bypass by origin, not substring — a substring check on 'supabase' would
  // also match our own ./js/supabase.js and vendored supabase.min.js, which
  // must be served from cache for offline boot to work. Cross-origin is
  // bypassed except Google Fonts, which we still want cached for offline.
  const url = new URL(event.request.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;

  // Stale-while-revalidate for fonts and same-origin GETs: serve cache fast,
  // refresh it in the background so updates still land.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const refresh = fetch(event.request)
        .then((res) => {
          if (res && res.ok && event.request.method === 'GET') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached); // offline: fall back to whatever we have
      return cached || refresh;
    })
  );
});
