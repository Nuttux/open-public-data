import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
for (const c of ['paris', 'marseille', 'lyon', 'lille', 'toulouse']) {
  await p.goto(`http://localhost:3000/daily-bread?c=${c}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const localDetail = p.locator('details:has(summary:has-text("Bloc communal"))').first();
  if (await localDetail.count() > 0) {
    await localDetail.locator('summary').click();
    await p.waitForTimeout(300);
    const summary = await localDetail.locator('summary').textContent();
    const meta = (summary||'').includes('DGFiP') ? '✅ DGFiP' : '⚠ moy nat';
    const top = await localDetail.locator('.db-p-zoom-deepdive-stack > div').first().textContent();
    console.log(`${c}: ${meta} | top: ${(top||'').replace(/\s+/g,' ').trim().slice(0,60)}`);
  }
}
await browser.close();
