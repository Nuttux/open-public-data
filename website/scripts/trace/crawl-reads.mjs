#!/usr/bin/env node
/**
 * Record, route by route, every file a production server opens at request time.
 *
 * Why: Vercel ships each route as its own function, carrying the files Next's
 * tracer believes it needs. Our loaders read public/ with paths built at run
 * time, which the tracer cannot follow, so it packed everything and functions
 * crossed the 250 MB ceiling (13 Sep 2026). Declaring per-route includes is
 * safe only if we KNOW what each route opens — and a file left out does not
 * always fail loudly: an OrNull loader returns null and a section vanishes.
 *
 * How: against an existing `next build`, one fresh `next start` per route —
 * module caches would otherwise hide every read after the first route that
 * warmed them — preloaded with read-recorder.cjs. A read is attributed to the
 * route Next reports for the render, not to the server that served it.
 *
 * URLs come from the sitemaps (real entities, first/middle/last per host),
 * then from links harvested off those pages for routes the sitemap does not
 * list, then from extra-requests.json for API routes. Drawers are exercised
 * the way the browser opens them: an RSC request carrying Next-Url.
 *
 *   node scripts/trace/crawl-reads.mjs                 → .trace/route-reads.json
 *   ROUTES='lieu' node scripts/trace/crawl-reads.mjs   → re-measure a subset
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '../..');
const DIST = path.join(WEB, process.env.NEXT_DIST_DIR || '.next');
// Outside .next: a build wipes it, and the crawl outlives the build it measured.
const TRACE = path.join(WEB, '.trace');
fs.mkdirSync(TRACE, { recursive: true });
// STRICT=1: each render sees only what its function carries, on OTHER URLs than
// the ones the includes were generated from (quartiles instead of first/middle/last).
const STRICT = Boolean(process.env.STRICT);
// Which URLs of each route: `measure` (first, middle, last), `a` and `b` (other quantiles).
const SAMPLES = process.env.SAMPLES || (STRICT ? 'a' : 'measure');
const OUT = process.env.OUT || path.join(TRACE, STRICT ? `route-strict-${process.env.SAMPLES || 'a'}.json` : 'route-reads.json');
const PLAN = path.join(TRACE, 'route-plan.json');
const PARALLEL = Number(process.env.PARALLEL || 6);
const ONLY = process.env.ROUTES ? new RegExp(process.env.ROUTES) : null;
const BASE_PORT = Number(process.env.BASE_PORT || 3200);
const HOSTS = ['fr', 'www'];
const RECORDER = path.join(HERE, 'read-recorder.cjs');
const EXTRA = path.join(HERE, 'extra-requests.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qipu-reads-'));
const BUILD_ID = fs.readFileSync(path.join(DIST, 'BUILD_ID'), 'utf8').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asciiPath = (p) => (/[^\x21-\x7e]/.test(p) ? encodeURI(p) : p);

function get(port, host, p, headers = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: asciiPath(p), method: 'GET', headers: { host: `${host}.localhost:${port}`, ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      },
    );
    req.setTimeout(180_000, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: String(e), body: Buffer.alloc(0) }));
    req.end();
  });
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });

/** A connection probe, not a request: a request would render, warm the caches and hide reads. */
async function withServer(port, logFile, fn) {
  const env = { ...process.env, NODE_ENV: 'production' };
  if (logFile) {
    env.QIPU_READ_LOG = logFile;
    if (STRICT) env.QIPU_ENFORCE_DIST = DIST;
    env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require ${RECORDER}`.trim();
  }
  const child = spawn(path.join(WEB, 'node_modules/.bin/next'), ['start', '-p', String(port)], { cwd: WEB, env, stdio: 'ignore' });
  try {
    for (let i = 0; !(await portOpen(port)); i++) {
      if (i > 240 || child.exitCode !== null) throw new Error(`next start on ${port} did not come up`);
      await sleep(250);
    }
    return await fn();
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async (_, w) => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k], w, k);
    }
  }));
}

function routeRegex(route) {
  let s = '';
  for (const seg of route.split('/').filter(Boolean)) {
    if (/^\[\[\.\.\..+\]\]$/.test(seg)) s += '(?:/.*)?';
    else if (/^\[\.\.\..+\]$/.test(seg)) s += '/.+';
    else if (/^\[.+\]$/.test(seg)) s += '/[^/]+';
    else s += '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${s || '/'}/?$`);
}

