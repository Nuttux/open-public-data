/* Tap accuracy on the coarse ground, then after the first touch brings the fine one. */
import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3007';
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, locale: 'en-US' }); const p = await ctx.newPage();
const reqs = []; p.on('response', (r) => { if (/terrain-fine|\/data\//.test(r.url())) reqs.push(r.url().replace(/.*\/data\//, '')); });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('.fx-city-stoprow', { timeout: 180000 }); await p.waitForFunction(() => !!window.__cityTiles, null, { timeout: 60000 }); await p.waitForTimeout(3000);
const grid = () => p.evaluate(() => { const t = window.__cityTiles; const st = document.querySelector('.fx-city-stage').getBoundingClientRect(); let hits = 0, n = 0; for (let fy = 0.15; fy <= 0.86; fy += 0.1) for (let fx = 0.15; fx <= 0.86; fx += 0.1) { n++; if (t.pickAt(st.width * fx, st.height * fy) !== null) hits++; } return `${hits}/${n}`; });
const stops = ['District', 'A few streets', 'Street'];
console.log('fine DEM requested before any touch:', reqs.some((u) => /terrain-fine/.test(u)));
const before = {}; for (const s of stops) { await p.getByRole('button', { name: s, exact: true }).tap(); await p.waitForTimeout(1500); before[s] = await grid(); }
console.log('coarse ground hits:', JSON.stringify(before));
/* the first touch on the map */
const st = await p.locator('.fx-city-stage').boundingBox(); await p.touchscreen.tap(st.x + st.width * 0.5, st.y + st.height * 0.5); await p.waitForTimeout(4000);
console.log('fine DEM requested after touch:', reqs.some((u) => /terrain-fine\.bin/.test(u)));
const after = {}; for (const s of stops) { await p.getByRole('button', { name: s, exact: true }).tap(); await p.waitForTimeout(1500); after[s] = await grid(); }
console.log('fine ground hits:  ', JSON.stringify(after));
await b.close();
