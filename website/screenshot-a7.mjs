import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT_DIR = '/tmp/a7-screenshots';
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Desktop — apu page (now with FranceMacroNav strip on top)
const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dPage = await dCtx.newPage();
console.log('→ desktop /apu (with macro-nav)');
await dPage.goto('http://localhost:3000/apu', { waitUntil: 'networkidle', timeout: 30000 });
await dPage.waitForTimeout(800);
await dPage.screenshot({ path: `${OUT_DIR}/apu-with-macronav.png` });

// Click ScopeDropdown to test
console.log('→ scope dropdown open test');
await dPage.click('.fx-scope-nav');
await dPage.waitForTimeout(400);
await dPage.screenshot({ path: `${OUT_DIR}/scope-dropdown-open.png` });

// Mobile
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mPage = await mCtx.newPage();
console.log('→ mobile /etat (with macro-nav)');
await mPage.goto('http://localhost:3000/etat', { waitUntil: 'networkidle', timeout: 30000 });
await mPage.waitForTimeout(800);
await mPage.screenshot({ path: `${OUT_DIR}/etat-mobile-with-macronav.png` });

await browser.close();
console.log(`Saved to ${OUT_DIR}/`);
