import { chromium } from 'playwright';
const BASE = process.env.BASE || 'https://www.qipu.org'; const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 240000 }); await p.waitForTimeout(2000);
const x = await p.$('.fx-city-strip-x'); if (x) await x.click(); await p.waitForTimeout(500);
console.log('=== YEAR LIST (no pick) ===\n' + (await p.evaluate(() => document.querySelector('.fx-city-ledger').innerText)).slice(0, 1400));
await p.screenshot({ path: `${OUT}/L0-year.jpg`, type: 'jpeg', quality: 75, clip: { x: 1080, y: 90, width: 360, height: 810 } });
const c = await (await p.$('canvas')).boundingBox();
for (const [stop, fx, fy] of [['Whole city', 0.55, 0.5], ['District', 0.45, 0.5], ['A few streets', 0.5, 0.5], ['Street', 0.7, 0.3]]) {
  await p.click(`.fx-city-controls .fx-city-preset:text-is("${stop}")`); await p.waitForTimeout(2500);
  await p.mouse.click(c.x + c.width * fx, c.y + c.height * fy); await p.waitForTimeout(4000);
  const txt = await p.evaluate(() => document.querySelector('.fx-city-ledger')?.innerText ?? '');
  console.log(`\n=== ${stop.toUpperCase()} ===\n` + txt.slice(0, 2200));
  await p.screenshot({ path: `${OUT}/L-${stop.replace(/ /g, '_')}.jpg`, type: 'jpeg', quality: 75, clip: { x: 1080, y: 90, width: 360, height: 810 } });
  // scroll the panel to see the list further down
  await p.evaluate(() => { const l = document.querySelector('.fx-city-ledger'); l.scrollTop = 700; }); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/L-${stop.replace(/ /g, '_')}-2.jpg`, type: 'jpeg', quality: 75, clip: { x: 1080, y: 90, width: 360, height: 810 } });
  const close = await p.$('.fx-city-ledger button[aria-label="Close"]'); if (close) { await close.click(); await p.waitForTimeout(500); }
}
await b.close();
