import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(6000);
await p.getByRole('button', { name: /Explore the map/i }).click();
await p.waitForTimeout(8000);
const texts = await p.$$eval('button, summary, [role=button]', (ns) =>
  ns.map((n, i) => `${i}:${(n.textContent||'').trim().slice(0,34)}`).filter((s)=>s.split(':')[1]));
console.log(texts.join(' | ').slice(0, 1600));
await p.screenshot({ path: `${SHOT}/card-01-explored.png` });
await b.close();
