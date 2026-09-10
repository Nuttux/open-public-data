/* phone: sticky tabs + find my street (GPS mocked inside the Castro) */
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE; const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, geolocation: { latitude: 37.7609, longitude: -122.4350 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 120000 }); await p.waitForTimeout(3000);
console.log('locate btn:', !!(await p.$('.fx-city-locate-btn')));
await p.click(".fx-city-locate-btn"); await p.waitForSelector(".fx-city-sheet-fold", { timeout: 20000 }).catch(() => console.log("no drawer after 20 s")); await p.waitForTimeout(1500);
const handle = await p.$('.fx-city-sheet-fold'); console.log('handle:', handle ? (await handle.innerText()).replace(/\n/g, ' · ') : 'none', '| stop:', await p.$eval('.fx-city-ledger', (e) => e.dataset.stop).catch(() => '?'));
await p.screenshot({ path: `${OUT}/m1-located.jpg`, type: 'jpeg', quality: 70 });
// scroll the drawer 600px → tabs should still be visible (sticky)
await p.$eval('.fx-city-ledger > :not(.fx-city-sheet-grab)', (el) => { el.scrollTop = 600; }); await p.waitForTimeout(400);
const tabsBox = await (await p.$('.fx-block-tabs-wrap'))?.boundingBox(); const ledger = await (await p.$('.fx-city-ledger')).boundingBox();
console.log('tabs top vs ledger top after scroll:', tabsBox && Math.round(tabsBox.y - ledger.y));
await p.screenshot({ path: `${OUT}/m2-scrolled.jpg`, type: 'jpeg', quality: 70 });
const txt = await p.$eval('.fx-city-ledger', (e) => e.innerText); writeFileSync(`${OUT}/m1.txt`, txt);
await b.close();
