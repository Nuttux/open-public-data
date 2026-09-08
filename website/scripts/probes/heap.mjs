/* Where the desktop heap goes: bytes held in geometry arrays per layer, against the JS heap. */
import { chromium } from 'playwright';
import { ARGS, init } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3000';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.addInitScript(init);
await p.goto(`${BASE}/us/city/sf/the-city${process.argv[3] ?? ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = performance.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(8000);
const r = await p.evaluate(() => {
  const e = window.__cityGL;
  const scene = e.scene ?? Object.values(e).find((v) => v && v.isScene);
  const seenG = new Set(); const seenA = new Set(); const per = {};
  let attrBytes = 0, idxBytes = 0, geoms = 0, meshes = 0, nullArrays = 0;
  scene.traverse((o) => {
    const g = o.geometry; if (!g) return; meshes++;
    if (seenG.has(g)) return; seenG.add(g); geoms++;
    const name = (o.name || o.parent?.name || g.name || 'unnamed').split(/[:/ ]/)[0];
    per[name] ??= { attr: 0, idx: 0, geoms: 0, verts: 0 };
    per[name].geoms++;
    for (const a of Object.values(g.attributes)) { const arr = a.array ?? a.data?.array; if (!arr) { nullArrays++; continue; } if (seenA.has(arr)) continue; seenA.add(arr); attrBytes += arr.byteLength; per[name].attr += arr.byteLength; }
    per[name].verts += g.attributes.position?.count ?? 0;
    if (g.index?.array && !seenA.has(g.index.array)) { seenA.add(g.index.array); idxBytes += g.index.array.byteLength; per[name].idx += g.index.array.byteLength; }
  });
  const MB = (n) => Math.round(n / 1048576);
  const top = Object.entries(per).sort((a, b) => (b[1].attr + b[1].idx) - (a[1].attr + a[1].idx)).slice(0, 12).map(([k, v]) => `${k.padEnd(18)} ${String(MB(v.attr)).padStart(5)} MB attrs ${String(MB(v.idx)).padStart(5)} MB index  ${v.geoms} geoms ${v.verts.toLocaleString()} verts`);
  return { heapMB: performance.memory ? MB(performance.memory.usedJSHeapSize) : null, attrMB: MB(attrBytes), idxMB: MB(idxBytes), geoms, meshes, nullArrays, top, dataCacheMB: e.data?.bytes ? MB(e.data.bytes) : null };
});
console.log(JSON.stringify({ ...r, top: undefined }));
for (const t of r.top) console.log('  ', t);
await b.close();
