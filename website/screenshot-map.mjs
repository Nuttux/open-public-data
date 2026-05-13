import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });

const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
await dPage.goto('http://localhost:3000/c/marseille', { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1500);
// Map is at ~3000px scroll
await dPage.evaluate(() => {
  const el = document.querySelector('.fx-france-map');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
});
await dPage.waitForTimeout(500);
await dPage.screenshot({ path: '/tmp/marseille-map.png' });

await dPage.goto('http://localhost:3000/c/lille', { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(1500);
await dPage.evaluate(() => {
  const el = document.querySelector('.fx-france-map');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
});
await dPage.waitForTimeout(500);
await dPage.screenshot({ path: '/tmp/lille-map.png' });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
await mPage.goto('http://localhost:3000/c/marseille', { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(1500);
await mPage.evaluate(() => {
  const el = document.querySelector('.fx-france-map');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
});
await mPage.waitForTimeout(500);
await mPage.screenshot({ path: '/tmp/marseille-map-mobile.png' });

await browser.close();
console.log('done');
