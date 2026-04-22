/**
 * Mobile UX audit — screenshots the landing + main pages on iPhone 15 Pro Max
 * and iPhone 15 Pro (smaller screen). Output: /tmp/mobile-audit/*.png
 *
 * Requires the dev server to be running on localhost:3000.
 * Run: npx tsx scripts/mobile-audit.ts
 */

import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.AUDIT_URL ?? "http://localhost:3000";
const OUT = "/tmp/mobile-audit";

const PAGES = [
  { slug: "home", url: "/" },
  { slug: "budget", url: "/budget" },
  { slug: "qui-recoit", url: "/qui-recoit" },
  { slug: "marches-publics", url: "/marches-publics" },
  { slug: "investissements", url: "/investissements" },
  { slug: "analyses", url: "/analyses" },
  { slug: "methode", url: "/methode" },
  { slug: "dette-patrimoine", url: "/dette-patrimoine" },
  { slug: "logement-social", url: "/logement-social" },
];

const TARGETS = [
  { name: "iphone15-pro-max", device: devices["iPhone 15 Pro Max"] },
  { name: "iphone15-pro", device: devices["iPhone 15 Pro"] },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();

  for (const target of TARGETS) {
    const ctx = await browser.newContext({ ...target.device });
    const page = await ctx.newPage();

    for (const { slug, url } of PAGES) {
      const full = `${BASE}${url}`;
      console.log(`[${target.name}] → ${full}`);
      try {
        await page.goto(full, { waitUntil: "networkidle", timeout: 30_000 });
        await page.waitForTimeout(600);

        // Viewport-only screenshots at successive scroll offsets.
        // Way more readable when the downstream reader downsamples large PNGs.
        const totalHeight = await page.evaluate(() => document.body.scrollHeight);
        const vh = await page.evaluate(() => window.innerHeight);
        const step = Math.floor(vh * 0.85); // 15% overlap between shots
        let idx = 0;
        for (let y = 0; y < totalHeight; y += step) {
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), y);
          await page.waitForTimeout(150);
          const file = path.join(OUT, `${target.name}_${slug}_${String(idx).padStart(2, "0")}.png`);
          await page.screenshot({ path: file, fullPage: false });
          idx += 1;
        }
        console.log(`    saved ${idx} frames for ${slug}`);
      } catch (err) {
        console.error(`    ERROR on ${url}:`, (err as Error).message);
      }
    }

    await ctx.close();
  }

  await browser.close();
  console.log(`\nDone. Files in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
