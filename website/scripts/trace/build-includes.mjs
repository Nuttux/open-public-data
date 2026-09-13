#!/usr/bin/env node
/**
 * Measured reads → per-route `outputFileTracingIncludes` (tracing-includes.json).
 *
 * Each route gets ONE key that matches that route alone, and the files it was
 * seen opening, generalised so the next entity or the next vintage is covered:
 *
 *   lieux/lieu_piscine-des-amiraux.json   → lieux/lieu_*.json   (the URL's own parameter)
 *   budget_sankey_2026.json               → budget_sankey_*.json (numbers: years, ids, arrondissements)
 *   a directory the route listed          → dir/*.*             (the files directly in it, not its folders)
 *
 * Keys. A key is matched, as a substring glob, against the ENTRY the function
 * is built from — `/app/fr/city/paris/lieu/[slug]/page`, `/app/robots.txt/
 * route` — measured on Turbopack builds with probe routes (13 Sep 2026). So a
 * route's own key ends in `/page` or `/route` and reaches no child route,
 * whereas `/fr/city/paris` would reach every Paris page and `/` every
 * function. Brackets and parentheses are escaped: `[slug]` is otherwise a
 * character class. Negated extglobs (`!(/**)`) are silently ignored by the
 * build, whatever picomatch says. Every key is checked here against every
 * entry, in that form.
 *
 * Catalogues. Some files are picked by the data, not the URL: a share card's
 * theme photo, a street's rows (`street/COUNTRY_CLUB_DR.json` for
 * /street/country-club-dr). A file FIRST opened by a later request of a route
 * depends on that request's entity — module caches only ever hide reads, never
 * add them. When two or more such files keep an exact name (no parameter, no
 * number to generalise) in one directory, that directory is a catalogue — for
 * every route: a route that happened to meet one theme photo in its samples
 * still gets them all. Shared files, read from the first request on, never
 * make a catalogue, and neither do requests that differ only by query string
 * (/api/og-chart?chart=… — each chart's files are measured one by one).
 * Found by strict crawls on unseen URLs (13 Sep 2026).
 *
 * Coverage beyond the crawl:
 *   - a drawer also carries its full page's reads — same fiche, same loaders;
 *   - a route the crawl could not reach takes the reads of its closest measured
 *     relatives (same first three segments, then two), and is listed as such;
 *   - /api/chat reads files named in the chat toolsets, parsed from source.
 *
 *   node scripts/trace/build-includes.mjs      after crawl-reads.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '../..');
const DIST = path.join(WEB, process.env.NEXT_DIST_DIR || '.next');
const OUT = path.join(WEB, 'tracing-includes.json');
const pm = (await import('next/dist/compiled/picomatch/index.js')).default;

const measured = JSON.parse(fs.readFileSync(path.join(WEB, '.trace', 'route-reads.json'), 'utf8'));
// Strict crawls read other URLs of the same routes: more entities, more of what they open.
const runs = [measured, ...fs.readdirSync(path.join(WEB, '.trace'))
  .filter((f) => /^route-strict-[a-z]+\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(WEB, '.trace', f), 'utf8')))];
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'app-path-routes-manifest.json'), 'utf8'));
const routes = [...new Set(Object.values(manifest))].sort();
/** What the build matches a key against, per route: its entries, `/app<entry>`. */
const nextForms = {};
for (const [entry, route] of Object.entries(manifest)) (nextForms[route] ??= []).push(`/app${entry}`);

/** Only files a function can open: data, images, fonts, articles. */
const SHIPPABLE = /^(public|src|content)\//;
/** Routes that open nothing from disk, checked by reading their code. */
const NO_DISK = new Set(['/_global-error', '/api/contact', '/api/signalement', '/api/openfisca-calc', '/api/chat/save', '/api/og/chat/[id]', '/chat/c/[id]']);
/** The chat toolsets and the data root each one is confined to (lib/chat/scopes.ts). */
const CHAT_TOOLSETS = [['src/lib/chat/paris/tools.ts', ''], ['src/lib/chat/sf/tools.ts', 'us/sf']];

const kindOf = (r) => (r.startsWith('/(') || r.includes('/(.)') ? 'drawer' : /\/(opengraph-image|twitter-image)$/.test(r) ? 'og' : 'page');
function twinOf(r) {
  if (r.startsWith('/(...)')) return '/' + r.slice('/(...)'.length);
  const at = r.indexOf('/(.)');
  return at < 0 ? r : `${r.slice(0, at)}/${r.slice(at + '/(.)'.length)}`;
}

