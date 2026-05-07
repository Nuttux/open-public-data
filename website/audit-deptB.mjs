import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
for (const c of ['paris', 'marseille', 'lyon', 'lille']) {
  await p.goto(`http://localhost:3000/daily-bread?c=${c}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  // Open the Département details
  const dept = p.locator('details:has(summary:has-text("Département"))').first();
  if (await dept.count() > 0) {
    await dept.locator('summary').click();
    await p.waitForTimeout(300);
    const summary = await dept.locator('summary').textContent();
    const firstBar = await dept.locator('.db-p-zoom-deepdive-stack > div').first().textContent();
    console.log(`${c}: ${summary?.replace(/\s+/g,' ').trim().slice(0,80)} | top: ${firstBar?.replace(/\s+/g,' ').trim().slice(0,60)}`);
  }
}
await browser.close();
