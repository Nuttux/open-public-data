import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const OUT = "/tmp/mobile-audit-budget";
const TARGETS = [
  { name: "pro-max", device: devices["iPhone 15 Pro Max"] },
  { name: "pro", device: devices["iPhone 15 Pro"] },
];

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ ...t.device });
    const page = await ctx.newPage();
    await page.goto("http://localhost:3000/budget", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1000);
    const h = await page.evaluate(() => document.body.scrollHeight);
    const vh = await page.evaluate(() => window.innerHeight);
    const step = Math.floor(vh * 0.85);
    let i = 0;
    for (let y = 0; y < h; y += step) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), y);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(OUT, `${t.name}_${String(i).padStart(2, "0")}.png`),
        fullPage: false,
      });
      i += 1;
    }
    console.log(`${t.name}: ${i} frames`);
    await ctx.close();
  }
  await browser.close();
}
main().catch(console.error);
