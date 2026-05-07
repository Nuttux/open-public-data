import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

// Search modal triggered from navbar
await p.goto('http://localhost:3000/c/marseille', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/search-v2-navbar.png' });

await p.click('.fx-search-btn');
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/search-v2-modal-empty.png' });

await p.fill('.fx-search-input', 'vesoul');
await p.evaluate(() => fetch('/api/search-communes?q=vesoul'));
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/search-v2-modal-results.png' });

await p.keyboard.press('Escape');
await p.waitForTimeout(300);

// Comparateur with search
await p.goto('http://localhost:3000/comparer', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/comparer-v2-default.png' });

await p.fill('.fx-compare-search-input', 'aix');
await p.evaluate(() => fetch('/api/search-communes?q=aix'));
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/comparer-v2-search-aix.png' });

await browser.close();
console.log('done');
