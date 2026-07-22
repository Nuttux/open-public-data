import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';

const BASE = 'https://qipu.org';
const OUT_DIR = './instagram-stories';

// Instagram story dimensions (9:16)
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

async function screenshot(url, filename, { scrollY = 0, hideNav = false, waitMs = 3000 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: STORY_WIDTH, height: STORY_HEIGHT, deviceScaleFactor: 2 });

  console.log(`📸 Capturing ${filename} from ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for charts/animations to render
  await new Promise(r => setTimeout(r, waitMs));

  // Optionally hide top navbar for cleaner framing
  if (hideNav) {
    await page.evaluate(() => {
      const nav = document.querySelector('nav') || document.querySelector('header');
      if (nav) nav.style.display = 'none';
    });
  }

  if (scrollY) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
    await new Promise(r => setTimeout(r, 1000));
  }

  await page.screenshot({ path: `${OUT_DIR}/${filename}`, type: 'png' });
  console.log(`✅ Saved ${filename}`);
  await page.close();
}

// ── STORY 1: Hero accueil — "LES FINANCES DE LA VILLE DE PARIS" + donut + per-capita cards
// The hero section with title + donut + KPI cards fits perfectly without scroll
await screenshot(BASE, 'story1-hero-per-capita.png');

// ── STORY 2: Budget Sankey — the money flow diagram
// Scroll just past the KPI cards to show the Sankey filling the screen
await screenshot(`${BASE}/budget`, 'story2-sankey-budget.png', { scrollY: 350, hideNav: true, waitMs: 5000 });

// ── STORY 3: Subventions treemap — who gets the money
// Scroll past KPIs to show the treemap prominently
await screenshot(`${BASE}/subventions`, 'story3-subventions-treemap.png', { scrollY: 120, hideNav: true, waitMs: 4000 });

// ── BONUS: Investissements treemap (more impactful than carte which needs map tiles)
await screenshot(`${BASE}/investissements`, 'bonus-investissements.png', { scrollY: 120, hideNav: true, waitMs: 4000 });

// ── BONUS: Explorer section on homepage (the 6 question cards)
await screenshot(BASE, 'bonus-explorer-cards.png', { scrollY: 1350, hideNav: true });

await browser.close();
console.log(`\n🎉 All screenshots saved to ${OUT_DIR}/`);
