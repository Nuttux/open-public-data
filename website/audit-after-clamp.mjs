import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/daily-bread?net=-100&parts=1', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
const hero = await p.locator('.db-p-calc-preview-num').first().textContent();
console.log("Hero (net=-100):", (hero||'').trim().replace(/\s+/g, ' '));
await browser.close();
