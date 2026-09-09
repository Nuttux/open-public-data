/* Every record surface, full height, as text and picture. */
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'https://www.qipu.org'; const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 240000 }); await p.waitForTimeout(2500);
const x = await p.$('.fx-city-strip-x'); if (x) await x.click(); await p.waitForTimeout(500);
const snap = async (name) => {
  await p.addStyleTag({ content: '.fx-city-ledger{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important;width:360px!important} .fx-city-stage{height:auto!important}' });
  const el = await p.$('.fx-city-ledger'); const txt = await el.innerText();
  await p.waitForTimeout(600); const box = await el.boundingBox();
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 6000) }, animations: 'disabled' }); console.log(`--- ${name}: ${Math.round(box.height)} px tall, ${txt.length} chars`);
  writeFileSync(`${OUT}/${name}.txt`, txt);
  await p.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (/fx-city-ledger\{position:static/.test(s.textContent)) s.remove(); }));
};
await snap('A-yearlist');
const c = await (await p.$('canvas')).boundingBox();
await p.click('.fx-city-controls .fx-city-preset:text-is("Whole city")'); await p.waitForTimeout(1500);
await p.mouse.click(c.x + c.width * 0.55, c.y + c.height * 0.5); await p.waitForTimeout(4000);
const more = await p.$('.fx-city-ledger button:has-text("Read the rest"), .fx-city-ledger [class*=more]'); if (more) { await more.click().catch(() => {}); await p.waitForTimeout(500); }
await snap('B-hood');
let close = await p.$('.fx-city-ledger button[aria-label="Close"]'); if (close) { await close.click(); await p.waitForTimeout(500); }
await p.click('.fx-city-controls .fx-city-preset:text-is("Street")'); await p.waitForTimeout(2500);
await p.mouse.click(c.x + c.width * 0.7, c.y + c.height * 0.3); await p.waitForTimeout(4000);
const dec = await p.$('.fx-city-ledger details.fx-block-row summary'); if (dec) { await dec.click(); await p.waitForTimeout(800); }
await snap('C-street');
close = await p.$('.fx-city-ledger button[aria-label="Close"]'); if (close) { await close.click(); await p.waitForTimeout(500); }
await p.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.5); await p.waitForTimeout(4000);
await snap('D-second-street');
close = await p.$('.fx-city-ledger button[aria-label="Close"]'); if (close) { await close.click(); await p.waitForTimeout(500); }
// subject filter + year list
await p.click('.fx-city-controls .fx-city-preset:text-is("Whole city")'); await p.waitForTimeout(1500);
const chip = await p.$('.fx-city-chips button:nth-child(4)'); if (chip) { await chip.click(); await p.waitForTimeout(2500); await snap('E-subject-yearlist'); }
// a pin (subject dot) card: click a dot found via overlay marks? try clicking near a landmark diamond instead
await p.evaluate(() => window.__cityGL?.setYear?.(1950)); await p.waitForTimeout(2500); await snap('F-yearlist-1950');
console.log('done');
await b.close();
