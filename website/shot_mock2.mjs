import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(11000);
const x = p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1200); }
// A. year panel: clip the right-hand column
await p.screenshot({ path: `${SHOT}/mock-A-yearpanel.png`, clip: { x: 1152, y: 130, width: 288, height: 780 } });
console.log('A ok');
// B. block panel: search a street to open one
const search = p.locator('input[placeholder*="Find a place"]').first();
if (await search.count()) {
  await search.click(); await search.type('Market Street', { delay: 40 });
  await p.waitForTimeout(2500);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(7000);
  await p.screenshot({ path: `${SHOT}/mock-B-blockpanel.png`, clip: { x: 1152, y: 130, width: 288, height: 780 } });
  console.log('B ok');
  const t = await p.locator('body').innerText();
  const i = t.search(/DECADE BY DECADE|What the Board decided/);
  if (i >= 0) console.log('--- BLOCK PANEL ---\n' + t.slice(i, i + 700));
}
await b.close();
