import { chromium, devices } from 'playwright';
const BASE = process.env.BASE; const OUT = process.env.OUT;
const b = await chromium.launch();
for (const [name, url, mobile] of [
  ['p-hood', '/us/city/sf/the-city/neighbourhood/castro-upper-market', false],
  ['p-street', '/us/city/sf/the-city/street/market-st', false],
  ['p-street-m', '/us/city/sf/the-city/street/castro-st', true],
]) {
  const ctx = mobile ? await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 } }) : await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', name, e.message));
  const r = await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  console.log(name, r.status(), await p.title());
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 70, fullPage: true });
  await ctx.close();
}
await b.close();
