const CACHE_NAME = 'xplore-3571-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/app.css',
  '/js/app.js',
  '/js/config.js'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event dengan Penanganan CORS aman
self.addEventListener('fetch', (e) => {
  // Jika request ke CDN luar, biarkan network biasa yang ambil, jangan dicegat cache dulu jika bermasalah
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('unpkg.com')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Untuk aset lokal, gunakan Cache First, Fallback to Network
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});