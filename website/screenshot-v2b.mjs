import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/v2b';
await mkdir(OUT_DIR, { recursive: true });

const URL = 'http://localhost:3000/c/marseille';
const browser = await chromium.launch({ headless: true });

const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
await dPage.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1500);

// Cap désend (around 1900px)
await dPage.evaluate(() => window.scrollTo({ top: 1900, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/cap-desend.png` });

// Marchés section (around 3500px)
await dPage.evaluate(() => window.scrollTo({ top: 3300, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/marches-stats.png` });

await dPage.evaluate(() => window.scrollTo({ top: 3700, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/marches-top.png` });

await browser.close();
console.log('done');
