// WatchPick Service Worker
// v2 (Sep 2026): the old v1 fetch handler only ever cached '/' ONCE, at install time, and never
// wrote to the cache again — so the offline/failure fallback stayed frozen at whichever build was
// live the very first time a device installed the app, potentially many deploys behind. On a
// flaky/failing connection (very common for testers on mobile data, and inside the Play Store
// Trusted Web Activity wrapper, which is just Chrome pointed at this same origin), that stale
// snapshot got served silently instead of an error, looking exactly like "not seeing the latest
// version" — and the visible stall while the network attempt ran its course before falling back
// read as "latency". Fixed below: every successful fetch now refreshes the cache, so the fallback
// is always the most recently-seen good version, not a permanently frozen first-install snapshot.
const CACHE = 'watchpick-v2'; // bumped from v1 so activate() actually purges the old, stale cache
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
    fetch(e.request).then(res => {
      // Keep the offline/failure fallback fresh: cache every successful same-origin GET response
      // as it comes in, so a later failure falls back to the last version this device actually
      // saw succeed — not to a snapshot frozen at first install.
      if (res && res.ok) {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
