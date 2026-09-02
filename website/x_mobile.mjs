import { chromium, devices } from 'playwright';
const SCR = process.env.SCR;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
const url = process.env.URL ?? 'http://localhost:3000/us/city/sf/the-city';
const t0 = Date.now();
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForSelector('.fx-city-tiles.leaflet-container', { timeout: 120000 });
await p.waitForSelector('.fx-city-controls', { timeout: 120000 });
console.log('tile map up in', Date.now() - t0, 'ms');
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
  tiles: document.querySelectorAll('.fx-city-tile').length,
  loaded: [...document.querySelectorAll('.fx-city-tile')].filter((i) => i.complete && i.naturalWidth > 0).length,
  overlay: !!document.querySelector('.fx-city-tiles-labels canvas'),
  ovSize: (() => { const c = document.querySelector('.fx-city-tiles-labels canvas'); return c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null; })(),
  stage: (() => { const r = document.querySelector('.fx-city-stage').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
  gl: !!document.querySelector('.fx-city-canvas'),
  mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a',
}));
console.log(JSON.stringify(info));
await p.screenshot({ path: `${SCR}/m-whole.png` });
/* dismiss the intro strip by tapping the map, then walk the stops */
for (const label of ['District', 'A few streets', 'Street']) {
  await p.getByRole('button', { name: label, exact: true }).tap();
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${SCR}/m-${label.replace(/\s+/g, '_').toLowerCase()}.png` });
}
/* and a drag on the map to see the labels follow */
const box = await p.locator('.fx-city-tiles').boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 12 }); await p.mouse.up();
await p.waitForTimeout(1200);
await p.screenshot({ path: `${SCR}/m-dragged.png` });
console.log('errors:', errs.length ? errs.slice(0, 8).join('\n') : 'none');
await b.close();
