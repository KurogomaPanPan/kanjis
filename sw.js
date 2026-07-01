// Service Worker for offline caching.
const CACHE_NAME = 'kanji-writing-root-v10';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './KDLT.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(name => name !== CACHE_NAME && caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.url.includes('cdn.jsdelivr.net/gh/KanjiVG/kanjivg')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          })
        )
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
