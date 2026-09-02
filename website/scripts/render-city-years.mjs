/* ═══════════════════════════════════════════════════════════════════════
   render-city-years.mjs — THE YEARS, ONE PYRAMID EACH, AND THE LIST OF THEM.

   `render-city-tiles.mjs` renders one year. This runs it for many and writes
   `years.json` beside the pyramids — the one file the phone reads to know
   which years exist and how deep each goes:

       { "now": { "zmax": 7 }, "years": { "1950": { "zmax": 3 }, ... } }

   A year's depth is a cost decision, not a rendering one: level 3 is the
   whole city at 1 MB and seven seconds; level 5 is district detail at 13 MB
   and fifty; level 7 is the street at 135 MB and a quarter of an hour. So
   every year can afford the wide levels and a few anchor years the deeper
   ones, and the phone shows the deepest it has and scales the rest.

   usage:  node scripts/render-city-years.mjs --years 1906-2026 --zmax 3
           node scripts/render-city-years.mjs --years 1906,1915,1937 --zmax 5
   (`--out` and `--base` pass through; the dev server must be on :3000, and
   NOTHING under website/ may be edited while it runs — a reload kills it)
   ═══════════════════════════════════════════════════════════════════════ */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('--out', 'public/tiles/us/sf/city'));
const ZMAX = arg('--zmax', '3');
const spec = arg('--years', '');
if (!spec) { console.error('--years 1906-2026 or --years 1906,1915'); process.exit(1); }
const years = [];
for (const part of spec.split(',')) {
  const m = /^(\d{4})-(\d{4})$/.exec(part.trim());
  if (m) { for (let y = Number(m[1]); y <= Number(m[2]); y++) years.push(y); }
  else if (/^\d{4}$/.test(part.trim())) years.push(Number(part));
}
const t0 = Date.now();
for (const y of years) {
  const r = spawnSync(process.execPath, ['scripts/render-city-tiles.mjs', '--year', String(y), '--zmax', ZMAX, '--out', OUT, '--base', arg('--base', 'http://localhost:3000')], { stdio: ['ignore', 'pipe', 'inherit'] });
  const last = String(r.stdout).trim().split('\n').pop();
  console.log(`${y}  ${last}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (r.status !== 0) { console.error(`year ${y} failed`); process.exit(1); }
}
/* the list is whatever is on disk, not whatever this run did */
const list = { now: null, years: {} };
for (const d of fs.readdirSync(OUT)) {
  const f = path.join(OUT, d, 'index.json');
  if (!fs.existsSync(f)) continue;
  const idx = JSON.parse(fs.readFileSync(f, 'utf8'));
  const zmax = Math.max(...Object.keys(idx.levels).map(Number));
  if (d === 'now') list.now = { zmax };
  else if (/^\d{4}$/.test(d)) list.years[d] = { zmax };
}
fs.writeFileSync(path.join(OUT, 'years.json'), JSON.stringify(list));
console.log(`years.json: now z${list.now?.zmax}, ${Object.keys(list.years).length} years`);
