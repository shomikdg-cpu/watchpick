#!/usr/bin/env python3
"""WatchPick security scan: exposed secrets, unescaped innerHTML sinks, proxy integrity.
Usage: python3 wp_scan.py <repo_dir>   -> prints a report, exit 1 if any HIGH finding."""
import os, re, sys, json

root = sys.argv[1]
TEXT_EXT = ('.html', '.js', '.json', '.py', '.md', '.txt', '.yml', '.yaml', '.env', '.toml', '.cfg', '.ini')
findings = []  # (severity, file, line, message)

def add(sev, f, ln, msg): findings.append((sev, f, ln, msg))

SECRET_PATTERNS = [
    ('TMDB v3 key / 32-hex secret', re.compile(r'(?<![0-9a-fA-F])[0-9a-f]{32}(?![0-9a-fA-F])')),
    ('TMDB v4 read token / JWT', re.compile(r'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}')),
    ('api_key with literal value', re.compile(r'api_key\s*[=:]\s*[\'"]?[A-Za-z0-9]{16,}')),
    ('OpenAI/Anthropic-style key', re.compile(r'\b(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,})')),
    ('AWS access key', re.compile(r'\bAKIA[0-9A-Z]{16}\b')),
    ('GitHub token', re.compile(r'\bgh[pousr]_[A-Za-z0-9]{30,}\b')),
    ('Hard-coded secret/password', re.compile(r'(?i)\b(secret|password|passwd|private_key)\b\s*[=:]\s*[\'"][^\'"\s]{8,}[\'"]')),
]
# fields that come from TMDB / users and must never reach innerHTML raw
RISKY = re.compile(r'(?<![\w$])(?:[\w$]+(?:\??\.[\w$]+)*\??\.)?(title|name|original_title|original_name|overview|tagline|'
                   r'character|job|biography|place_of_birth|sourceTitle|others|provider_name|directorName|dopName|'
                   r'also_known_as|imdb_id|q|query)(?![\w$])')
SAFE_FUNCS = {'esc', 'jsArg', 'enc', 'encodeURIComponent', 'initials', 'url'}
NON_OUTPUT_AFTER = re.compile(r'\s*(===|!==|==|!=|\?(?![.?])|&&|\.length\b|\.includes\(|\.startsWith\(|\.test\()')
HTMLISH = re.compile(r'<[a-zA-Z/!]|innerHTML|outerHTML|insertAdjacentHTML')

def _skip_str(t, i):
    q = t[i]; i += 1
    while i < len(t) and t[i] != q:
        i += 2 if t[i] == '\\' else 1
    return i + 1

def _match_brace(t, i):
    """t[i] is just after '${' ; return index of the matching '}'."""
    depth = 1
    while i < len(t):
        c = t[i]
        if c in '\'"': i = _skip_str(t, i); continue
        if c == '`': i = _skip_template(t, i + 1, None); continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return i
        i += 1
    return i

def _skip_template(t, i, segs):
    """i just after an opening backtick; collect ${} code into segs; return index after closing backtick."""
    while i < len(t) and t[i] != '`':
        if t[i] == '\\': i += 2; continue
        if t.startswith('${', i):
            j = _match_brace(t, i + 2)
            if segs is not None: segs.extend(code_segments(t[i + 2:j]))
            i = j + 1; continue
        i += 1
    return i + 1

def code_segments(expr):
    """Split an expression into code-only segments: string literals blanked, template text dropped,
    nested ${} expressions analysed as their own segments."""
    segs, out, i = [], [], 0
    while i < len(expr):
        c = expr[i]
        if c in '\'"':
            j = _skip_str(expr, i); out.append('""'); i = j; continue
        if c == '`':
            i = _skip_template(expr, i + 1, segs); out.append('""'); continue
        out.append(c); i += 1
    segs.insert(0, ''.join(out))
    return segs

def guarded(code, pos):
    """True if the token at pos sits inside a call to a SAFE_FUNCS function (any nesting level)."""
    depth = 0
    for k in range(pos - 1, -1, -1):
        ch = code[k]
        if ch == ')': depth += 1
        elif ch == '(':
            if depth == 0:
                m = re.search(r'([\w$]+)\s*$', code[:k])
                if m and m.group(1) in SAFE_FUNCS: return True
            else: depth -= 1
    return False

