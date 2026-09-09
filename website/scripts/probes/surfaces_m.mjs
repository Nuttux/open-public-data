import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'https://www.qipu.org'; const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 120000 }); await p.waitForTimeout(3000);
const sb = await (await p.$('.fx-city-stage')).boundingBox();
const snap = async (name) => {
  await p.addStyleTag({ content: '.fx-city-ledger{position:static!important;max-height:none!important;height:auto!important;overflow:visible!important;box-shadow:none!important} .fx-city-ledger > *{overflow:visible!important;max-height:none!important}' });
  await p.waitForTimeout(500); const el = await p.$('.fx-city-ledger'); const txt = await el.innerText(); const box = await el.boundingBox();
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 70, fullPage: true, clip: { x: 0, y: box.y, width: 390, height: Math.min(box.height, 5000) }, animations: 'disabled' });
  writeFileSync(`${OUT}/${name}.txt`, txt); console.log(`--- ${name}: ${Math.round(box.height)} px, ${txt.length} chars`);
  await p.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (/fx-city-ledger\{position:static/.test(s.textContent)) s.remove(); }));
};
await p.touchscreen.tap(sb.x + sb.width * 0.55, sb.y + sb.height * 0.5); await p.waitForTimeout(3500);
await snap('M-hood');
await p.click('.fx-city-sheet-close'); await p.waitForTimeout(500);
await p.click('.fx-city-stoprow button:nth-child(4)'); await p.waitForTimeout(3000);
await p.touchscreen.tap(sb.x + sb.width * 0.7, sb.y + sb.height * 0.3); await p.waitForSelector('.fx-city-ledger', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(3000);
if (await p.$('.fx-city-ledger')) { const dec = await p.$('.fx-city-ledger details.fx-block-row summary'); if (dec) { await dec.click(); await p.waitForTimeout(600); } await snap('M-street'); }
await b.close();
