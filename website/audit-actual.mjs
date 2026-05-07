import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
const p = await ctx.newPage();
// Force no cache
await ctx.route('**/*', route => {
  route.continue({ headers: { ...route.request().headers(), 'cache-control': 'no-cache' } });
});
await p.goto('http://localhost:3000/daily-bread?_=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/finance-mockups/FOLD-now.png', clip: { x:0, y:0, width:1440, height:900 } });

// Vérifications spécifiques
const previewMini = await p.locator('.db-p-calc-preview-mini').count();
const previewBig = await p.locator('.db-p-calc-preview-num').count();
const equityCallout = await p.locator('.db-equity-callout').count();
console.log("preview-mini count (should be 1):", previewMini);
console.log("preview-num big (should be 0 or hidden):", previewBig);
console.log("equity-callout count (should be 0):", equityCallout);

await browser.close();
