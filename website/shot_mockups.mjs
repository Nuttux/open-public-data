import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(11000);
const x = p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1200); }

// A. the year panel (right-hand list)
const panel = p.locator('.fx-city-record-cap').first();
if (await panel.count()) {
  const el = (await panel.evaluateHandle(n => n.closest('aside,section,div'))).asElement();
  if (el) { await el.screenshot({ path: `${SHOT}/mock-A-yearpanel.png` }); console.log('A year panel ok'); }
}

// B. the dot card — click around the map until one opens
const box = await p.locator('canvas').first().boundingBox();
let opened = false;
outer:
for (const fx of [0.5,0.44,0.56,0.48,0.52,0.4,0.6]) {
  for (const fy of [0.5,0.45,0.55,0.42,0.58]) {
    await p.mouse.click(box.x + box.width*fx, box.y + box.height*fy);
    await p.waitForTimeout(1300);
    if (await p.locator('.fx-mark-card').count()) { opened = true; break outer; }
  }
}
console.log('B dot card opened:', opened);
if (opened) await p.locator('.fx-mark-card').first().screenshot({ path: `${SHOT}/mock-B-dotcard.png` });
await b.close();
