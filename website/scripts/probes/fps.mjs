/* Frame rate with vsync off, so the cost of the draw calls shows: as published, without the buildings' shadow pass, without the buildings. */
import { chromium } from 'playwright';
import { ARGS, REF, init } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3000';
const b = await chromium.launch({ args: [...ARGS, '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.addInitScript(init);
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = performance.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(8000);
const measure = (s, k, mode) => p.evaluate(async ([s, k, ref, mode]) => {
  const e = window.__cityGL;
  e.scene.traverse((o) => { if (!o.isMesh || o.userData.layer !== 'buildings') return; if (o.userData.cs0 === undefined) { o.userData.cs0 = o.castShadow; o.userData.v0 = o.visible; } o.castShadow = mode === 'as-is' ? o.userData.cs0 : false; o.visible = mode === 'no-buildings' ? false : o.userData.v0; });
  e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k }); e.invalidate();
  await new Promise((r) => setTimeout(r, 1200));
  const deltas = []; let last = performance.now(); let i = 0;
  await new Promise((done) => { const step = (t) => { deltas.push(t - last); last = t; i++; e.setCamera({ cx: ref.cx + i * 0.5, cy: ref.cy, scale: ref.scale * k * (1 + 0.1 * Math.sin(i / 25)) }); e.invalidate(); if (i < 150) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  deltas.splice(0, 10); deltas.sort((a, b) => a - b);
  const q = (f) => deltas[Math.floor(f * (deltas.length - 1))];
  return { fpsMedian: Math.round(1000 / q(0.5)), p90ms: +q(0.9).toFixed(1), calls: e.getStats().calls };
}, [s, k, REF, mode]);
for (const [name, s, k] of [['whole city', 0, 1], ['district', 1, 4], ['street', 2, 30]]) {
  const row = {};
  for (const mode of ['as-is', 'no-building-shadow', 'no-buildings']) row[mode] = await measure(s, k, mode);
  await measure(s, k, 'as-is');
  console.log(name.padEnd(11), JSON.stringify(row));
}
await b.close();
