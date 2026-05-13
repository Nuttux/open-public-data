import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_DIR = join(__dirname, '..', 'mockups', 'finance');
const OUT_DIR = '/tmp/finance-mockups';
await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto('file://' + join(MOCK_DIR, 'hero-1-cni-civique.html'), { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(800);
// Hero
await p.screenshot({ path: `${OUT_DIR}/v3-hero.png`, clip: { x: 0, y: 80, width: 1440, height: 700 } });
// Section institutions
await p.evaluate(() => window.scrollTo({ top: 760, behavior: 'instant' }));
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT_DIR}/v3-institutions.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
// Section retain
await p.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT_DIR}/v3-retain.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
await browser.close();
console.log('done');
