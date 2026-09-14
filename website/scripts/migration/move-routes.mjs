#!/usr/bin/env node
/**
 * Bloc 2 of the URL migration: move every route under /{lang}/{country}/…
 * (lib/urls.ts) and fix the imports that point into the old tree.
 *
 * Replayable on a fresh main: files already at their new place are skipped,
 * and the run aborts before touching anything if two files would land on the
 * same path. Uses `git mv`, so history follows the files.
 *
 *   node scripts/migration/move-routes.mjs --dry-run   # print the plan
 *   node scripts/migration/move-routes.mjs             # move + codemod imports
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const APP = path.join(WEB, 'src/app');
const DRY = process.argv.includes('--dry-run');

const SITE_PAGES = [
  'accessibilite', 'analyses', 'chat', 'confidentialite', 'contact', 'corrections',
  'licence', 'mentions-legales', 'methode', 'pour-les-villes', 'signalement',
];

/** Old route-relative path (under src/app, no leading slash) → new one. Longest prefix first. */
const PREFIX_RULES = [
  ['fr/city/paris/', '[lang]/france/paris/'],
  ['fr/city/marseille/', '[lang]/france/marseille/'],
  ['fr/city/[slug]/', '[lang]/france/[slug]/'],
  ['fr/national/', '[lang]/france/'],
  ['fr/compare/', '[lang]/france/comparer/'],
  ['comparer/', '[lang]/france/comparer/'],
  ['us/city/sf/', '[lang]/usa/san-francisco/'],
  ['us/', '[lang]/usa/'],
  ['br/city/recife/', '[lang]/brasil/recife/'],
  ['br/', '[lang]/brasil/'],
  ...SITE_PAGES.map((p) => [`${p}/`, `[lang]/${p}/`]),
];

/** Root files of the landing. */
const ROOT_FILE_RULES = {
  'page.tsx': '[lang]/page.tsx',
  'LandingClient.tsx': '[lang]/LandingClient.tsx',
  'opengraph-image.tsx': '[lang]/opengraph-image.tsx',
};

function mapRoute(rel) {
  for (const [from, to] of PREFIX_RULES) if (rel.startsWith(from)) return to + rel.slice(from.length);
  return null;
}

function mapFile(rel) {
  if (rel.startsWith('[lang]/')) return null;
  if (ROOT_FILE_RULES[rel]) return ROOT_FILE_RULES[rel];
  // Drawer intercepts: @drawer/(...)<route> follows its route.
  const drawer = rel.match(/^@drawer\/\(\.\.\.\)(.*)$/);
  if (drawer) {
    const mapped = mapRoute(drawer[1]);
    return mapped ? `@drawer/(...)${mapped}` : null;
  }
  return mapRoute(rel);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const moves = [];
for (const full of walk(APP)) {
  const rel = path.relative(APP, full);
  const next = mapFile(rel);
  if (next && next !== rel) moves.push([rel, next]);
}

// Abort on collisions before touching anything.
const targets = new Map();
for (const [from, to] of moves) {
  if (targets.has(to)) throw new Error(`collision: ${targets.get(to)} and ${from} → ${to}`);
  if (fs.existsSync(path.join(APP, to))) throw new Error(`target exists: ${to} (from ${from})`);
  targets.set(to, from);
}

console.log(`${moves.length} fichiers à déplacer`);
const byTop = {};
for (const [from, to] of moves) {
  const k = `${from.split('/').slice(0, 3).join('/')} → ${to.split('/').slice(0, 3).join('/')}`;
  byTop[k] = (byTop[k] ?? 0) + 1;
}
for (const [k, n] of Object.entries(byTop).sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (DRY) process.exit(0);

for (const [from, to] of moves) {
  const dest = path.join(APP, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    execFileSync('git', ['mv', path.join(APP, from), dest], { cwd: WEB, stdio: 'pipe' });
  } catch {
    fs.renameSync(path.join(APP, from), dest); // untracked file
  }
}

// Remove the emptied old directories.
function prune(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(dir, e.name));
  if (dir !== APP && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}
prune(APP);

// Imports into the old tree: '@/app/<old>' → '@/app/<new>'.
let changedFiles = 0;
let changedImports = 0;
for (const full of walk(path.join(WEB, 'src'))) {
  if (!/\.(ts|tsx|mjs|js)$/.test(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  const out = src.replace(/(["'])@\/app\/([^"']+)\1/g, (m, q, rel) => {
    const next = mapFile(rel) ?? mapFile(rel + '.tsx')?.replace(/\.tsx$/, '');
    if (!next) return m;
    changedImports++;
    return `${q}@/app/${next}${q}`;
  });
  if (out !== src) {
    fs.writeFileSync(full, out);
    changedFiles++;
  }
}
console.log(`imports corrigés : ${changedImports} dans ${changedFiles} fichiers`);
