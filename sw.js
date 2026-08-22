// WatchPick Service Worker
const CACHE = 'watchpick-v1';
const ASSETS = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('api.themoviedb.org') ||
      e.request.url.includes('pythonanywhere.com/api')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
