import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const vp of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'mobile', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/accessibilite', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `audit-a11y/screenshots/accessibilite-${vp.id}-after.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log('done');
