import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/c/strasbourg', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/strasbourg-marches.png', fullPage: true });
await browser.close();
console.log('done');
