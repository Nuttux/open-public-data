import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/apu-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const URL = 'http://localhost:3000/apu';

const browser = await chromium.launch({ headless: true });

// Desktop
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await desktop.newPage();
console.log('→ desktop', URL);
await dPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(800);
await dPage.screenshot({ path: `${OUT_DIR}/apu-desktop-top.png` });
await dPage.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/apu-desktop-mid.png` });
await dPage.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/apu-desktop-bottom.png` });
await dPage.screenshot({ path: `${OUT_DIR}/apu-desktop-full.png`, fullPage: true });
console.log('  done desktop');

// Mobile
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mobile.newPage();
console.log('→ mobile', URL);
await mPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(800);
await mPage.screenshot({ path: `${OUT_DIR}/apu-mobile-top.png` });
await mPage.screenshot({ path: `${OUT_DIR}/apu-mobile-full.png`, fullPage: true });
console.log('  done mobile');

await browser.close();
console.log(`\nSaved to ${OUT_DIR}/`);
