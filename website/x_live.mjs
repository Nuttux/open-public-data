import { chromium } from 'playwright';
const SCR = process.env.SCR;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !r.name.includes('/film/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(6000);
await p.screenshot({ path: `${SCR}/live-default.png` });
/* pan south: same scale, centre 4 km south of the default */
await p.evaluate(() => { const e = window.__cityGL; const c = e.getCamera(); e.setCamera({ cx: c.cx, cy: c.cy - 2500, scale: c.scale }); e.invalidate(); });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${SCR}/live-south.png` });
await b.close();
