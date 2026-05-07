import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'mockups', 'finance', 'hero-3-scrolly.html');
const OUT = '/tmp/finance-mockups';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto('file://' + FILE, { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);

// Full page
await p.screenshot({ path: `${OUT}/scrolly-full.png`, fullPage: true });

// Per panel
const panels = await p.locator('.panel').all();
for (let i = 0; i < panels.length; i++) {
  await panels[i].scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/scrolly-p${i+1}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
}

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const mPage = await mCtx.newPage();
await mPage.goto('file://' + FILE, { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(800);
await mPage.screenshot({ path: `${OUT}/scrolly-mobile-full.png`, fullPage: true });

await browser.close();
console.log('done — panels:', panels.length);
