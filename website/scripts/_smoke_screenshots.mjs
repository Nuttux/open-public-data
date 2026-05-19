import { chromium } from '@playwright/test';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..', '..');
const out = path.join(root, 'mockups');
const base = 'http://localhost:3137';

const ROUTES = [
  // [label, path, expectedFinalPath?]
  ['root',                  '/'],
  ['france-hub',            '/france'],
  ['france-etat',           '/france/etat'],
  ['france-dette',          '/france/dette'],
  ['france-fiscalite',      '/france/fiscalite'],
  ['paris-budget',          '/ville/paris/budget'],
  ['paris-marches',         '/ville/paris/marches'],
  ['paris-subventions',     '/ville/paris/subventions'],
  ['paris-dette',           '/ville/paris/dette'],
  ['paris-investissements', '/ville/paris/investissements'],
  ['paris-logement',        '/ville/paris/logement'],
  ['paris-daily-bread',     '/ville/paris/daily-bread'],
  ['ville-lyon',            '/ville/lyon'],
  ['ville-aast',            '/ville/aast'],
  // Redirects (verify they 301)
  ['redir-budget',          '/budget'],
  ['redir-apu',             '/apu'],
  ['redir-c-lyon',          '/c/lyon'],
];

const browser = await chromium.launch();
const ctxD = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });

const report = [];
for (const [label, p] of ROUTES) {
  const pD = await ctxD.newPage();
  const pM = await ctxM.newPage();
  try {
    const respD = await pD.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await pD.waitForTimeout(800);
    const finalD = pD.url().replace(base, '');
    const okD = respD?.status() ?? 0;
    await pD.screenshot({ path: path.join(out, `route-${label}-desktop.png`), fullPage: false });

    const _respM = await pM.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await pM.waitForTimeout(600);
    await pM.screenshot({ path: path.join(out, `route-${label}-mobile.png`), fullPage: false });

    report.push({ label, requested: p, final: finalD, status: okD });
    console.log(`✓ ${label.padEnd(25)} ${p.padEnd(35)} → ${finalD.padEnd(35)} ${okD}`);
  } catch (e) {
    report.push({ label, requested: p, error: String(e).slice(0, 100) });
    console.log(`✗ ${label.padEnd(25)} ${p}  ${String(e).slice(0, 80)}`);
  } finally {
    await pD.close();
    await pM.close();
  }
}
await browser.close();
console.log('\nDONE');
console.log(JSON.stringify(report, null, 2));
