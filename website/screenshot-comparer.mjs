import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });

// Desktop with default selection
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
await dPage.goto('http://localhost:3000/comparer', { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(800);
await dPage.screenshot({ path: '/tmp/comparer-default.png', fullPage: true });

// Desktop with 5 cities selected via URL
const d2 = await dCtx.newPage();
await d2.goto('http://localhost:3000/comparer?cities=marseille,lyon,bordeaux,lille,nice', { waitUntil: 'networkidle', timeout: 30000 });
await d2.waitForTimeout(800);
await d2.screenshot({ path: '/tmp/comparer-5cities.png', fullPage: true });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
await mPage.goto('http://localhost:3000/comparer?cities=marseille,lyon,paris', { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(800);
await mPage.screenshot({ path: '/tmp/comparer-mobile.png', fullPage: true });

await browser.close();
console.log('done');
