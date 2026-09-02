import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(10000);
const x = p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1200); }
// the year bar sits near the bottom; drag its handle left toward 1925
const y = 783;
for (const target of [389, 380, 400]) {
  await p.mouse.move(1058, y);
  await p.mouse.down();
  await p.mouse.move(target, y, { steps: 30 });
  await p.mouse.up();
  await p.waitForTimeout(4000);
  const t = await p.locator('body').innerText();
  const m = t.match(/\b(19\d\d|20\d\d)\s+—\s+\d+\s+decisions/);
  console.log('year now:', m ? m[1] : '?');
  if (m && +m[1] < 1960) break;
}
await p.waitForTimeout(3000);
await p.screenshot({ path: `${SHOT}/real-1925.png` });
const txt = await p.locator('body').innerText();
const i = txt.indexOf('THE RECORD');
console.log('--- RAIL (real data) ---');
console.log(txt.slice(i, i + 700));
await b.close();
