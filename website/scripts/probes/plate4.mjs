import { chromium } from 'playwright';
const BASE = process.env.BASE || 'https://www.qipu.org';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
for (let run = 0; run < 2; run++) {
  const p = await b.newPage({ viewport: { width: 1440, height: 820 } });
  const t0 = Date.now(); const marks = {};
  p.on('response', (r) => { const u = r.url(); if (/now\/index\.json/.test(u)) marks.index = Date.now() - t0; if (/now\/2\/0\/0\.webp/.test(u)) marks.tile = Date.now() - t0; if (/manifest\.json/.test(u) && !marks.manifest) marks.manifest = Date.now() - t0; });
  await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
  let painted = null;
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(250); const ok = await p.evaluate(() => { const t = window.__cityGLPlate; return !!(t && t.frame && t.loaded >= 1); }); if (ok) { painted = Date.now() - t0; break; } }
  const ready = await p.evaluate(() => !!window.__cityGL && !document.querySelector('.fx-city-loading'));
  console.log(`run ${run}: plate painted at ${painted} ms; index ${marks.index} ms, first tile ${marks.tile} ms, manifest ${marks.manifest} ms; ready by then: ${ready}`);
  await p.close();
}
await b.close();