def risky_outputs(expr):
    hits = []
    for seg in code_segments(expr):
        for m in RISKY.finditer(seg):
            if guarded(seg, m.start()): continue
            if NON_OUTPUT_AFTER.match(seg, m.end()): continue
            hits.append(m.group(0))
    return hits

def interpolations(line):
    i = 0
    while True:
        i = line.find('${', i)
        if i < 0: return
        j = _match_brace(line, i + 2)
        yield line[i + 2:j]
        i = j + 1

for dp, dn, fn in os.walk(root):
    if '.git' in dp.split(os.sep) or 'node_modules' in dp: continue
    for f in fn:
        p = os.path.join(dp, f); rel = os.path.relpath(p, root)
        if not f.endswith(TEXT_EXT) and f not in ('.env',): continue
        try: lines = open(p, encoding='utf-8', errors='ignore').read().split('\n')
        except Exception: continue
        for n, line in enumerate(lines, 1):
            if len(line) > 5000: line = line[:5000]
            for label, rx in SECRET_PATTERNS:
                m = rx.search(line)
                if m:
                    # ignore obvious non-secrets: sha lines in lockfiles, assetlinks fingerprints
                    if f in ('assetlinks.json',) or 'sha256_cert' in line: continue
                    add('HIGH', rel, n, f'{label}: "{m.group(0)[:6]}…" (value hidden)')
            if f.endswith(('.html', '.js')) and HTMLISH.search(line) and '${' in line:
                for expr in interpolations(line):
                    for h in risky_outputs(expr):
                        add('HIGH', rel, n, f'unescaped TMDB/user string in HTML: {h}')
                if re.search(r"on\w+=\"[^\"]*'\$\{[^}]*\b(name|title)\b", line):
                    add('HIGH', rel, n, 'string spliced into inline event handler (use jsArg())')

# proxy integrity checks
idx = os.path.join(root, 'index.html')
if os.path.exists(idx):
    s = open(idx, encoding='utf-8', errors='ignore').read()
    if re.search(r'fetch\([^)]*api\.themoviedb\.org|https://api\.themoviedb\.org/3\$\{', s):
        add('HIGH', 'index.html', 0, 'browser calls api.themoviedb.org directly (should go via /api/tmdb)')
    if 'api_key=${' in s:
        add('HIGH', 'index.html', 0, 'client builds URLs with api_key (key exposed to browser)')
px = os.path.join(root, 'api', 'tmdb.js')
if not os.path.exists(px):
    add('HIGH', 'api/tmdb.js', 0, 'TMDB proxy function missing')
else:
    ps = open(px, encoding='utf-8').read()
    if 'process.env.TMDB_API_KEY' not in ps: add('HIGH', 'api/tmdb.js', 0, 'proxy does not read key from env var')
    if 'ALLOWED' not in ps: add('MEDIUM', 'api/tmdb.js', 0, 'proxy has no endpoint allowlist')
sw = os.path.join(root, 'sw.js')
if os.path.exists(sw) and "startsWith('/api/')" not in open(sw).read():
    add('MEDIUM', 'sw.js', 0, 'service worker may cache /api/* responses')
if os.path.exists(idx) and re.search(r'fetch\(`\$\{API\}\?token=', open(idx, encoding='utf-8', errors='ignore').read()):
    add('MEDIUM', 'index.html', 0, 'sync passphrase sent in URL query string (known open issue until backend accepts a header)')

# dedupe, report
seen = set(); out = []
for x in findings:
    k = (x[0], x[1], x[2], x[3])
    if k not in seen: seen.add(k); out.append(x)
high = [x for x in out if x[0] == 'HIGH']; med = [x for x in out if x[0] == 'MEDIUM']
print(f'WatchPick security scan: {len(high)} HIGH, {len(med)} MEDIUM')
for sev, f, ln, msg in high + med:
    print(f'  [{sev}] {f}{":"+str(ln) if ln else ""} - {msg}')
if not out: print('  clean')
sys.exit(1 if high else 0)
