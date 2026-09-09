import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3008';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 820 } });
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 240000 }); await p.waitForTimeout(2000);
const x = await p.$('.fx-city-strip-x'); if (x) await x.click(); await p.waitForTimeout(500);
const c = await (await p.$('canvas')).boundingBox();
for (const [stop, fx, fy] of [['Whole city', 0.55, 0.5], ['District', 0.45, 0.5], ['Street', 0.7, 0.3]]) {
  await p.click(`.fx-city-controls .fx-city-preset:text-is("${stop}")`); await p.waitForTimeout(2500);
  await p.mouse.click(c.x + c.width * fx, c.y + c.height * fy); await p.waitForTimeout(3500);
  console.log(stop.padEnd(11), 'pin says:', await p.evaluate(() => window.__cityGLOverlay?.pickLabel ?? '(no handle)'), '| panel:', await p.evaluate(() => document.querySelector('.fx-city-ledger h2, .fx-city-ledger-head')?.textContent?.trim().slice(0, 30)));
  const close = await p.$('.fx-city-ledger button[aria-label="Close"]'); if (close) { await close.click(); await p.waitForTimeout(500); }
}
await b.close();
