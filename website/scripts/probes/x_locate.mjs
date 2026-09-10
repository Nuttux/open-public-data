import { chromium, devices } from 'playwright';
const BASE = process.env.BASE;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, geolocation: { latitude: 37.7609, longitude: -122.4350 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => { if (/locate|picker|error/i.test(m.text())) console.log('console:', m.text()); });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 120000 });
const t0 = Date.now();
await p.waitForTimeout(3000);
await p.click('.fx-city-locate-btn');
for (let i = 0; i < 24; i++) {
  await p.waitForTimeout(i < 12 ? 500 : 5000);
  const st = await p.evaluate(() => ({
    drawer: !!document.querySelector('.fx-city-sheet-fold'),
    note: document.querySelector('.fx-city-locate-note')?.textContent ?? null,
    busy: !!document.querySelector('.fx-city-locate-btn.is-busy'),
    stop: document.querySelector('.fx-city-ledger')?.getAttribute('data-stop') ?? null,
  }));
  console.log(`${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(st));
  if (st.drawer) { console.log('handle:', (await p.$eval('.fx-city-sheet-fold', (e) => e.innerText)).replace(/\n/g, ' · ')); break; }
}
await b.close();
