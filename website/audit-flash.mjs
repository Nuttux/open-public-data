import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// Click le toggle "+ J'ai d'autres revenus"
const toggle = p.locator('summary:has-text("J\'ai d\'autres revenus"), summary:has-text("autres revenus")').first();
if (await toggle.count() > 0) {
  await toggle.scrollIntoViewIfNeeded();
  await p.screenshot({ path: '/tmp/finance-mockups/flash-before.png', clip: { x:0, y:0, width:1440, height:900 } });
  await toggle.click();
  await p.waitForTimeout(50); // catch flash
  await p.screenshot({ path: '/tmp/finance-mockups/flash-mid-50ms.png', clip: { x:0, y:0, width:1440, height:900 } });
  await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/finance-mockups/flash-after-300ms.png', clip: { x:0, y:0, width:1440, height:900 } });
}
await browser.close();
