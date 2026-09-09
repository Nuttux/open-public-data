import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE; const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 240000 }); await p.waitForTimeout(2500);
const x = await p.$('.fx-city-strip-x'); if (x) await x.click(); await p.waitForTimeout(500);
const snap = async (name) => {
  await p.addStyleTag({ content: '.fx-city-ledger{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important;width:360px!important} .fx-city-stage{height:auto!important}' });
  const el = await p.$('.fx-city-ledger'); const txt = await el.innerText();
  await p.waitForTimeout(600); const box = await el.boundingBox();
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 5000) }, animations: 'disabled' }); console.log(`--- ${name}: ${Math.round(box.height)} px tall, ${txt.length} chars`);
  writeFileSync(`${OUT}/${name}.txt`, txt);
  await p.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (/fx-city-ledger\{position:static/.test(s.textContent)) s.remove(); }));
};
const c = await (await p.$('canvas')).boundingBox();
await p.click('.fx-city-controls .fx-city-preset:text-is("Whole city")'); await p.waitForTimeout(1500);
await p.mouse.click(c.x + c.width * 0.55, c.y + c.height * 0.5); await p.waitForTimeout(4000);
await snap('1-hood');
const chip = (await p.$$(".fx-city-ledger .fx-block-subject"))[1]; if (chip) { await chip.click(); await p.waitForTimeout(600); await snap('2-hood-chip'); await chip.click(); await p.waitForTimeout(300); }
const dec = await p.$('.fx-city-ledger details.fx-block-row summary'); if (dec) { await dec.click(); await p.waitForTimeout(600); }
const more = await p.$('.fx-city-ledger .fx-block-more'); console.log('see-more present on hood:', !!more); if (more) { await more.click(); await p.waitForTimeout(300); }
await snap('3-hood-decade-open');
// tabs: press the street tab
const tabs = await p.$$('.fx-city-ledger .fx-block-tab'); console.log('tabs:', await Promise.all(tabs.map((t) => t.innerText())));
const st = tabs.find(async () => true); 
const streetTab = (await p.$$('.fx-city-ledger .fx-block-tab:not(.is-on)'))[1] ?? (await p.$$('.fx-city-ledger .fx-block-tab:not(.is-on)'))[0];
if (streetTab) { await streetTab.click(); await p.waitForTimeout(3000); }
await snap('4-street-via-tab');
const chip2 = await p.$('.fx-city-ledger .fx-block-subject'); if (chip2) { await chip2.click(); await p.waitForTimeout(600); await snap('5-street-chip'); await chip2.click(); await p.waitForTimeout(300); }
const dec2 = await p.$('.fx-city-ledger details.fx-block-row summary'); if (dec2) { await dec2.click(); await p.waitForTimeout(800); }
await snap('6-street-decade-open');
console.log('done');
await b.close();
