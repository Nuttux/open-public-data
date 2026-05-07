import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
// Test Paris
await p.goto('http://localhost:3000/daily-bread', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(1500);
const macroMicroP = p.locator('.db-macro-to-micro').first();
if (await macroMicroP.count() > 0) {
  await macroMicroP.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const box = await macroMicroP.boundingBox();
  if (box) {
    await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase1-paris.png', clip: { x:0, y:Math.max(0, box.y - 40), width: 1440, height: Math.min(900, box.height + 80) } });
  }
}
// Test autre commune (Marseille)
await p.goto('http://localhost:3000/daily-bread?c=marseille', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(1500);
const macroMicroM = p.locator('.db-macro-to-micro').first();
if (await macroMicroM.count() > 0) {
  await macroMicroM.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const box = await macroMicroM.boundingBox();
  if (box) {
    await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase1-marseille.png', clip: { x:0, y:Math.max(0, box.y - 40), width: 1440, height: Math.min(900, box.height + 80) } });
  }
}
await browser.close();
console.log('done');
