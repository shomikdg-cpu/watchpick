// WatchPick Service Worker
// v3 (Sep 2026) - keeps v2's guarantee (every successful GET refreshes the cache, so the offline
// fallback is never a frozen first-install snapshot) and fixes the launch stall:
//  * network-first navigations now fall back to the cached copy after NAV_TIMEOUT_MS instead of
//    waiting out a dead/slow connection (the cache still refreshes in the background)
//  * navigation preload lets the network request start in parallel with SW boot
//  * only same-origin + Google Fonts requests go through the SW; TMDB posters (wsrv.nl / image.tmdb.org)
//    go straight to the browser, removing a SW hop from every poster
//  * install pre-caches the app shell so the very first offline launch works
const CACHE = 'watchpick-v3';
const ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (err) {}
    }
  })());
  self.clients.claim();
});

function cachePut(e, req, res) {
  const p = caches.open(CACHE).then(c => c.put(req, res)).catch(() => {});
  try { e.waitUntil(p); } catch (err) { /* event already settled (timeout fallback served) - put still runs */ }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.includes('pythonanywhere.com/api')) return;
  const sameOrigin = url.origin === self.location.origin;
  const fontHost = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fontHost) return; // posters etc. bypass the SW
  if (sameOrigin && url.pathname.startsWith('/api/')) return; // TMDB proxy: HTTP/CDN caching handles it

  e.respondWith((async () => {
    const isNav = req.mode === 'navigate';
    const net = (async () => {
      const pre = e.preloadResponse ? await e.preloadResponse : null;
      const res = pre || await fetch(req);
      if (res && res.ok) cachePut(e, req, res.clone());
      return res;
    })();
    const fallback = () => caches.match(req, { ignoreSearch: isNav });
    if (!isNav) {
      try { return await net; } catch (err) { return (await fallback()) || Response.error(); }
    }
    const timeout = new Promise(r => setTimeout(() => r(null), NAV_TIMEOUT_MS));
    const first = await Promise.race([net.catch(() => null), timeout]);
    if (first) return first;
    const cached = await fallback();
    if (cached) return cached;
    try { return await net; } catch (err) { return Response.error(); }
  })());
});
