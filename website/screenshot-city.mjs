import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/city-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const slug of ['marseille', 'lyon']) {
  // Desktop
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const dPage = await dCtx.newPage();
  console.log(`→ desktop /c/${slug}`);
  await dPage.goto(`http://localhost:3000/c/${slug}`, { waitUntil: 'networkidle', timeout: 30000 });
  await dPage.waitForTimeout(800);
  await dPage.screenshot({ path: `${OUT_DIR}/${slug}-desktop-top.png` });
  await dPage.screenshot({ path: `${OUT_DIR}/${slug}-desktop-full.png`, fullPage: true });

  // Mobile
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mPage = await mCtx.newPage();
  console.log(`→ mobile /c/${slug}`);
  await mPage.goto(`http://localhost:3000/c/${slug}`, { waitUntil: 'networkidle', timeout: 30000 });
  await mPage.waitForTimeout(800);
  await mPage.screenshot({ path: `${OUT_DIR}/${slug}-mobile-top.png` });
  await mPage.screenshot({ path: `${OUT_DIR}/${slug}-mobile-full.png`, fullPage: true });
}

await browser.close();
console.log(`\nSaved to ${OUT_DIR}/`);
