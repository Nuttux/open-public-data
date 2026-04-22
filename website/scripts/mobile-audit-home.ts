/**
 * Quick re-audit — home only, both devices, for validating recent fixes.
 */
import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.AUDIT_URL ?? "http://localhost:3000";
const OUT = "/tmp/mobile-audit-home";

const TARGETS = [
  { name: "iphone15-pro-max", device: devices["iPhone 15 Pro Max"] },
  { name: "iphone15-pro", device: devices["iPhone 15 Pro"] },
];

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();

  for (const target of TARGETS) {
    const ctx = await browser.newContext({ ...target.device });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(800);

    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    const vh = await page.evaluate(() => window.innerHeight);
    const step = Math.floor(vh * 0.85);
    let idx = 0;
    for (let y = 0; y < totalHeight; y += step) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), y);
      await page.waitForTimeout(300);
      const file = path.join(OUT, `${target.name}_${String(idx).padStart(2, "0")}.png`);
      await page.screenshot({ path: file, fullPage: false });
      idx += 1;
    }
    console.log(`[${target.name}] saved ${idx} frames`);

    await ctx.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
