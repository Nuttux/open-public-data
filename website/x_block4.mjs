import { chromium, devices } from 'playwright';
const SCR = process.env.SCR;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-scrub', { timeout: 90000 }); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'District', exact: true }).tap(); await p.waitForTimeout(1500);
const box = await p.locator('.fx-city-tiles').boundingBox();
const pt = await p.evaluate(() => { const t = window.__cityTiles; const st = document.querySelector('.fx-city-stage').getBoundingClientRect(); for (let fy = 0.4; fy <= 0.7; fy += 0.05) for (let fx = 0.3; fx <= 0.7; fx += 0.05) { if (t.pickAt(st.width * fx, st.height * fy) !== null) return [st.width * fx, st.height * fy]; } return null; });
await p.touchscreen.tap(box.x + pt[0], box.y + pt[1]); await p.waitForTimeout(3000);
const url = await p.evaluate(() => location.search);
console.log('after tap, url:', url);
/* deep link: a fresh page on that url opens the same fiche */
const p2 = await ctx.newPage();
await p2.goto('http://localhost:3000/us/city/sf/the-city' + url, { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.fx-city-ledger', { timeout: 90000 }).catch(() => console.log('deep link: no ledger'));
await p2.waitForTimeout(3000);
console.log('deep link:', JSON.stringify(await p2.evaluate(() => ({ grab: document.querySelector('.fx-city-sheet-grab')?.textContent?.trim().slice(0, 60) ?? null, zoom: +window.__cityTiles.map.getZoom().toFixed(2) }))));
await p2.screenshot({ path: `${SCR}/m-deeplink.png` });
/* play */
await p2.getByRole('button', { name: 'Play from 1906' }).tap();
const seq = []; for (let i = 0; i < 6; i++) { await p2.waitForTimeout(700); seq.push(await p2.evaluate(() => document.querySelector('.fx-city-year').textContent + '/' + [...new Set([...document.querySelectorAll('img.leaflet-tile')].map((i) => i.src.replace(/.*city\//, '').split('/')[0]))].join('+'))); }
console.log('play:', seq.join('  '));
await p2.screenshot({ path: `${SCR}/m-play.png` });
await p2.getByRole('button', { name: 'Pause' }).tap(); await p2.waitForTimeout(500);
console.log('paused at', await p2.evaluate(() => document.querySelector('.fx-city-year').textContent), 'errors', errs.length ? errs : 'none');
await b.close();