/** The values the request put in the route's dynamic segments. */
function paramValues(route, reqPath) {
  const rs = twinOf(route).split('/').filter(Boolean);
  const ps = reqPath.split('?')[0].split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const out = [];
  for (let i = 0; i < rs.length; i++) {
    if (/^\[\[?\.\.\./.test(rs[i])) { out.push(...ps.slice(i)); break; }
    if (/^\[.+\]$/.test(rs[i]) && ps[i] !== undefined) out.push(ps[i]);
  }
  return out.filter((v) => v.length >= 3);
}

function generalize(file, kind, params) {
  // `dir/*` also matches the subdirectories, and the build packs a matched
  // directory whole: `public/data/*` put 182 MB of public/data/us into the
  // sitemap. A listing needs the files in it; `*.*` names files, not folders.
  if (kind === 'dir') return `${file}/*.*`;
  const parts = file.split('/');
  let name = parts.pop();
  const dirs = parts.map((seg) => (params.includes(seg) ? '*' : seg));
  for (const p of [...params].sort((a, b) => b.length - a.length)) if (name.includes(p)) name = name.split(p).join('*');
  name = name.replace(/\d+/g, '*').replace(/\*+/g, '*');
  return [...dirs, name].join('/');
}

function readsToGlobs(routeName, m) {
  const params = [...new Set((m.requests || []).flatMap((q) => paramValues(routeName, q.path)))];
  const globs = new Set();
  for (const [file, kind] of Object.entries(m.reads)) {
    if (kind === 'statdir' || !SHIPPABLE.test(file)) continue;
    globs.add(generalize(file, kind, params));
  }
  return globs;
}

/** Exact-named files a later request opened first, as `dir\0ext` → names. */
function entityExactNames(routeName, m, into) {
  const first = m.requests?.[0]?.path;
  if (!first || !m.first_by) return;
  const pathname = (u) => u.split('?')[0];
  const params = [...new Set(m.requests.flatMap((q) => paramValues(routeName, q.path)))];
  for (const [file, by] of Object.entries(m.first_by)) {
    const kind = m.reads[file];
    if (!by || pathname(by) === pathname(first) || !kind || kind === 'statdir' || kind === 'dir' || !SHIPPABLE.test(file)) continue;
    const g = generalize(file, kind, params);
    const name = path.posix.basename(g);
    const ext = path.posix.extname(name);
    if (name.includes('*') || !ext) continue;
    (into[`${path.posix.dirname(g)}\0${ext}`] ??= new Set()).add(name);
  }
}

function chatGlobs() {
  const globs = new Set();
  for (const [file, prefix] of CHAT_TOOLSETS) {
    const src = fs.readFileSync(path.join(WEB, file), 'utf8');
    for (const [, rel] of src.matchAll(/loadJson(?:<[^>]*>)?\(\s*[`"']([^`"']+)[`"']/g)) {
      const name = rel.replace(/\$\{[^}]*\}/g, '*').replace(/\d+/g, '*').replace(/\*+/g, '*');
      globs.add(`public/data/${prefix ? prefix + '/' : ''}${name}`);
    }
  }
  return globs;
}

// ── 1. globs per route ─────────────────────────────────────────────────────
const perRoute = {};
const source = {};
/** Catalogue glob → the routes whose own requests proved it. */
const catalogues = {};
for (const r of routes) {
  // Same rule as the crawl: the render ran, even if it then redirected, 404'd or crashed.
  const seen = runs.map((run) => run.routes[r]).filter((m) => m?.requests.some((q) => q.status > 0 || /socket hang up/.test(q.error || '')));
  if (!seen.length) continue;
  perRoute[r] = new Set(seen.flatMap((m) => [...readsToGlobs(r, m)]));
  const names = {};
  for (const m of seen) entityExactNames(r, m, names);
  for (const [k, set] of Object.entries(names)) {
    if (set.size < 2) continue;
    const [dir, ext] = k.split('\0');
    (catalogues[`${dir}/*${ext}`] ??= []).push(r);
  }
  source[r] = 'mesurée';
}
// A catalogue belongs to its directory: every route reading a named file there gets all of it.
for (const globs of Object.values(perRoute)) {
  for (const cat of Object.keys(catalogues)) {
    const dir = path.posix.dirname(cat);
    const ext = path.posix.extname(cat);
    const named = [...globs].filter((g) => path.posix.dirname(g) === dir && g.endsWith(ext));
    if (!named.length) continue;
    for (const g of named) globs.delete(g);
    globs.add(cat);
  }
}
for (const r of routes) {
  if (kindOf(r) !== 'drawer' || !perRoute[r]) continue;
  const twin = twinOf(r);
  if (perRoute[twin]) for (const g of perRoute[twin]) perRoute[r].add(g);
}
perRoute['/api/chat'] = chatGlobs();
source['/api/chat'] = 'outils du chat (source)';
for (const r of NO_DISK) if (routes.includes(r) && !perRoute[r]) { perRoute[r] = new Set(); source[r] = 'aucune lecture disque (code relu)'; }

for (const r of routes) {
  if (perRoute[r]) continue;
  const segs = twinOf(r).split('/').filter(Boolean);
  for (const depth of [3, 2]) {
    if (segs.length < depth) continue;
    const prefix = '/' + segs.slice(0, depth).join('/');
    const kin = Object.keys(perRoute).filter((k) => source[k] === 'mesurée' && twinOf(k).startsWith(prefix + '/'));
    if (!kin.length) continue;
    perRoute[r] = new Set(kin.flatMap((k) => [...perRoute[k]]));
    source[r] = `parentes (${prefix}/…, ${kin.length} routes)`;
    break;
  }
}

// ── 2. keys, checked against every route ───────────────────────────────────
const esc = (r) => r.replace(/[[\]()]/g, (c) => '\\' + c);
const keysFor = (r) => nextForms[r].map(esc);
const includes = {};
const keyProblems = [];
const extraMatches = [];
for (const r of Object.keys(perRoute).sort()) {
  const globs = [...perRoute[r]].sort();
  if (!globs.length) continue;
  for (const key of keysFor(r)) {
    const match = pm(key, { dot: true, contains: true });
    const hits = routes.filter((x) => nextForms[x].some((form) => match(form)));
    if (!hits.includes(r)) keyProblems.push(`${key} ne correspond pas à ${nextForms[r].join(', ')}`);
    const extra = hits.filter((x) => x !== r);
    if (extra.length) extraMatches.push(`${key} → aussi ${extra.join(', ')}`);
    includes[key] = globs.map((g) => `./${g}`);
  }
}

// ── 3. what each route will carry ──────────────────────────────────────────
function expand(glob) {
  const segs = glob.split('/');
  let frontier = [''];
  for (let i = 0; i < segs.length; i++) {
    const last = i === segs.length - 1;
    const rx = new RegExp('^' + segs[i].split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
    const next = [];
    for (const dir of frontier) {
      let entries;
      try { entries = fs.readdirSync(path.join(WEB, dir), { withFileTypes: true }); } catch { continue; }
      for (const e of entries) if (rx.test(e.name) && (last ? e.isFile() : e.isDirectory())) next.push(path.join(dir, e.name));
    }
    frontier = next;
  }
  return frontier;
}
const weights = Object.entries(perRoute).map(([r, globs]) => {
  const files = new Set([...globs].flatMap(expand));
  let bytes = 0;
  for (const f of files) bytes += fs.statSync(path.join(WEB, f)).size;
  return [bytes, files.size, r];
}).sort((a, b) => b[0] - a[0]);

const unresolved = routes.filter((r) => !perRoute[r]);
fs.writeFileSync(OUT, JSON.stringify({
  _: 'Generated by scripts/trace/build-includes.mjs from the reads crawl-reads.mjs measured. Do not edit: re-run the crawl. Checked by scripts/trace/check-traces.mjs.',
  measured_on_build: measured.build_id,
  includes,
}, null, 1) + '\n');

const mib = (b) => (b / 2 ** 20).toFixed(1);
console.log(`→ ${path.relative(WEB, OUT)} · ${Object.keys(includes).length} clés`);
console.log(`\nsources : ${Object.entries(Object.values(source).reduce((a, s) => ((a[s.replace(/\(.*\)/, '(…)')] = (a[s.replace(/\(.*\)/, '(…)')] || 0) + 1), a), {})).map(([s, n]) => `${n} ${s}`).join(' · ')}`);
for (const [r, s] of Object.entries(source)) if (s.startsWith('parentes')) console.log(`  ${r} ← ${s}`);
console.log(`\ncatalogues (fichiers choisis par la donnée) :`);
for (const [g, rs] of Object.entries(catalogues)) console.log(`  ${g} ← ${rs.length} route(s) : ${rs.slice(0, 3).join(', ')}${rs.length > 3 ? '…' : ''}`);
console.log(`\nfichiers embarqués par route (hors code) — les plus lourdes :`);
for (const [b, n, r] of weights.slice(0, 12)) console.log(`  ${mib(b).padStart(6)} Mio ${String(n).padStart(5)} f  ${r}`);
if (keyProblems.length) console.log(`\n✗ clés qui ne visent pas leur route :\n  ${keyProblems.join('\n  ')}`);
if (extraMatches.length) console.log(`\n⚠ clés qui visent aussi d'autres routes :\n  ${extraMatches.join('\n  ')}`);
console.log(`\n${unresolved.length ? `routes sans include (aucune lecture ou non couvertes) : ${unresolved.length}` : 'toutes les routes sont couvertes'}`);
process.exit(keyProblems.length ? 1 : 0);
