import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = "/tmp/finance-mockups";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }});
const page = await ctx.newPage();
await page.goto(`${BASE}/france/budget`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(700);
const target = await page.$(".fx-grid-tiles");
if (target) {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await target.screenshot({ path: `${OUT}/cleanup-budget-pillars-desktop.png` });
  console.log("OK pillars");
} else {
  console.log("MISS pillars");
}
await browser.close();
