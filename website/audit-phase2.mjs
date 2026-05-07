import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

await p.goto('http://localhost:3000/daily-bread?net=3750&parts=2&c=paris', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// 1) Compte les <details>, distingue ouverts/collapsed
const details = await p.locator('details').all();
console.log(`\n=== ${details.length} <details> trouvés ===`);
let openCount = 0, closedCount = 0;
for (const d of details) {
  const isOpen = await d.evaluate(el => el.hasAttribute('open'));
  const summary = await d.locator('summary').textContent().catch(() => '?');
  console.log(`  ${isOpen ? '[OPEN]  ' : '[closed]'}  ${(summary||'').replace(/\s+/g, ' ').trim().slice(0, 80)}`);
  if (isOpen) openCount++; else closedCount++;
}
console.log(`Total: ${openCount} ouverts, ${closedCount} fermés`);

// 2) Screenshot full page (default)
await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase2-default.png', fullPage: true });

// 3) Click sur un closed → screenshot
const firstClosed = p.locator('details:not([open])').first();
if (await firstClosed.count() > 0) {
  await firstClosed.locator('summary').click();
  await p.waitForTimeout(500);
  await firstClosed.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const box = await firstClosed.boundingBox();
  if (box) {
    await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase2-clicked-open.png', clip: { x:0, y:Math.max(0,box.y - 30), width: 1440, height: Math.min(900, box.height+60) } });
  }
}

await browser.close();
