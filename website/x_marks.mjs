import { chromium, devices } from 'playwright';
const SCR = process.env.SCR;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-subjrow', { timeout: 90000 }); await p.waitForTimeout(2000);
const inkPx = () => p.evaluate(() => { const c = document.querySelector('.fx-city-marks-2d'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
console.log('chips', await p.evaluate(() => [...document.querySelectorAll('.fx-city-chips button')].map((b) => b.textContent.trim()).join(' | ')));
console.log('ink px with no subject', await inkPx());
const chips = p.locator('.fx-city-chips button');
await chips.nth(1).tap(); await p.waitForTimeout(800);
console.log('ink px after chip 1', await inkPx());
await p.screenshot({ path: `${SCR}/m-marks-whole.png` });
await p.getByRole('button', { name: 'District', exact: true }).tap(); await p.waitForTimeout(1500);
console.log('ink px at district', await inkPx());
await p.screenshot({ path: `${SCR}/m-marks-district.png` });
/* find an inked point and tap it */
const pt = await p.evaluate(() => { const c = document.querySelector('.fx-city-marks-2d'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const dpr = c.width / c.clientWidth; for (let y = 40; y < c.height - 40; y += 3) for (let x = 20; x < c.width - 20; x += 3) { const i = (y * c.width + x) * 4; if (d[i + 3] > 200) return [x / dpr, y / dpr]; } return null; });
console.log('mark at', pt);
if (pt) { const box = await p.locator('.fx-city-tiles').boundingBox(); await p.touchscreen.tap(box.x + pt[0], box.y + pt[1]); await p.waitForTimeout(3000); console.log('after mark tap:', await p.evaluate(() => document.querySelector('.fx-city-sheet-grab')?.textContent?.trim().slice(0, 60) ?? 'no sheet')); await p.screenshot({ path: `${SCR}/m-marks-tap.png` }); }
/* play with the real years */
await p.getByRole('button', { name: 'Play from 1906' }).tap();
const seq = []; for (let i = 0; i < 5; i++) { await p.waitForTimeout(700); seq.push(await p.evaluate(() => document.querySelector('.fx-city-year').textContent + '/' + [...new Set([...document.querySelectorAll('img.leaflet-tile')].filter((i) => i.src).map((i) => i.src.replace(/.*city\//, '').split('/')[0]))].join('+'))); }
console.log('play:', seq.join('  '));
await p.getByRole('button', { name: 'Pause' }).tap();
console.log('errors', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
