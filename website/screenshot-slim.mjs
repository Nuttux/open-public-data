import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

// Slim page (a tail commune)
await p.goto('http://localhost:3000/c/clermont-ferrand', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/slim-clermont.png', fullPage: true });

// INSEE direct
await p.goto('http://localhost:3000/c/01001', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/slim-01001.png', fullPage: true });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
await mPage.goto('http://localhost:3000/c/le-havre', { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(800);
await mPage.screenshot({ path: '/tmp/slim-lehavre-mobile.png', fullPage: true });

await browser.close();
console.log('done');
