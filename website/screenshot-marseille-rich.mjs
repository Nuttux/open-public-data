import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/marseille-rich';
await mkdir(OUT_DIR, { recursive: true });

const URL = 'http://localhost:3000/c/marseille';
const browser = await chromium.launch({ headless: true });

// Desktop
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
console.log('→ desktop /c/marseille');
await dPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1500);
await dPage.screenshot({ path: `${OUT_DIR}/marseille-top.png` });
await dPage.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/marseille-flow.png` });
await dPage.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
await dPage.waitForTimeout(800);
await dPage.screenshot({ path: `${OUT_DIR}/marseille-evolution.png` });
await dPage.evaluate(() => window.scrollTo({ top: 2300, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/marseille-peers.png` });
await dPage.screenshot({ path: `${OUT_DIR}/marseille-full.png`, fullPage: true });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
console.log('→ mobile /c/marseille');
await mPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(1500);
await mPage.screenshot({ path: `${OUT_DIR}/marseille-mobile-top.png` });
await mPage.screenshot({ path: `${OUT_DIR}/marseille-mobile-full.png`, fullPage: true });

await browser.close();
console.log(`Saved to ${OUT_DIR}/`);
