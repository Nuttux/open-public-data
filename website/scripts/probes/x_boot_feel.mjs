/* What a reader can DO, second by second, from the moment the page opens.
   Not "is it fast" — "is it usable, and does it look alive". */
import { chromium } from 'playwright';
const BASE = process.env.BASE, OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
const seen = {};
const mark = (k) => { if (!seen[k]) seen[k] = Date.now() - t0; };
for (let i = 0; i < 60; i++) {
  const s = await p.evaluate(() => ({
    canvas: !!document.querySelector('.fx-city-stage canvas'),
    plate: !!document.querySelector('.fx-city-plate'),
    zoom: !!document.querySelector('.fx-city-controls .fx-city-preset'),
    search: !!document.querySelector('.fx-city-find, .fx-city-find-btn, input'),
    scrub: !!document.querySelector('.fx-city-scrub'),
    chips: !!document.querySelector('.fx-city-chips button'),
    ledger: !!document.querySelector('.fx-city-ledger .fx-city-record, .fx-city-ledger h2'),
    note: (document.querySelector('.fx-city-stage')?.innerText || '').slice(0, 60).replace(/\n/g, ' '),
    frames: window.__cityGL?.getStats ? window.__cityGL.getStats().frames : -1,
  }));
  for (const k of ['canvas', 'plate', 'zoom', 'search', 'scrub', 'chips', 'ledger']) if (s[k]) mark(k);
  if (s.frames > 5) mark('modelDrawing');
  if (i % 4 === 0) console.log(`${String(Date.now() - t0).padStart(5)} ms  canvas:${+s.canvas} plate:${+s.plate} zoom:${+s.zoom} search:${+s.search} scrub:${+s.scrub} chips:${+s.chips} frames:${s.frames}  stage text: ${JSON.stringify(s.note)}`);
  if (seen.modelDrawing && seen.zoom) break;
  await p.waitForTimeout(250);
}
console.log('\nfirst appearance (ms):', JSON.stringify(seen));
// when does a click on the city actually answer?
const box = await (await p.$('.fx-city-stage')).boundingBox();
let clickWorks = null;
for (let i = 0; i < 1; i++) {
  await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await p.waitForTimeout(1500);
  clickWorks = await p.$('.fx-city-panel') ? Date.now() - t0 : null;
}
console.log('click answered by', clickWorks, 'ms');
for (const t of [1000, 2000, 3500, 6000]) {
  // re-run fresh for a clean screenshot at t
}
await b.close();
