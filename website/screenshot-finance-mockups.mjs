import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_DIR = join(__dirname, '..', 'mockups', 'finance');
const OUT_DIR = '/tmp/finance-mockups';
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const file of ['hero-1-cni-civique.html', 'hero-2-poster-typo.html']) {
  // Desktop
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const dPage = await dCtx.newPage();
  const url = 'file://' + join(MOCK_DIR, file);
  await dPage.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await dPage.waitForTimeout(800);
  const base = file.replace('.html', '');
  await dPage.screenshot({ path: `${OUT_DIR}/${base}-desktop.png` });
  await dPage.screenshot({ path: `${OUT_DIR}/${base}-desktop-full.png`, fullPage: true });

  // Mobile
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mPage = await mCtx.newPage();
  await mPage.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await mPage.waitForTimeout(800);
  await mPage.screenshot({ path: `${OUT_DIR}/${base}-mobile.png` });
  await mPage.screenshot({ path: `${OUT_DIR}/${base}-mobile-full.png`, fullPage: true });
}

await browser.close();
console.log('Saved to', OUT_DIR);
