import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/dette-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const URL = 'http://localhost:3000/dette';
const browser = await chromium.launch({ headless: true });

// Desktop
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
console.log('→ desktop /dette');
await dPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1500);
await dPage.screenshot({ path: `${OUT_DIR}/dette-desktop-top.png` });
await dPage.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
await dPage.waitForTimeout(800);
await dPage.screenshot({ path: `${OUT_DIR}/dette-desktop-chart.png` });
await dPage.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/dette-desktop-compare.png` });
await dPage.screenshot({ path: `${OUT_DIR}/dette-desktop-full.png`, fullPage: true });

// Toggle test
await dPage.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
await dPage.waitForTimeout(300);
await dPage.click('button:has-text("Mds €")');
await dPage.waitForTimeout(1000);
await dPage.screenshot({ path: `${OUT_DIR}/dette-desktop-billions.png` });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
console.log('→ mobile /dette');
await mPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(1500);
await mPage.screenshot({ path: `${OUT_DIR}/dette-mobile-top.png` });
await mPage.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
await mPage.waitForTimeout(800);
await mPage.screenshot({ path: `${OUT_DIR}/dette-mobile-chart.png` });
await mPage.evaluate(() => window.scrollTo({ top: 2200, behavior: 'instant' }));
await mPage.waitForTimeout(400);
await mPage.screenshot({ path: `${OUT_DIR}/dette-mobile-compare.png` });
await mPage.screenshot({ path: `${OUT_DIR}/dette-mobile-full.png`, fullPage: true });

await browser.close();
console.log(`\nSaved to ${OUT_DIR}/`);
