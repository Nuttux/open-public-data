import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 5000 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread?net=3750&parts=2&c=paris', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// Récup tous les montants de bar-chart sub-rows
const bars = await p.locator('.db-p-zoom-bar-val, .db-p-zoom-bar [class*="val"]').allTextContents();
console.log("Sub-row vals (raw):");
bars.forEach((v, i) => console.log(`  ${i}: ${v.replace(/\s+/g, ' ').trim()}`));

// Récup hero
const hero = await p.locator('.db-p-calc-preview-num').first().textContent();
console.log(`\nHero: ${hero?.trim()}`);

await browser.close();
