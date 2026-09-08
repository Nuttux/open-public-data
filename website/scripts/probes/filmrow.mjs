import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const SCR = process.env.SCR;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 60000 });
await p.waitForTimeout(1500);
const row = await p.$('.fx-city-filmrow');
console.log('filmrow', row ? await row.boundingBox() : null, 'text', row ? await row.innerText() : null);
await p.screenshot({ path: `${SCR}/filmrow-664.jpg`, type: 'jpeg', quality: 80 });
if (row) { await row.click(); await p.waitForTimeout(800); const v = await p.$('.fx-city-filmvideo'); console.log('video', v ? await v.boundingBox() : null, await p.evaluate(() => { const v = document.querySelector('.fx-city-filmvideo'); return v ? { src: v.currentSrc || v.src, err: v.error && v.error.code, net: v.networkState } : null; })); await p.screenshot({ path: `${SCR}/filmopen-664.jpg`, type: 'jpeg', quality: 80 }); const x = await p.$('.fx-city-film-x'); console.log('close btn', x ? await x.boundingBox() : null); await x.click(); await p.waitForTimeout(300); console.log('closed', !(await p.$('.fx-city-filmvideo'))); }
await b.close();
