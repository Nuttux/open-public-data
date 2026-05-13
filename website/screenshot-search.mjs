import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/c/marseille', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);

// Open the scope dropdown
await p.click('.fx-scope-nav');
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/search-empty.png' });

// Type in the search
await p.fill('.fx-sm-search-input', 'cler');
// Warm-up call: hit the API directly to ensure compiled
await p.evaluate(() => fetch('/api/search-communes?q=cler'));
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/search-cler.png' });

// Type INSEE
await p.fill('.fx-sm-search-input', '');
await p.waitForTimeout(200);
await p.fill('.fx-sm-search-input', 'aix');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/search-aix.png' });

await browser.close();
console.log('done');
