import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(9000);
// close the intro card
const x = p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1200); }
// the year dropdown
const dd = p.locator('button:has-text("decisions")').first();
if (await dd.count()) {
  await dd.click().catch(()=>{});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SHOT}/dd-open.png` });
  const opts = await p.$$eval('[role=option], li, button', ns =>
    ns.map(n=>(n.textContent||'').trim()).filter(t=>/^(19|20)\d\d/.test(t)).slice(0,30));
  console.log('year options:', JSON.stringify(opts).slice(0,600));
  const y1925 = p.locator('[role=option], li, button').filter({ hasText: /^1925/ }).first();
  if (await y1925.count()) { await y1925.click().catch(()=>{}); console.log('clicked 1925'); }
}
await p.waitForTimeout(6000);
await p.screenshot({ path: `${SHOT}/rail-after.png` });
const txt = await p.locator('body').innerText();
const i = txt.indexOf('THE RECORD');
console.log('--- RAIL TEXT ---');
console.log(txt.slice(i, i+700));
await b.close();
