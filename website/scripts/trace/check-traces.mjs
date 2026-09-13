#!/usr/bin/env node
/**
 * Does every function carry the files its route opens — and fit on Vercel?
 *
 * Reads what crawl-reads.mjs measured (.trace/route-reads.json) and checks it
 * against what the build packed (.next/server/app/<entry>.js.nft.json):
 *
 *   1. every file a route read at request time is in that route's trace; a
 *      directory it listed is there in full. Files the route probed and found
 *      absent are ignored — they are absent in production too.
 *   2. no function carries more than AUTO_MIB of public/ that its includes do
 *      not name — data the tracer packed on its own, which is what a loader
 *      building its path without untracedPath() does. Fixed-name reads
 *      (data_freshness.json…) are traced exactly and stay under the bar;
 *   3. no function exceeds Vercel's 250 MB uncompressed ceiling (MiB, as the
 *      build log counts them), with a warning margin.
 *
 * The first check is the one that matters: a missing file does not always
 * 500. An OrNull loader returns null and the section silently disappears, on
 * a live site, with a green deploy.
 *
 *   node scripts/trace/check-traces.mjs      exit 1 on any missing file or oversize function
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '../..');
const DIST = path.join(WEB, process.env.NEXT_DIST_DIR || '.next');
const LIMIT = 250 * 2 ** 20;
const WARN = Number(process.env.WARN_MIB || 200) * 2 ** 20;

const AUTO = Number(process.env.AUTO_MIB || 20) * 2 ** 20;
const pm = (await import('next/dist/compiled/picomatch/index.js')).default;
const includes = JSON.parse(fs.readFileSync(path.join(WEB, 'tracing-includes.json'), 'utf8')).includes;
const includeMatchers = Object.entries(includes).map(([key, globs]) => [pm(key, { dot: true, contains: true }), globs.map((g) => pm(g.replace(/^\.\//, ''), { dot: true }))]);
/** public/ files in a function that no include of that function names. */
function autoTraced(entry, t) {
  const form = `/app${entry}`;
  const globs = includeMatchers.filter(([k]) => k(form)).flatMap(([, g]) => g);
  let bytes = 0;
  const files = [];
  for (const f of t.files) {
    if (!f.startsWith('public/') || globs.some((g) => g(f))) continue;
    try { bytes += fs.statSync(path.join(WEB, f)).size; files.push(f); } catch { /* absent */ }
  }
  return { bytes, files };
}

const reads = JSON.parse(fs.readFileSync(path.join(WEB, '.trace', 'route-reads.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'app-path-routes-manifest.json'), 'utf8'));
const buildId = fs.readFileSync(path.join(DIST, 'BUILD_ID'), 'utf8').trim();

const entriesByRoute = {};
for (const [entry, route] of Object.entries(manifest)) (entriesByRoute[route] ??= []).push(entry);

function traced(entry) {
  const nft = path.join(DIST, 'server/app', `${entry}.js.nft.json`);
  if (!fs.existsSync(nft)) return null;
  const base = path.dirname(nft);
  const files = new Set();
  let bytes = 0;
  for (const f of JSON.parse(fs.readFileSync(nft, 'utf8')).files) {
    const abs = path.normalize(path.join(base, f));
    files.add(path.relative(WEB, abs));
    try { bytes += fs.statSync(abs).size; } catch { /* listed but absent: nothing to ship */ }
  }
  return { files, bytes };
}

/** Files directly in a directory: a listing sees those, and a walker's deeper listings are recorded on their own. */
const listDir = (rel) => {
  try {
    return fs.readdirSync(path.join(WEB, rel), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(rel, e.name));
  } catch {
    return [];
  }
};

const mib = (b) => (b / 2 ** 20).toFixed(1);
let failures = 0;
const sizes = [];

if (reads.build_id !== buildId) {
  console.log(`⚠ route-reads.json vient du build ${reads.build_id}, le build courant est ${buildId} : les lectures datent d'un autre code.`);
}

for (const [route, m] of Object.entries(reads.routes)) {
  for (const entry of entriesByRoute[route] || []) {
    const t = traced(entry);
    if (!t) continue;
    sizes.push([t.bytes, entry]);
    const missing = [];
    for (const [file, kind] of Object.entries(m.reads)) {
      if (kind === 'absent' || kind === 'statdir') continue;
      if (/^(\.next|node_modules)\//.test(file)) continue;
      if (kind === 'dir') {
        const lost = listDir(file).filter((f) => !t.files.has(f));
        if (lost.length) missing.push(`${file}/ (${lost.length} fichiers dont ${lost[0]})`);
      } else if (!t.files.has(file) && fs.existsSync(path.join(WEB, file)) && fs.statSync(path.join(WEB, file)).isFile()) {
        missing.push(file);
      }
    }
    if (missing.length) {
      failures++;
      console.log(`✗ ${route} — ${missing.length} fichier(s) lu(s) mais absent(s) de la fonction :`);
      for (const f of missing.slice(0, 12)) console.log(`    ${f}`);
      if (missing.length > 12) console.log(`    … et ${missing.length - 12} autres`);
    }
  }
}

// Data the tracer packed on its own, and size: every function, measured or not.
const measured = new Set(sizes.map(([, e]) => e));
for (const entry of Object.keys(manifest)) {
  if (measured.has(entry)) continue;
  const t = traced(entry);
  if (t) sizes.push([t.bytes, entry]);
}
for (const [, entry] of sizes) {
  const a = autoTraced(entry, traced(entry));
  if (a.bytes > AUTO) {
    failures++;
    const dirs = [...new Set(a.files.map((f) => f.split('/').slice(0, 3).join('/')))].slice(0, 4);
    console.log(`✗ ${entry} — ${mib(a.bytes)} Mio de public/ tracés hors includes (${a.files.length} fichiers : ${dirs.join(', ')}) : un chargeur construit son chemin sans untracedPath()`);
  }
}
sizes.sort((a, b) => b[0] - a[0]);
const over = sizes.filter(([b]) => b > LIMIT);
const warn = sizes.filter(([b]) => b > WARN && b <= LIMIT);
for (const [b, e] of over) { failures++; console.log(`✗ ${mib(b)} Mio > 250 : ${e}`); }
for (const [b, e] of warn) console.log(`⚠ ${mib(b)} Mio : ${e}`);

const unmeasured = reads.unmeasured || [];
console.log(`\n${sizes.length} fonctions · plus lourde ${mib(sizes[0]?.[0] || 0)} Mio (${sizes[0]?.[1]}) · médiane ${mib(sizes[Math.floor(sizes.length / 2)]?.[0] || 0)} Mio`);
console.log(`${Object.keys(reads.routes).length} routes mesurées · ${unmeasured.length} non mesurées${unmeasured.length ? ' : ' + unmeasured.join(', ') : ''}`);
console.log(failures ? `\n✗ ${failures} échec(s)` : '\n✓ chaque route porte ce qu\'elle lit, et tout tient sous 250 Mio');
process.exit(failures ? 1 : 0);
