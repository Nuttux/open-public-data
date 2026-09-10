/* a past year at the street stop: is it level 7 now, or a 1.3x upscale of 6? */
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE, OUT = process.env.OUT;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const levels = new Set();
p.on('response', (r) => { const m = /\/us\/sf\/city\/(\d{4}|now)\/(\d)\//.exec(r.url()); if (m) levels.add(`${m[1]}@z${m[2]}`); });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 120000 });
await p.waitForTimeout(4000);
await p.click('.fx-city-stoprow button:nth-child(4)'); await p.waitForTimeout(3000);
levels.clear();
await p.evaluate(() => { const s = document.querySelector('.fx-city-scrub'); if (s) { s.value = '1950'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); } });
await p.waitForTimeout(9000);
console.log('tiles fetched at the street stop for 1950:', [...levels].sort().join(' '));
await p.screenshot({ path: `${OUT}/z7-1950-street.jpg`, type: 'jpeg', quality: 78 });
await b.close();
