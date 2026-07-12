const CACHE_NAME = 'runitup-v15';
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
  './assets/logo-192.png',
  './assets/logo-512.png',
  './assets/photos/hero.jpg',
  './assets/photos/night-sprint.jpg',
  './assets/photos/solo-neon.jpg',
  './assets/photos/solo-skyline.jpg',
  './assets/photos/pack-street.jpg',
  './assets/photos/duo-women.jpg',
  './assets/photos/low-angle-alley.jpg',
  './assets/photos/low-angle-urban.jpg',
  './assets/photos/low-angle-film.jpg',
  './assets/photos/above-night.jpg',
  './assets/photos/above-crowd.jpg',
  './assets/photos/motion-night.jpg',
  './assets/photos/motion-brick.jpg',
  './assets/photos/motion-blur.jpg'
];

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
  const url = event.request.url;
  if (url.includes('supabase') || url.includes('open-meteo')) return;

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
