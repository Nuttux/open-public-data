import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'mockups', 'finance', 'hero-3-scrolly.html');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto('file://' + FILE, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
// Pour chaque deep-dive : scroll au sub-block et screenshot
const deepdives = await p.locator('.p-zoom-deepdive').all();
for (let i = 0; i < deepdives.length; i++) {
  await deepdives[i].scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  const box = await deepdives[i].boundingBox();
  if (box) {
    await p.screenshot({
      path: `/tmp/finance-mockups/scrolly-deepdive-${i+1}.png`,
      clip: { x:0, y:Math.max(0, box.y - 40), width: 1440, height: Math.min(900, box.height + 80) }
    });
  }
}
await browser.close();
console.log('done — deepdives:', deepdives.length);
