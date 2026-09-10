/* batch 2: hood street chips, decade → year, status tags, chip filter with examples */
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
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 5000) }, animations: 'disabled' }); console.log(`--- ${name}: ${Math.round(box.height)} px tall`);
  writeFileSync(`${OUT}/${name}.txt`, txt);
  await p.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (/fx-city-ledger\{position:static/.test(s.textContent)) s.remove(); }));
};
const yearOut = async () => p.$eval('.fx-city-scrub', (el) => el.value).catch(() => '?');
const c = await (await p.$('canvas')).boundingBox();
await p.click('.fx-city-controls .fx-city-preset:text-is("Whole city")'); await p.waitForTimeout(1500);
await p.mouse.click(c.x + c.width * 0.55, c.y + c.height * 0.5); await p.waitForTimeout(4000);
console.log('year before:', await yearOut());
await snap('b1-hood');
const streets = await p.$$eval('.fx-city-ledger .fx-block-street', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('hood streets:', streets);
// press the horses chip (first) → examples
const chip = (await p.$$('.fx-city-ledger .fx-block-subject'))[0]; if (chip) { await chip.click(); await p.waitForTimeout(600); await snap('b2-hood-chip-ex'); await chip.click(); await p.waitForTimeout(300); }
// open a decade → year moves
const dec = (await p.$$('.fx-city-ledger details.fx-block-row summary'))[3]; if (dec) { await dec.click(); await p.waitForTimeout(1200); }
console.log('year after opening 4th decade:', await yearOut());
await snap('b3-hood-decade-open');
// street via chip
const st = await p.$('.fx-city-ledger .fx-block-street'); if (st) { await st.click(); await p.waitForTimeout(3000); }
console.log('tabs:', await p.$$eval('.fx-city-ledger .fx-block-tab', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ') + (e.classList.contains('is-on') ? ' *' : ''))));
const dec2 = (await p.$$('.fx-city-ledger details.fx-block-row summary'))[2]; if (dec2) { await dec2.click(); await p.waitForTimeout(1200); }
console.log('year after street decade:', await yearOut());
await snap('b4-street-from-hood');
const tags = await p.$$eval('.fx-city-ledger .fx-shelf-title', (els) => els.slice(0, 6).map((e) => e.innerText));
console.log('shelf titles:', tags);
await b.close();
