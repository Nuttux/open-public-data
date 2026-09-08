import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 160)); }); p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)));
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__cityGL && window.__cityGL.getStats().frames > 5, null, { timeout: 90000 });
await p.waitForTimeout(6000);
const st = await p.evaluate(() => { const e = window.__cityGL; let meshes = 0, bldg = 0; e.scene.traverse((o) => { if (o.isMesh || o.isLineSegments) { meshes++; if (o.userData.layer === 'buildings') bldg++; } }); return { backend: e.backend, frames: e.getStats().frames, meshes, bldg, unstamped: (() => { let n = 0; e.scene.traverse((o) => { if (o.isMesh && o.userData.layer === undefined) n++; }); return n; })() }; });
console.log(st); console.log('console:', errs.slice(0, 6));
/* the engine paints on demand and a headless capture reads a cleared WebGPU texture — force a frame first, as render-city-film.mjs does */
await p.evaluate(async () => { window.__cityGL.renderNow(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
await p.screenshot({ path: process.env.OUT, type: 'jpeg', quality: 85 });
await b.close();
