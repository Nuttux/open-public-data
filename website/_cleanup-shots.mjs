import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/tmp/finance-mockups";

async function shotPage(browser, viewport, urls) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  // Daily Bread §03/04/05 hero panels (desktop + mobile)
  for (const [name, url, scrollTo] of urls) {
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(800);
      if (scrollTo) {
        await page.evaluate((s) => {
          const el = document.querySelector(s);
          if (el) el.scrollIntoView({ block: "start" });
        }, scrollTo);
        await page.waitForTimeout(900);
      }
      const fullPath = `${OUT}/cleanup-${name}.png`;
      await page.screenshot({ path: fullPath, fullPage: !scrollTo });
      console.log("OK", name, "->", fullPath);
    } catch (e) {
      console.error("FAIL", name, e.message);
    }
  }
  await ctx.close();
}

const browser = await chromium.launch();

// Desktop
await shotPage(
  browser,
  { width: 1440, height: 900 },
  [
    [
      "db-secu-desktop",
      "/ville/paris/daily-bread?net=2100",
      ".db-p-zoom",
    ],
    [
      "db-etat-desktop",
      "/ville/paris/daily-bread?net=2100",
      ".db-p-zoom-l",
    ],
    [
      "db-local-desktop",
      "/ville/paris/daily-bread?net=2100",
      "section:nth-of-type(5) .db-p-zoom",
    ],
    [
      "db-fullpage-desktop",
      "/ville/paris/daily-bread?net=2100",
      null,
    ],
    [
      "budget-desktop-fullpage",
      "/france/budget",
      null,
    ],
    [
      "budget-desktop-pillars",
      "/france/budget#bucket-secu",
      null,
    ],
    [
      "drawer-secu-cnam-desktop",
      "/ville/paris/daily-bread/bucket/secu/cnam_maladie?net=2100",
      null,
    ],
    [
      "drawer-etat-defense-desktop",
      "/ville/paris/daily-bread/bucket/etat/da?net=2100",
      null,
    ],
    [
      "drawer-etat-agg-defense-desktop",
      "/ville/paris/daily-bread/bucket/etat/agg/defense?net=2100",
      null,
    ],
    [
      "drawer-local-services-desktop",
      "/ville/paris/daily-bread/bucket/local/services_generaux?net=2100",
      null,
    ],
    [
      "drawer-budget-cnam-desktop",
      "/france/budget/bucket/secu/cnam_maladie",
      null,
    ],
  ],
);

// Mobile
await shotPage(
  browser,
  { width: 390, height: 844 },
  [
    [
      "db-secu-mobile",
      "/ville/paris/daily-bread?net=2100",
      ".db-p-zoom",
    ],
    [
      "db-fullpage-mobile",
      "/ville/paris/daily-bread?net=2100",
      null,
    ],
    [
      "drawer-secu-cnam-mobile",
      "/ville/paris/daily-bread/bucket/secu/cnam_maladie?net=2100",
      null,
    ],
    [
      "drawer-etat-defense-mobile",
      "/ville/paris/daily-bread/bucket/etat/da?net=2100",
      null,
    ],
    [
      "budget-mobile-fullpage",
      "/france/budget",
      null,
    ],
  ],
);

await browser.close();
console.log("DONE");
