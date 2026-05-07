import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
// Locataire (default)
await p.goto('http://localhost:3000/daily-bread', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/finance-mockups/PROD-locataire.png', clip: { x:0, y:0, width:1440, height:1100 } });
// Propriétaire
await p.goto('http://localhost:3000/daily-bread?owner=1', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/finance-mockups/PROD-proprietaire-paris.png', clip: { x:0, y:0, width:1440, height:1100 } });
// Propriétaire à Marseille
await p.goto('http://localhost:3000/daily-bread?owner=1&c=marseille', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/finance-mockups/PROD-proprietaire-marseille.png', clip: { x:0, y:0, width:1440, height:1100 } });
await browser.close();
console.log('done');
