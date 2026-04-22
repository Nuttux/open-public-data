#!/usr/bin/env node
/**
 * Audit visuel automatisé de la page bilan — desktop + mobile.
 * Usage : node scripts/audit-bilan.mjs
 * Pré-requis : dev server sur :3000
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "scripts", "audit-screenshots");
await mkdir(OUT, { recursive: true });

const VIEWS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  },
];

const PAGES = [
  { slug: "home", url: "/" },
  { slug: "bilan", url: "/dette-patrimoine" },
  { slug: "stress-baseline", url: "/dette-patrimoine/stress-test" },
  {
    slug: "stress-covid",
    url: "/dette-patrimoine/stress-test?t=2.4&r=-5&i=1",
  },
  {
    slug: "stress-ecroulement",
    url: "/dette-patrimoine/stress-test?t=6.4&r=-15&i=1.3",
  },
  { slug: "bailleur-rivp", url: "/dette-patrimoine/bailleur/rivp" },
  {
    slug: "bailleur-paris-habitat",
    url: "/dette-patrimoine/bailleur/paris-habitat",
  },
];

const INTERACTIONS = [
  // sur la page bilan, clique la tuile 19e de la carte hors-bilan
  {
    slug: "bilan-drawer-arr-19",
    url: "/dette-patrimoine#sec-hors-bilan",
    action: async (page) => {
      // Attend la carte choropleth et trouve la tile du 19e
      await page.waitForSelector(".fx-choropleth", { timeout: 15000 });
      await page.evaluate(() => {
        document.getElementById("sec-hors-bilan")?.scrollIntoView({ behavior: "instant", block: "start" });
      });
      await page.waitForTimeout(400);
      // Le 19e est facile à cibler via le title du path
      const paths = await page.$$("svg path");
      for (const p of paths) {
        const title = await p.evaluate((el) => el.querySelector("title")?.textContent ?? "");
        if (/19.*arrondissement/.test(title)) {
          await p.click();
          break;
        }
      }
      await page.waitForTimeout(600);
    },
  },
  // stress-test : click preset "triple"
  {
    slug: "stress-triple-preset",
    url: "/dette-patrimoine/stress-test",
    action: async (page) => {
      await page.waitForSelector(".fx-stress-preset", { timeout: 15000 });
      const buttons = await page.$$(".fx-stress-preset");
      // 4e preset = triple choc (index 3 après covid/taux/jo)
      if (buttons[3]) await buttons[3].click();
      await page.waitForTimeout(600);
    },
  },
];

const browser = await chromium.launch();

for (const view of VIEWS) {
  const ctx = await browser.newContext({
    viewport: view.viewport,
    userAgent: view.userAgent,
    isMobile: view.isMobile,
    hasTouch: view.isMobile,
    deviceScaleFactor: view.isMobile ? 2 : 1,
  });

  for (const p of PAGES) {
    const page = await ctx.newPage();
    page.on("pageerror", (err) => console.error(`[${view.name} ${p.slug}] JS error:`, err.message));
    page.on("response", (resp) => {
      if (resp.status() >= 400 && !resp.url().includes("favicon")) {
        console.warn(`[${view.name} ${p.slug}] ${resp.status()} ${resp.url()}`);
      }
    });
    try {
      await page.goto("http://localhost:3000" + p.url, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page.waitForTimeout(500);
      const file = path.join(OUT, `${view.name}-${p.slug}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`✓ ${view.name} · ${p.slug}`);
    } catch (e) {
      console.error(`✗ ${view.name} · ${p.slug} — ${e.message}`);
    }
    await page.close();
  }

  for (const it of INTERACTIONS) {
    const page = await ctx.newPage();
    try {
      await page.goto("http://localhost:3000" + it.url, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page.waitForTimeout(500);
      await it.action(page);
      const file = path.join(OUT, `${view.name}-${it.slug}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`✓ ${view.name} · ${it.slug} (interaction)`);
    } catch (e) {
      console.error(`✗ ${view.name} · ${it.slug} — ${e.message}`);
    }
    await page.close();
  }

  await ctx.close();
}

await browser.close();
console.log("\nScreenshots dans", OUT);
