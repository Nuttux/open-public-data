import { chromium, devices } from 'playwright';
const b = await chromium.launch();
for (const url of ['http://localhost:3000/us/city/sf/the-city', 'http://localhost:3000/us/city/sf/the-city?tiles=1']) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text().slice(0, 300)); });
  p.on('response', (r) => { if (r.status() >= 400 && /tiles|leaflet|data\//.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForTimeout(15000);
  const s = await p.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth,
    gl: !!document.querySelector('.fx-city-canvas'), tiles: !!document.querySelector('.fx-city-tiles'),
    leaflet: !!document.querySelector('.leaflet-container'), tileImgs: document.querySelectorAll('.fx-city-tile').length,
    loadingText: document.querySelector('.fx-city-loading')?.textContent ?? null,
    overlay: !!document.querySelector('.fx-city-tiles-labels canvas'),
  }));
  console.log(url.split('?')[1] ?? 'auto', JSON.stringify(s));
  if (errs.length) console.log('  errs:', errs.slice(0, 6).join('\n  '));
  await ctx.close();
}
await b.close();
