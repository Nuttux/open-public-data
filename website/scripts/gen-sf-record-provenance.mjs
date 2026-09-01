import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.join(process.cwd(), 'public', 'data/us/sf/city/blocks');
const A = { sources: new Set(), from: Infinity, to: 0, rows: 0 };
const C = { sources: new Set(), from: Infinity, to: 0, rows: 0 };
const eat = (rows) => { for (const r of rows) { const a = r.c === 'b' ? C : A; a.rows++;
  if (r.y) { if (r.y < a.from) a.from = r.y; if (r.y > a.to) a.to = r.y; }
  if (r.u) a.sources.add(r.u.slice(0, r.u.indexOf('/'))); } };
for (const f of readdirSync(root)) {
  if (!/^block-\d+\.json$/.test(f)) continue;
  const shard = JSON.parse(readFileSync(path.join(root, f), 'utf8'));
  for (const b of Object.values(shard)) eat(b.d ?? []);
}
const street = path.join(root, 'street');
for (const f of readdirSync(street)) { if (!f.endsWith('.json')) continue;
  eat(JSON.parse(readFileSync(path.join(street, f), 'utf8'))); }
const out = {
  archive: { sources: A.sources.size, from: A.from, to: A.to, rows: A.rows },
  clerk: { sources: C.sources.size, from: C.from, to: C.to, rows: C.rows },
};
writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out));
