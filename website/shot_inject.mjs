import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
// give the CURRENT year's rows real written lines, so the default view exercises the path
await p.route('**/blocks/year/2020.json', async (route) => {
  const res = await route.fetch();
  const j = await res.json();
  const LINES = [
    'City buys 1939 Market Street from the Sheet Metal Workers union',
    'Subdivision map approved for 95 flats at 950 Gough Street',
    'Landmark status proposed for the Chautauqua House on Masonic',
    'Board asked to confirm 1846 Grove Street needs no review',
    'Ban on chain pet shops sent to committee',
  ];
  j.pl = (j.t || []).map((_, i) => (i % 3 === 0 ? LINES[i % LINES.length] : ''));
  await route.fulfill({ response: res, body: JSON.stringify(j), headers: { ...res.headers(), 'content-type': 'application/json' } });
});
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(10000);
const x = p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1500); }
await p.screenshot({ path: `${SHOT}/inject-full.png` });
const txt = await p.locator('body').innerText();
const i = txt.indexOf('THE RECORD');
console.log('--- RAIL ---');
console.log(txt.slice(i, i + 640));
await b.close();
