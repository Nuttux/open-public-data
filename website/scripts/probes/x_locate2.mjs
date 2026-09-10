import { chromium, devices } from 'playwright';
const BASE = process.env.BASE, OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, geolocation: { latitude: 37.7609, longitude: -122.4350 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 120000 });
await p.waitForTimeout(3000);
const stops = async () => p.$$eval('.fx-city-stoprow button', (els) => els.map((e) => e.className.includes('is-on') || e.getAttribute('aria-pressed') === 'true' ? '[' + e.innerText + ']' : e.innerText).join(' '));
console.log('before:', await stops());
await p.screenshot({ path: `${OUT}/loc-0.jpg`, type: 'jpeg', quality: 60 });
await p.click('.fx-city-locate-btn');
for (const t of [2500, 5000, 12000]) {
  await p.waitForTimeout(t);
  console.log(`after ${t}:`, await stops(), '| drawer', !!(await p.$('.fx-city-sheet-fold')));
}
await p.screenshot({ path: `${OUT}/loc-1.jpg`, type: 'jpeg', quality: 60 });
// control: a real tap in the middle of the map
const sb = await (await p.$('.fx-city-stage')).boundingBox();
await p.touchscreen.tap(sb.x + sb.width * 0.5, sb.y + sb.height * 0.45);
await p.waitForTimeout(4000);
console.log('after real tap: drawer', !!(await p.$('.fx-city-sheet-fold')));
await p.screenshot({ path: `${OUT}/loc-2.jpg`, type: 'jpeg', quality: 60 });
await b.close();
