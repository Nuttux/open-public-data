'use strict';
/**
 * Which files does a route actually open at request time?
 *
 * Preloaded into `next start` (NODE_OPTIONS=--require) by crawl-reads.mjs.
 * Every filesystem access under the project root — outside .next and
 * node_modules — is appended to QIPU_READ_LOG as
 * `route<TAB>path<TAB>kind<TAB>url`, where `route` is the app route being
 * rendered and `url` the request, both read from Next's own request stores.
 * Each (route, path, kind) is logged once, on its FIRST access: module caches
 * only ever hide later reads, so a file first opened by a later request of the
 * same route depends on that request's entity. Accesses made outside a
 * render (Next scanning public/ at boot, static file serving) carry no store
 * and are logged under `-`.
 *
 * Existence probes count: commune-capabilities decides which sections a page
 * shows with existsSync, so a file missing from the bundle does not 500 — the
 * section silently disappears. Directory listings are marked `dir`, because a
 * route that lists a directory needs every file directly in it. A stat on a
 * directory is marked `statdir` and needs nothing.
 *
 * STRICT MODE (QIPU_ENFORCE_DIST=<.next>): during a render, a file under
 * public/ that the route's function does not carry (its .nft.json) behaves as
 * it would on Vercel — ENOENT, existsSync false, missing from listings — and
 * the refusal is logged as `denied`. A strict crawl on URLs the includes were
 * not generated from is the proof that the generalised globs hold.
 *
 * Inert unless QIPU_READ_LOG is set. Never loaded by a build or a deploy.
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.QIPU_READ_LOG;
if (OUT) {
  const ROOT = process.cwd();
  const PUBLIC = path.join(ROOT, 'public') + path.sep;
  const ENFORCE = process.env.QIPU_ENFORCE_DIST;
  const append = fs.appendFileSync;
  const statSync = fs.statSync;
  const readFileSync = fs.readFileSync;
  const seen = new Set();
  let storage;
  let unitStorage;
  const nextStore = (file, name) => {
    try {
      return require(path.join(ROOT, 'node_modules/next/dist/server/app-render', file))[name];
    } catch {
      return null;
    }
  };

  const currentRoute = () => {
    if (storage === undefined) storage = nextStore('work-async-storage.external.js', 'workAsyncStorage');
    return storage?.getStore()?.route ?? '-';
  };
  const currentUrl = () => {
    if (unitStorage === undefined) unitStorage = nextStore('work-unit-async-storage.external.js', 'workUnitAsyncStorage');
    const u = unitStorage?.getStore()?.url;
    return u ? `${u.pathname}${u.search || ''}` : '';
  };

  const write = (route, rel, kind) => {
    const key = `${route}\t${rel}\t${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    append(OUT, `${key}\t${currentUrl()}\n`);
  };

  // ── strict mode: what each route's function carries ─────────────────────
  let manifest;
  const bundles = new Map();
  function bundleOf(route) {
    if (bundles.has(route)) return bundles.get(route);
    manifest ??= JSON.parse(readFileSync(path.join(ENFORCE, 'app-path-routes-manifest.json'), 'utf8'));
    const files = new Set();
    const dirs = new Set();
    for (const [entry, r] of Object.entries(manifest)) {
      if (r !== route) continue;
      const nft = path.join(ENFORCE, 'server/app', `${entry}.js.nft.json`);
      let list;
      try { list = JSON.parse(readFileSync(nft, 'utf8')).files; } catch { continue; }
      for (const f of list) {
        const abs = path.normalize(path.join(path.dirname(nft), f));
        files.add(abs);
        for (let d = path.dirname(abs); d.length > ROOT.length; d = path.dirname(d)) dirs.add(d);
      }
    }
    const b = { files, dirs };
    bundles.set(route, b);
    return b;
  }
  /** On Vercel, would this route's function see this path? */
  function visible(route, abs) {
    if (!ENFORCE || route === '-' || !abs.startsWith(PUBLIC)) return true;
    const b = bundleOf(route);
    return b.files.has(abs) || b.dirs.has(abs);
  }
  const enoent = (abs) => Object.assign(new Error(`ENOENT: no such file or directory, '${abs}' (not in this function's bundle)`), { code: 'ENOENT', errno: -2, path: abs });

  /** Log the access; return the refusal error if strict mode hides the path. */
  function check(p, kind) {
    let abs;
    try {
      if (p instanceof URL) abs = p.pathname;
      else if (typeof p === 'string') abs = path.resolve(p);
      else return null;
    } catch {
      return null;
    }
    if (!abs.startsWith(ROOT + path.sep)) return null;
    const rel = path.relative(ROOT, abs);
    if (/^(\.next|node_modules)(\/|$)/.test(rel)) return null;
    let exists = true;
    let isDir = false;
    try { isDir = statSync(abs).isDirectory(); } catch { exists = false; }
    if (kind === 'read') kind = exists ? (isDir ? 'statdir' : 'read') : 'absent';
    const route = currentRoute();
    write(route, rel, kind);
    if (exists && !visible(route, abs)) {
      write(route, rel, 'denied');
      return { abs, route };
    }
    return exists ? { ok: true, route, abs } : null;
  }

  const filterListing = (route, dir, entries) =>
    entries.filter((e) => visible(route, path.join(dir, typeof e === 'string' ? e : e.name)));

  const wrapSync = (name, kind, { listing = false, probe = false } = {}) => {
    const orig = fs[name];
    if (typeof orig !== 'function') return;
    fs[name] = function (p, ...rest) {
      const c = check(p, kind);
      if (c && !c.ok) {
        if (probe) return false;
        throw enoent(c.abs);
      }
      const out = orig.call(this, p, ...rest);
      return listing && c?.ok && ENFORCE && Array.isArray(out) ? filterListing(c.route, c.abs, out) : out;
    };
  };
  const wrapCallback = (name, kind, { listing = false } = {}) => {
    const orig = fs[name];
    if (typeof orig !== 'function') return;
    fs[name] = function (p, ...rest) {
      const c = check(p, kind);
      const cb = typeof rest[rest.length - 1] === 'function' ? rest.pop() : null;
      if (c && !c.ok) {
        const err = enoent(c.abs);
        if (cb) return process.nextTick(cb, err);
        throw err;
      }
      if (!cb) return orig.call(this, p, ...rest);
      return orig.call(this, p, ...rest, (err, out) =>
        cb(err, listing && !err && c?.ok && ENFORCE && Array.isArray(out) ? filterListing(c.route, c.abs, out) : out));
    };
  };
  const wrapPromise = (name, kind, { listing = false } = {}) => {
    const orig = fs.promises[name];
    if (typeof orig !== 'function') return;
    fs.promises[name] = async function (p, ...rest) {
      const c = check(p, kind);
      if (c && !c.ok) throw enoent(c.abs);
      const out = await orig.call(this, p, ...rest);
      return listing && c?.ok && ENFORCE && Array.isArray(out) ? filterListing(c.route, c.abs, out) : out;
    };
  };

  for (const n of ['readFileSync', 'openSync', 'statSync', 'lstatSync', 'accessSync', 'createReadStream']) wrapSync(n, 'read');
  wrapSync('readdirSync', 'dir', { listing: true });
  wrapSync('opendirSync', 'dir');
  wrapSync('existsSync', 'probe', { probe: true });
  for (const n of ['readFile', 'open', 'stat', 'lstat', 'access']) wrapCallback(n, 'read');
  wrapCallback('readdir', 'dir', { listing: true });
  for (const n of ['readFile', 'open', 'stat', 'lstat', 'access']) wrapPromise(n, 'read');
  wrapPromise('readdir', 'dir', { listing: true });
  wrapPromise('opendir', 'dir');
}
