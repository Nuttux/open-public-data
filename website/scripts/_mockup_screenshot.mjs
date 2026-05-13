import { chromium } from '@playwright/test';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..', '..');
const file = 'file://' + path.join(root, 'mockups', 'data-coverage-badge.html');
const out = path.join(root, 'mockups');

const browser = await chromium.launch();

const ctxD = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const pD = await ctxD.newPage();
await pD.goto(file, { waitUntil: 'networkidle' });
await pD.waitForTimeout(800);
await pD.screenshot({ path: path.join(out, 'mockup-desktop.png'), fullPage: true });

const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const pM = await ctxM.newPage();
await pM.goto(file, { waitUntil: 'networkidle' });
await pM.waitForTimeout(800);
await pM.screenshot({ path: path.join(out, 'mockup-mobile.png'), fullPage: true });

await browser.close();
console.log('OK');
