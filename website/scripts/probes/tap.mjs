import { chromium, devices } from 'playwright';
const SCR = process.env.SCR;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 200)); });
await p.goto((process.env.BASE || 'http://localhost:3000') + '/us/city/sf/the-city', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 90000 });
await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'District', exact: true }).tap();
await p.waitForTimeout(1500);
const box = await p.locator('.fx-city-tiles').boundingBox();
const pt = await p.evaluate(() => { const t = window.__cityTiles; const st = document.querySelector('.fx-city-stage').getBoundingClientRect(); for (let fy = 0.4; fy <= 0.7; fy += 0.05) for (let fx = 0.3; fx <= 0.7; fx += 0.05) { if (t.pickAt(st.width * fx, st.height * fy) !== null) return [st.width * fx, st.height * fy]; } return null; });
console.log('tap point', pt);
await p.touchscreen.tap(box.x + pt[0], box.y + pt[1]);
await p.waitForSelector('.fx-city-ledger', { timeout: 20000 }).catch(() => console.log('no ledger'));
await p.waitForTimeout(3500);
const s = await p.evaluate(() => ({
  ledger: !!document.querySelector('.fx-city-ledger'),
  grab: document.querySelector('.fx-city-sheet-grab')?.textContent?.trim().slice(0, 80) ?? null,
  panelHead: document.querySelector('.fx-city-ledger h2, .fx-city-ledger h3')?.textContent?.trim().slice(0, 80) ?? null,
  rows: document.querySelectorAll('.fx-city-ledger li').length,
  stage: Math.round(document.querySelector('.fx-city-stage').getBoundingClientRect().height),
}));
console.log(JSON.stringify(s));
await p.screenshot({ path: `${SCR}/m-tap.png` });
/* search: open the corner button, type and pick the first hit */
await p.locator('.fx-city-find-btn').tap(); await p.waitForTimeout(500);
await p.locator('.fx-city-find input').first().fill('castro');
await p.waitForTimeout(1500);
const hits = await p.locator('.fx-city-find [role="option"], .fx-city-find li, .fx-city-find button').count();
console.log('search hits', hits);
if (hits) { await p.locator('.fx-city-find [role="option"], .fx-city-find li, .fx-city-find button').first().tap(); await p.waitForTimeout(3500); }
const s2 = await p.evaluate(() => ({ grab: document.querySelector('.fx-city-sheet-grab')?.textContent?.trim().slice(0, 80) ?? null, rows: document.querySelectorAll('.fx-city-ledger li').length }));
console.log(JSON.stringify(s2));
await p.screenshot({ path: `${SCR}/m-search.png` });
console.log('errors', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
