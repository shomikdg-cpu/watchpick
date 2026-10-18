// WatchPick title page (Vercel Function) - served at /watch/<slug> via the rewrite in vercel.json.
// Pilot only: slugs must be in api/_pilot.js, anything else is a 404 (so this cannot be used to crawl TMDB).
// The TMDB key stays server-side (TMDB_API_KEY). Responses are cached at the CDN for 6h, so each page costs
// a handful of TMDB calls per refresh, not per visitor.

const { PILOT } = require('./_pilot');

const SITE = 'https://watchpick-dun.vercel.app';
const PLAY = 'https://play.google.com/store/apps/details?id=com.examinedscreen.watchpick&referrer=utm_source%3Dweb%26utm_medium%3Dtitlepage';
const TMDB_LOGO = 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
// JSON for a <script type="application/ld+json"> block: '<' escaped so no value can close the tag.
const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

async function tmdb(path, key) {
  const u = new URL('https://api.themoviedb.org/3' + path);
  u.searchParams.set('api_key', key);
  const r = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('tmdb ' + r.status);
  return r.json();
}

function page({ entry, d, prov, checked }) {
  const title = d.title || entry.title;
  const year = (d.release_date || '').slice(0, 4) || String(entry.year);
  const IN = (prov && prov.results && prov.results.IN) || {};
  const names = (arr) => (Array.isArray(arr) ? arr.map((p) => p.provider_name).filter(Boolean) : []);
  const groups = [
    ['Stream', names(IN.flatrate)],
    ['Free with ads', names(IN.ads)],
    ['Rent', names(IN.rent)],
    ['Buy', names(IN.buy)],
  ].filter(([, n]) => n.length);
  const where = groups.length
    ? groups.map(([label, n]) => `<li><b>${esc(label)}:</b> ${n.map(esc).join(', ')}</li>`).join('')
    : '<li>No India streaming, rent or buy listing was found on this check.</li>';
  const genres = (d.genres || []).map((g) => g.name).filter(Boolean);
  const desc = (d.overview || '').trim();
  const clip = (t, n) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)).replace(/[,;:.\s]+$/, '') + '...');
  const metaDesc = clip(`Where to watch ${title} (${year}) in India. ${groups.length ? 'Streaming options listed as of ' + checked + '.' : 'Availability checked ' + checked + '.'} ${desc}`.replace(/\s+/g, ' ').trim(), 300);
  const url = `${SITE}/watch/${entry.slug}`;
  const poster = d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : '';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: title,
    datePublished: d.release_date || String(entry.year),
    url,
    ...(desc ? { description: desc } : {}),
    ...(poster ? { image: poster } : {}),
    ...(genres.length ? { genre: genres } : {}),
  };
  const vote = d.vote_count ? `${(Math.round(d.vote_average * 10) / 10).toFixed(1)}/10 from ${d.vote_count} TMDB votes` : '';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} (${esc(year)}): where to watch in India | WatchPick</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="WatchPick">
<meta property="og:title" content="${esc(title)} (${esc(year)}): where to watch in India">
<meta property="og:description" content="${esc(metaDesc)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(poster || SITE + '/icon-512.png')}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${ldJson(ld)}</script>
<style>
:root{color-scheme:dark light}
body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#eee}
main{max-width:720px;margin:0 auto;padding:20px 16px 40px}
a{color:#e8c97a}
h1{font:700 28px/1.2 Georgia,serif;margin:0 0 4px}
.sub{color:#aaa;margin:0 0 16px}
.row{display:flex;gap:16px;flex-wrap:wrap}
img.p{width:160px;height:auto;border-radius:8px;align-self:flex-start}
.col{flex:1;min-width:220px}
ul{padding-left:18px;margin:6px 0 12px}
.cta{display:inline-block;margin:8px 8px 0 0;padding:11px 18px;border-radius:999px;background:#e8c97a;color:#0a0a0a;font-weight:700;text-decoration:none}
.cta.alt{background:transparent;color:#e8c97a;border:1px solid #e8c97a}
footer{margin-top:28px;padding-top:14px;border-top:1px solid #2a2a2a;font-size:13px;color:#aaa}
@media (prefers-color-scheme:light){body{background:#f7f5f1;color:#1a1a1a}a{color:#7d5a0a}.sub,footer{color:#555}.cta{background:#7d5a0a;color:#fff}.cta.alt{background:transparent;color:#7d5a0a;border-color:#7d5a0a}footer{border-color:#d8d4cb}}
</style></head>
<body><main>
<p><a href="${SITE}/">WatchPick</a></p>
<h1>${esc(title)} <span style="font-weight:400">(${esc(year)})</span></h1>
<p class="sub">${esc([genres.join(', '), d.runtime ? d.runtime + ' min' : ''].filter(Boolean).join(' · '))}</p>
<div class="row">
${poster ? `<img class="p" src="${esc(poster)}" alt="Poster of ${esc(title)}" width="160" height="240" loading="lazy">` : ''}
<div class="col">
<h2 style="font-size:18px;margin:0">Where to watch in India</h2>
<ul>${where}</ul>
<p style="font-size:13px;color:#aaa;margin:0">Checked ${esc(checked)}. Availability changes often, so confirm on the platform before you subscribe.</p>
${desc ? `<h2 style="font-size:18px;margin:18px 0 4px">About</h2><p style="margin:0">${esc(desc)}</p>` : ''}
${vote ? `<p style="font-size:13px;color:#aaa">${esc(vote)}</p>` : ''}
</div></div>
<p><a class="cta" href="${esc(PLAY)}">Get WatchPick on Google Play</a><a class="cta alt" href="${SITE}/">Open the web app</a></p>
<footer>
<a href="https://www.themoviedb.org" rel="noopener"><img src="${TMDB_LOGO}" alt="TMDB" height="16"></a>
<p style="margin:6px 0 0">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch via TMDB.</p>
</footer>
</main></body></html>`;
}

function fail(res, code, msg) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(code).send(`<!DOCTYPE html><meta charset="utf-8"><title>${esc(msg)}</title><p>${esc(msg)}. <a href="${SITE}/">Go to WatchPick</a></p>`);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  const entry = PILOT.find((p) => p.slug === slug);
  if (!entry) return fail(res, 404, 'Page not found');
  const key = process.env.TMDB_API_KEY;
  if (!key) return fail(res, 500, 'Temporarily unavailable');
  try {
    const q = `/search/movie?query=${encodeURIComponent(entry.title)}&language=en-US&include_adult=false`;
    const found = await tmdb(q, key);
    // Exact (normalised) title match, release year within 1 of the pilot entry: TMDB's release_date is often
    // the festival or international date, a year off the Indian release the slug is named for.
    const hits = (found.results || [])
      .filter((r) => {
        const titleOk = norm(r.title) === norm(entry.title) || norm(r.original_title) === norm(entry.title);
        const y = parseInt(String(r.release_date || '').slice(0, 4), 10);
        return titleOk && Number.isInteger(y) && Math.abs(y - entry.year) <= 1;
      })
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
    if (!hits.length) return fail(res, 404, 'Page not found');
    const id = hits[0].id;
    if (!Number.isInteger(id)) return fail(res, 404, 'Page not found');
    const [d, prov] = await Promise.all([tmdb(`/movie/${id}?language=en-US`, key), tmdb(`/movie/${id}/watch/providers`, key)]);
    const checked = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).send(page({ entry, d, prov, checked }));
  } catch (e) {
    return fail(res, 502, 'Temporarily unavailable');
  }
};
