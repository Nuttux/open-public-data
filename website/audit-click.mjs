import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread?net=3750&parts=2&c=paris', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);

// Avant click - count
const before = await p.locator('details[open]').count();
console.log(`Avant click: ${before} ouverts`);

// Click sur le 1er collapsed (Retraites)
const summary = p.locator('details:not([open]) summary').first();
await summary.click();
await p.waitForTimeout(500);

const after = await p.locator('details[open]').count();
console.log(`Après click: ${after} ouverts`);

// Re-click pour fermer
await p.locator('details[open] summary').nth(after - 1).click(); // ferme le dernier qu'on a ouvert
await p.waitForTimeout(500);
const closed = await p.locator('details[open]').count();
console.log(`Après re-click pour fermer: ${closed} ouverts`);

await browser.close();
