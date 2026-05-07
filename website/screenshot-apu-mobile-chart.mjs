import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/apu', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/apu-screenshots/apu-mobile-chart-1.png' });
await p.evaluate(() => window.scrollTo({ top: 1700, behavior: 'instant' }));
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/apu-screenshots/apu-mobile-chart-2.png' });
await browser.close();
console.log('done');
