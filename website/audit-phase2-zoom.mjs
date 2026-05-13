import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread?net=3750&parts=2&c=paris', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// Trouve le 1er details collapsed (Retraites)
const retraites = p.locator('details:not([open])').first();
await retraites.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);

// Screenshot avant click
const boxBefore = await retraites.boundingBox();
if (boxBefore) {
  await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase2-collapsed.png', clip: { x: 0, y: Math.max(0, boxBefore.y - 30), width: 1440, height: Math.min(900, boxBefore.height + 60) } });
}

// Click le summary
await retraites.locator('summary').click();
await p.waitForTimeout(800); // attend l'animation
await retraites.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);

const boxAfter = await retraites.boundingBox();
if (boxAfter) {
  await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase2-opened.png', clip: { x: 0, y: Math.max(0, boxAfter.y - 30), width: 1440, height: Math.min(900, boxAfter.height + 60) } });
}

await browser.close();
console.log('done');
