// WatchPick TMDB proxy (Vercel Function)
// - Keeps the TMDB API key server-side (env var TMDB_API_KEY) instead of shipping it in index.html.
// - Only forwards the read-only endpoints the app actually uses (anything else -> 400), so it can't be
//   used as a general-purpose TMDB relay on your key.
// - Successful responses carry s-maxage, so Vercel's CDN caches them and every user shares one copy:
//   most Discover/provider/detail requests never reach TMDB at all.
// - Errors are never cached; TMDB 429s are passed through with Retry-After so the client can back off.

const ALLOWED = /^\/(search\/(multi|movie|tv|person|keyword)|discover\/(movie|tv)|(movie|tv)\/\d{1,9}(\/(watch\/providers|recommendations))?|person\/\d{1,9})$/;

// CDN freshness per endpoint (seconds). stale-while-revalidate keeps responses instant while refreshing.
function ttlFor(path) {
  if (path.endsWith('/watch/providers')) return 6 * 3600;   // availability changes, but not hourly
  if (path.startsWith('/search/')) return 3600;
  if (path.startsWith('/discover/')) return 6 * 3600;
  return 24 * 3600;                                          // title/person detail, recommendations
}

function sameSite(req) {
  // Browsers always send Origin on cross-origin fetches. If a foreign site's page calls this endpoint,
  // refuse it. Requests with no Origin/Referer (same-origin GETs, the PWA, curl) are allowed - this stops
  // casual hot-linking from other websites, it is NOT an authentication layer.
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const src = req.headers.origin || req.headers.referer;
  if (!src) return true;
  try { return new URL(src).host.toLowerCase() === host; } catch (e) { return false; }
}

module.exports = async (req, res) => {
  const deny = (code, msg) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(code).json({ error: msg });
  };
  if (req.method !== 'GET') return deny(405, 'method not allowed');
  if (!sameSite(req)) return deny(403, 'forbidden');
  const key = process.env.TMDB_API_KEY;
  if (!key) return deny(500, 'TMDB_API_KEY not configured');

  const raw = typeof req.query.p === 'string' ? req.query.p : '';
  if (!raw || raw.length > 1500 || raw[0] !== '/') return deny(400, 'bad path');
  let target;
  try { target = new URL('https://api.themoviedb.org/3' + raw); } catch (e) { return deny(400, 'bad path'); }
  const path = target.pathname.replace(/^\/3/, '');
  if (!ALLOWED.test(path)) return deny(400, 'endpoint not allowed');
  target.searchParams.delete('api_key');
  target.searchParams.set('api_key', key);

  let upstream;
  try {
    upstream = await fetch(target.toString(), { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return deny(504, 'upstream timeout');
  }
  const body = await upstream.text();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!upstream.ok) {
    res.setHeader('Cache-Control', 'no-store');
    const ra = upstream.headers.get('retry-after');
    if (ra) res.setHeader('Retry-After', ra);
    // 429 and 4xx pass through as-is (4xx is not retryable); only upstream 5xx becomes 502.
    return res.status(upstream.status >= 500 ? 502 : upstream.status).send(body);
  }
  const ttl = ttlFor(path);
  res.setHeader('Cache-Control', `public, max-age=300, s-maxage=${ttl}, stale-while-revalidate=86400`);
  return res.status(200).send(body);
};
