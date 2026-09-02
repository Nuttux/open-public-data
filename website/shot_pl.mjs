import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(6000);
await p.getByRole('button', { name: /Explore the map/i }).click();
await p.waitForTimeout(9000);
await p.screenshot({ path: `${SHOT}/pl-01-map.png` });

// click marks until a card opens
const box = await p.locator('canvas').first().boundingBox();
let opened = false;
outer:
for (const fx of [0.5, 0.42, 0.58, 0.46, 0.54]) {
  for (const fy of [0.5, 0.44, 0.56, 0.48]) {
    await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await p.waitForTimeout(1400);
    if (await p.locator('.fx-mark-card, [class*="mark-card"]').count()) { opened = true; break outer; }
  }
}
console.log('card opened:', opened);
if (opened) {
  const card = p.locator('.fx-mark-card').first();
  await card.screenshot({ path: `${SHOT}/pl-02-card.png` });
  console.log('--- CARD TEXT ---');
  console.log((await card.innerText()).slice(0, 900));
  console.log('--- pl rows:', await p.locator('.fx-mark-card-pl').count(),
              ' says rows:', await p.locator('.fx-mark-card-says').count());
}
await p.screenshot({ path: `${SHOT}/pl-03-full.png` });
await b.close();
