/* THE TRUTH ABOUT THE BOOT FREEZE: gaps in a setTimeout(0) heartbeat. The
   Long Tasks API missed a 2 s block (measured 2026-09-08), so this counts
   every stretch the main thread could not run a timer.
   BASE=... node x_boot_gaps.mjs [runs] */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const RUNS = Number(process.argv[2] || 1);
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
for (let r = 0; r < RUNS; r++) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__gaps = []; window.__rgaps = []; let last = performance.now(); const loop = () => { const n = performance.now(); if (n - last > 50) window.__gaps.push([Math.round(last), Math.round(n - last)]); last = n; setTimeout(loop, 0); }; loop(); let rl = performance.now(); const rloop = () => { const n = performance.now(); if (n - rl > 50) window.__rgaps.push([Math.round(rl), Math.round(n - rl)]); rl = n; requestAnimationFrame(rloop); }; requestAnimationFrame(rloop); });
  const t0 = Date.now();
  await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__cityGL && window.__cityGL.getStats().frames > 5, null, { timeout: 90000 }).catch(() => console.log('no frames'));
  const ready = Date.now() - t0;
  await p.waitForTimeout(5000);
  const gaps = await p.evaluate(() => window.__gaps); const rg = await p.evaluate(() => window.__rgaps); const rtot = rg.reduce((a, g) => a + g[1], 0), rmax = Math.max(0, ...rg.map(g => g[1]));
  const tot = gaps.reduce((a, g) => a + g[1], 0), max = Math.max(0, ...gaps.map(g => g[1]));
  console.log(`run ${r}: ready ${ready} ms | timer gaps n=${gaps.length} total=${tot} max=${max} | paint gaps n=${rg.length} total=${rtot} max=${rmax}\n   timer: ${gaps.map(g => g.join('+')).join(' ')}\n   paint: ${rg.map(g => g.join('+')).join(' ')}`);
  await ctx.close();
}
await b.close();
