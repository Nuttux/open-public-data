import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/fiscalite-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const URL = 'http://localhost:3000/fiscalite';
const browser = await chromium.launch({ headless: true });

// Desktop
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
console.log('→ desktop /fiscalite');
await dPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1500);
await dPage.screenshot({ path: `${OUT_DIR}/fiscalite-desktop-top.png` });
await dPage.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/fiscalite-desktop-breakdown.png` });
await dPage.evaluate(() => window.scrollTo({ top: 1700, behavior: 'instant' }));
await dPage.waitForTimeout(800);
await dPage.screenshot({ path: `${OUT_DIR}/fiscalite-desktop-evolution.png` });
await dPage.evaluate(() => window.scrollTo({ top: 2500, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/fiscalite-desktop-peer.png` });
await dPage.screenshot({ path: `${OUT_DIR}/fiscalite-desktop-full.png`, fullPage: true });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
console.log('→ mobile /fiscalite');
await mPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(1500);
await mPage.screenshot({ path: `${OUT_DIR}/fiscalite-mobile-top.png` });
await mPage.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
await mPage.waitForTimeout(400);
await mPage.screenshot({ path: `${OUT_DIR}/fiscalite-mobile-breakdown.png` });
await mPage.screenshot({ path: `${OUT_DIR}/fiscalite-mobile-full.png`, fullPage: true });

await browser.close();
console.log(`Saved to ${OUT_DIR}/`);
