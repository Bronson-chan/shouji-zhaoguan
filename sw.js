const CACHE = 'zhaoguan-offline-v17';
const CORE = [
  './', './index.html', './styles.css', './app.js', './pipes.json', './manifest.webmanifest',
  './assets/rack-A.jpg', './assets/rack-B.jpg', './assets/rack-C.jpg', './assets/rack-D.jpg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png', './assets/icons/apple-touch-icon.png',
  './assets/splash/splash-1290x2796.png', './assets/splash/splash-1179x2556.png', './assets/splash/splash-1170x2532.png',
  './assets/splash/splash-1125x2436.png', './assets/splash/splash-828x1792.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./index.html', copy)); return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});

