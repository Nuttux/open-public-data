import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// Hero punchline
const heroQ = await p.locator('.db-p-hero-q').first().textContent();
console.log("Hero punchline:", (heroQ||'').trim().replace(/\s+/g, ' '));

// FAB visible
const fab = await p.locator('.db-share-fab').count();
console.log("Share FAB count:", fab);
if (fab > 0) {
  const box = await p.locator('.db-share-fab').first().boundingBox();
  console.log("FAB position:", box);
}

// Live preview taille
const previewBox = await p.locator('.db-p-calc-preview-num').first().boundingBox();
console.log("Live preview height (was 96px):", previewBox?.height);

// Screenshot fold
await p.screenshot({ path: '/tmp/finance-mockups/PROD-after-fixes-fold.png', clip: { x:0, y:0, width:1440, height:900 } });

// Scroll to hero
await p.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/finance-mockups/PROD-after-fixes-hero.png', clip: { x:0, y:0, width:1440, height:900 } });

await browser.close();
