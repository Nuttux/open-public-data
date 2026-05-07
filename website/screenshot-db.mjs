import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });

// Desktop
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
await dPage.goto('http://localhost:3000/daily-bread?net=45000&parts=2&c=marseille', { waitUntil: 'networkidle', timeout: 30000 });
// Warm APIs
await dPage.evaluate(() => fetch('/api/commune/marseille'));
await dPage.evaluate(() => fetch('/api/search-communes?q=mar'));
await dPage.waitForTimeout(2000);
await dPage.screenshot({ path: '/tmp/db-top.png' });
await dPage.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: '/tmp/db-cofog.png' });
await dPage.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }));
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: '/tmp/db-local.png' });
await dPage.screenshot({ path: '/tmp/db-full.png', fullPage: true });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
await mPage.goto('http://localhost:3000/daily-bread?net=30000&parts=1&c=lille', { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(2000);
await mPage.screenshot({ path: '/tmp/db-mobile-full.png', fullPage: true });

await browser.close();
console.log('done');
