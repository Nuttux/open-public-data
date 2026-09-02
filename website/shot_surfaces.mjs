import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
// a block panel: deep-link straight to one
await p.goto('http://localhost:3000/us/city/sf/the-city?block=3752', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(11000);
const x = p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1200); }
await p.screenshot({ path: `${SHOT}/surf-panel.png` });
const txt = await p.locator('body').innerText();
const i = txt.search(/What the Board decided here|DECADE BY DECADE|THE RECORD/);
console.log('--- PANEL ---');
console.log(txt.slice(i, i + 900));
await b.close();
