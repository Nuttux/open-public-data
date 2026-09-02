import { chromium } from 'playwright';
import fs from 'node:fs';
const SCR = process.env.SCR, BASE = 'http://localhost:3000';
const REF = { cx: 241.427019126574, cy: 707.0567508859249, scale: 0.0681567332915786 };
const CSS = { w: 1280, h: 768 };
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: CSS.w, height: 1200 }, deviceScaleFactor: 2 });
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
await p.goto(`${BASE}/us/city/sf/the-city?labels=0`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !r.name.includes('/film/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(6000);
await p.addStyleTag({ content: `.theme-fusion .fx-city-stage{height:${CSS.h}px !important;min-height:0 !important;border:0 !important}
.fx-city-shell *{visibility:hidden !important}.fx-city-shell canvas{visibility:visible !important}.fx-city-shell [data-citygl-film-chrome]{display:none !important}` });
await p.waitForTimeout(1000);
const box = await p.locator('canvas').first().boundingBox();
const pose = async (cx, cy, scale, band) => {
  await p.evaluate(([cx, cy, scale, band]) => { const e = window.__cityGL; e.setStep(band); e.setCamera({ cx, cy, scale }); e.invalidate(); }, [cx, cy, scale, band]);
  await p.waitForTimeout(350);
  for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__cityGL.invalidate()); await p.waitForTimeout(120); }
};
const z = 4, scale = REF.scale * 2, f = 2;
const cam = (i, j) => [REF.cx + ((i + 0.5) * CSS.w - (CSS.w * f) / 2) / scale, REF.cy - ((j + 0.5) * CSS.h - (CSS.h * f) / 2) / scale];
const seq = [[0,1],[0,0],[0,1],[1,1],[0,0]];
let k = 0;
for (const [i, j] of seq) {
  const [cx, cy] = cam(i, j); await pose(cx, cy, scale, 1);
  const st = await p.evaluate(() => { const e = window.__cityGL; return { step: e.getStep?.(), warming: e.warming, keys: Object.keys(e).slice(0, 40) }; });
  await p.screenshot({ clip: box, type: 'png', path: `${SCR}/haze-${k}-i${i}j${j}.png` });
  console.log(k, i, j, JSON.stringify(st).slice(0, 300)); k++;
}
await b.close();
