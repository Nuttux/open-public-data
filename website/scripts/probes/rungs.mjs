/* The cost of each adaptive-quality rung, vsync off, dpr 2, three cameras. */
import { chromium } from 'playwright';
import { ARGS, REF, init } from './x_common.mjs';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: [...ARGS, '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.addInitScript(init);
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = performance.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(8000);
const measure = (s, k, mode) => p.evaluate(async ([s, k, ref, mode]) => {
  const e = window.__cityGL; const r = e.renderer;
  e.scene.traverse((o) => { if (!o.isMesh || !/^(buildings|caps)$/.test(o.userData.layer)) return; if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow; o.castShadow = mode === 'no-building-shadow' ? false : o.userData.cs0; });
  if (window.__W === undefined) { window.__W = e.viewport.W; window.__H = e.viewport.H; }
  e.resize(window.__W, window.__H, mode === 'dpr1' ? 1 : 2);
  let err = null;
  try { if (mode === 'no-shadow-map') { r.shadowMap.enabled = false; e.sun.setEnabled(false); } else { r.shadowMap.enabled = true; e.sun.setEnabled(true); } } catch (x) { err = String(x).slice(0, 80); }
  e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k }); e.invalidate();
  await new Promise((r) => setTimeout(r, 1500));
  const deltas = []; let last = performance.now(); let i = 0;
  await new Promise((done) => { const step = (t) => { deltas.push(t - last); last = t; i++; e.setCamera({ cx: ref.cx + i * 0.5, cy: ref.cy, scale: ref.scale * k * (1 + 0.1 * Math.sin(i / 25)) }); e.invalidate(); if (i < 150) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  deltas.splice(0, 10); deltas.sort((a, b) => a - b);
  const q = (f) => deltas[Math.floor(f * (deltas.length - 1))];
  return { fps: Math.round(1000 / q(0.5)), p90: +q(0.9).toFixed(1), dpr: e.viewport.dpr, err };
}, [s, k, REF, mode]);
console.log('backend', await p.evaluate(() => window.__cityGL.backend));
for (const [name, s, k] of [['whole city', 0, 1], ['district', 1, 4], ['street', 2, 30]]) {
  const row = {};
  for (const mode of ['as-is', 'no-building-shadow', 'dpr1', 'no-shadow-map', 'as-is-again']) row[mode] = await measure(s, k, mode);
  console.log(name.padEnd(11), Object.entries(row).map(([m, v]) => `${m}: ${v.fps} fps p90 ${v.p90}${v.err ? ' ERR ' + v.err : ''}`).join(' | '));
}
await b.close();