const META = new Set(['/robots.txt', '/sitemap/[__metadata_id__]', '/manifest.webmanifest', '/icon.svg', '/favicon.ico', '/_not-found', '/_global-error']);
function kindOf(r) {
  if (r.startsWith('/(') || r.includes('/(.)')) return 'drawer';
  if (/\/(opengraph-image|twitter-image)$/.test(r)) return 'og';
  if (r.startsWith('/api/')) return 'api';
  if (META.has(r)) return 'meta';
  return 'page';
}

/** The full page a drawer renders, and the page it is opened from. */
function drawerTwin(r) {
  if (r.startsWith('/(...)')) {
    return { twin: '/' + r.slice('/(...)'.length), opener: (p) => '/' + p.split('/').filter(Boolean).slice(0, 3).join('/') };
  }
  const at = r.indexOf('/(.)');
  const parent = r.slice(0, at);
  return { twin: `${parent}/${r.slice(at + '/(.)'.length)}`, opener: () => parent };
}

async function discover(routes) {
  const pages = routes.filter((r) => kindOf(r) === 'page');
  // Literal segments first: /fr/city/paris/budget must not fall to /fr/city/[slug]/budget.
  const matchers = pages
    .map((r) => [r, routeRegex(r)])
    .sort((a, b) => (a[0].match(/\[/g) || []).length - (b[0].match(/\[/g) || []).length);
  const matchRoute = (p) => matchers.find(([, rx]) => rx.test(p))?.[0];
  const found = {};
  const add = (route, host, p) => {
    if (!route) return;
    ((found[route] ??= {})[host] ??= []).includes(p) || found[route][host].push(p);
  };
  const sitemapIds = {};
  const port = BASE_PORT;

  await withServer(port, null, async () => {
    for (const host of HOSTS) {
      for (let i = 0; ; i++) {
        const res = await get(port, host, `/sitemap/${i}.xml`);
        if (res.status !== 200) { sitemapIds[host] = i; break; }
        for (const [, loc] of res.body.toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const u = new URL(loc.replace(/&amp;/g, '&'));
          const h = u.hostname.split('.')[0];
          add(matchRoute(u.pathname), HOSTS.includes(h) ? h : 'www', u.pathname);
        }
      }
    }
    for (const r of pages) if (!r.includes('[') && !found[r]) for (const h of HOSTS) add(r, h, r);

    // Routes the sitemap does not list: follow the links of the pages we have.
    for (let round = 0; round < 2; round++) {
      const missing = pages.filter((r) => r.includes('[') && !found[r]).map((r) => [r, routeRegex(r)]);
      if (!missing.length) break;
      const seeds = Object.values(found).flatMap((byHost) => Object.entries(byHost).flatMap(([h, ps]) => pick(ps).map((p) => [h, p])));
      await pool(seeds, 8, async ([h, p]) => {
        const res = await get(port, h, p);
        for (const [, href] of res.body.toString('utf8').matchAll(/href="(\/[^"#?]*)/g)) {
          const hit = missing.find(([, rx]) => rx.test(href));
          if (hit) add(hit[0], h, href);
        }
      });
    }
  });
  return { found, sitemapIds };
}

function pick(ps) {
  const s = [...ps].sort();
  const q = (f) => Math.floor(s.length * f);
  const idx = { measure: [0, q(1 / 2), s.length - 1], a: [q(1 / 4), q(3 / 4), q(1 / 3)], b: [q(1 / 5), q(2 / 5), q(4 / 5)] }[SAMPLES];
  return [...new Set(idx)].map((i) => s[i]);
}

function plan(routes, { found, sitemapIds }) {
  const extra = fs.existsSync(EXTRA) ? JSON.parse(fs.readFileSync(EXTRA, 'utf8')) : {};
  const sample = (r) => Object.entries(found[r] || {}).flatMap(([host, ps]) => pick(ps).map((p) => ({ host, path: p })));
  const out = {};
  for (const r of routes) {
    const kind = kindOf(r);
    let requests = [];
    if (extra[r]) requests = extra[r];
    else if (kind === 'page') requests = sample(r);
    else if (kind === 'og') {
      const leaf = r.slice(r.lastIndexOf('/'));
      requests = sample(r.slice(0, -leaf.length) || '/').map((s) => ({ ...s, path: (s.path === '/' ? '' : s.path.replace(/\/$/, '')) + leaf }));
    } else if (kind === 'drawer') {
      const { twin, opener } = drawerTwin(r);
      requests = sample(twin).map((s) => ({ ...s, headers: { RSC: '1', 'Next-Url': opener(s.path) } }));
    } else if (r === '/sitemap/[__metadata_id__]') {
      requests = HOSTS.flatMap((host) => Array.from({ length: sitemapIds[host] || 0 }, (_, i) => ({ host, path: `/sitemap/${i}.xml` })));
    } else if (r === '/_not-found') {
      requests = HOSTS.map((host) => ({ host, path: '/__qipu_trace_not_found__' }));
    } else if (kind === 'meta' && r !== '/_global-error') {
      requests = HOSTS.map((host) => ({ host, path: r }));
    }
    out[r] = { kind, requests };
  }
  return out;
}

async function record(route, spec, port) {
  const log = path.join(TMP, `${port}.log`);
  fs.writeFileSync(log, '');
  const results = [];
  await withServer(port, log, async () => {
    for (const q of spec.requests) {
      const res = await get(port, q.host, q.path, q.headers);
      results.push({ ...q, status: res.status, ...(res.error ? { error: res.error } : {}) });
    }
  });
  // A drawer render may be reported under the page it intercepts.
  const tags = new Set([route, ...(spec.kind === 'drawer' ? [drawerTwin(route).twin] : [])]);
  const reads = {};
  /** The request that first opened each file: `requests[0]` for shared files, a later one for entity files. */
  const firstBy = {};
  const other = {};
  const rank = { absent: 0, statdir: 1, probe: 2, read: 3, dir: 4 };
  const denied = new Set();
  for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
    const [tag, file, kind, url] = line.split('\t');
    if (!file) continue;
    if (!tags.has(tag)) { other[tag] = (other[tag] || 0) + 1; continue; }
    if (kind === 'denied') { denied.add(file); continue; }
    if (!(file in firstBy)) firstBy[file] = url || '';
    if (!(file in reads) || rank[kind] > rank[reads[file]]) reads[file] = kind;
  }
  return { kind: spec.kind, requests: results, reads, first_by: firstBy, other_tags: other, ...(STRICT ? { denied: [...denied].sort() } : {}) };
}

const rendered = (q) => q.status > 0 || /socket hang up/.test(q.error || '');

async function main() {
  const routes = [...new Set(Object.values(JSON.parse(fs.readFileSync(path.join(DIST, 'app-path-routes-manifest.json'), 'utf8'))))].sort();
  let discovered;
  const cached = fs.existsSync(PLAN) ? JSON.parse(fs.readFileSync(PLAN, 'utf8')) : null;
  // The URLs do not depend on the build: reuse them unless routes or data changed (REDISCOVER=1).
  if (cached && !process.env.REDISCOVER) {
    discovered = cached;
    console.log(`plan réutilisé (${PLAN})`);
  } else {
    console.log('découverte des URL : sitemaps, puis liens…');
    discovered = { build_id: BUILD_ID, ...(await discover(routes)) };
    fs.writeFileSync(PLAN, JSON.stringify(discovered, null, 1));
  }
  const specs = plan(routes, discovered);
  const todo = routes.filter((r) => (!ONLY || ONLY.test(r)) && specs[r].requests.length);

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const out = ONLY && prev?.build_id === BUILD_ID ? prev : { build_id: BUILD_ID, routes: {} };
  out.generated_at = new Date().toISOString();

  console.log(`${todo.length} routes à mesurer, ${PARALLEL} serveurs en parallèle`);
  await pool(todo, PARALLEL, async (r, w, k) => {
    const res = await record(r, specs[r], BASE_PORT + 1 + w);
    out.routes[r] = res;
    const ok = res.requests.filter((q) => q.status >= 200 && q.status < 300).length;
    const refus = STRICT ? ` · ${res.denied.length} refus` : '';
    console.log(`[${k + 1}/${todo.length}] ${ok}/${res.requests.length} · ${Object.keys(res.reads).length} lectures${refus} · ${r}`);
  });

  // Measured = the render ran. A redirect renders before it redirects, a 404
  // page and a share card that crashes mid-render (the connection is dropped:
  // status 0, socket hang up) still read what they read.
  out.unmeasured = routes.filter((r) => !out.routes[r]?.requests.some(rendered));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  if (STRICT) {
    const refused = Object.entries(out.routes).filter(([, m]) => m.denied?.length);
    console.log(refused.length
      ? `\n✗ ${refused.length} route(s) ont voulu lire un fichier que leur fonction n'embarque pas :\n${refused.map(([r, m]) => `  ${r}\n    ${m.denied.slice(0, 8).join('\n    ')}`).join('\n')}`
      : '\n✓ aucune lecture refusée : chaque route a trouvé ses fichiers dans sa propre fonction');
  }
  console.log(`\n→ ${OUT}\nnon mesurées (${out.unmeasured.length}) :\n  ${out.unmeasured.join('\n  ')}`);
  fs.rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
