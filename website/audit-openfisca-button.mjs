import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread?net=3750&parts=2&c=paris', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);

const btn = await p.locator('.db-openfisca-btn').count();
console.log(`OpenFisca button found: ${btn}`);

// Visible at fold ?
if (btn > 0) {
  const el = p.locator('.db-openfisca-btn').first();
  const box = await el.boundingBox();
  console.log(`Button box: y=${box?.y}, h=${box?.h}`);
  console.log(`In fold (y < 900): ${box?.y < 900}`);
  
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const newBox = await el.boundingBox();
  await p.screenshot({ path: '/tmp/finance-mockups/PROD-openfisca-button.png', clip: { x: 0, y: Math.max(0, newBox.y - 60), width: 1440, height: Math.min(900, newBox.height + 200) } });
}

await browser.close();
