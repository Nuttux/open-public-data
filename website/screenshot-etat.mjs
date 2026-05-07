import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/etat-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const URL = 'http://localhost:3000/etat';
const browser = await chromium.launch({ headless: true });

// Desktop
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
console.log('→ desktop /etat');
await dPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1000);
await dPage.screenshot({ path: `${OUT_DIR}/etat-desktop-top.png` });
await dPage.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/etat-desktop-missions-collapsed.png` });

// Click on the top mission to expand
await dPage.click('details.fx-mission-row >> nth=0');
await dPage.waitForTimeout(500);
await dPage.screenshot({ path: `${OUT_DIR}/etat-desktop-missions-expanded.png` });

await dPage.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/etat-desktop-mid.png` });
await dPage.screenshot({ path: `${OUT_DIR}/etat-desktop-full.png`, fullPage: true });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
console.log('→ mobile /etat');
await mPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(1000);
await mPage.screenshot({ path: `${OUT_DIR}/etat-mobile-top.png` });
await mPage.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
await mPage.waitForTimeout(400);
await mPage.screenshot({ path: `${OUT_DIR}/etat-mobile-missions.png` });
await mPage.tap('details.fx-mission-row >> nth=0');
await mPage.waitForTimeout(500);
await mPage.screenshot({ path: `${OUT_DIR}/etat-mobile-expanded.png` });

await browser.close();
console.log(`Saved to ${OUT_DIR}/`);
