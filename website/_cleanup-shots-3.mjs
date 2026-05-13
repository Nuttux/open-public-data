import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/ville/paris/daily-bread?net=2100", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);

// Scroll through to trigger reveal animations
for (let y = 0; y < 8000; y += 600) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);

await page.screenshot({ path: "/tmp/finance-mockups/cleanup-db-fullpage-desktop-v2.png", fullPage: true });
console.log("OK");
await browser.close();
