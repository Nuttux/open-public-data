import { chromium } from 'playwright';
const BASE = process.env.BASE, OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
for (const at of [2000, 3500, 6000]) {
  const wait = at - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait);
  await p.screenshot({ path: `${OUT}/boot-${at}.jpg`, type: 'jpeg', quality: 70 });
}
await b.close();
