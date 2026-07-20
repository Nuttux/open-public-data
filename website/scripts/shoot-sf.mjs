// Screenshot helper for the SF night build self-review.
// Usage: node scripts/shoot-sf.mjs <block-id> <path1> <path2> ...
// Captures each path at desktop (1440) and mobile (390) into
// ../screenshots/sf-night/block-<id>/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const [, , blockId, ...paths] = process.argv;
if (!blockId || paths.length === 0) {
  console.error("usage: node scripts/shoot-sf.mjs <block-id> <path...>");
  process.exit(1);
}
const outDir = path.resolve(process.cwd(), "..", "screenshots", "sf-night", `block-${blockId}`);
mkdirSync(outDir, { recursive: true });

const viewports = [
  { tag: "desktop", width: 1440, height: 1200 },
  { tag: "mobile", width: 390, height: 844 },
];

const slug = (p) => (p.replace(/^\//, "").replace(/[/?=&]+/g, "_") || "home");

const browser = await chromium.launch();
let ok = 0, fail = 0;
for (const p of paths) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      // force EN like a US visitor
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    await ctx.addCookies([{ name: "dl_locale", value: "en", url: BASE }]);
    const page = await ctx.newPage();
    const url = BASE + p;
    try {
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      // Scroll through the full height to trigger IntersectionObserver
      // reveal-on-scroll / count-up animations, then return to top.
      await page.evaluate(async () => {
        const step = Math.round(window.innerHeight * 0.8);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 180));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 400));
      });
      await page.waitForTimeout(1200); // let reveal/animations settle
      const file = path.join(outDir, `${slug(p)}__${vp.tag}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`✓ ${resp?.status()} ${p} [${vp.tag}] → ${path.basename(file)}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${p} [${vp.tag}]: ${e.message}`);
      fail++;
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${ok} shots, ${fail} failed → ${outDir}`);
process.exit(fail > 0 ? 1 : 0);
