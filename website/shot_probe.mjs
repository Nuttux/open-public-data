import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(8000);
await p.screenshot({ path: `${SHOT}/probe-01.png` });
const btns = await p.$$eval('button, a[href], summary, [role=button]', ns =>
  ns.map(n => (n.textContent||'').trim().slice(0,40)).filter(Boolean).slice(0,40));
console.log('INTERACTIVE:', JSON.stringify(btns, null, 0).slice(0,1200));
console.log('canvas:', await p.locator('canvas').count());
console.log('h1:', (await p.locator('h1').first().innerText().catch(()=>'-')).slice(0,80));
await b.close();
