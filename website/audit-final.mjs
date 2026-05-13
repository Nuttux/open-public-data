// Comprehensive audit script for Daily Bread + Budget Explorer.
// Captures all key screens at three viewports and exercises drawers.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = '/tmp/finance-mockups';
fs.mkdirSync(OUT, { recursive: true });

const URL_DB    = 'http://localhost:3000/ville/paris/daily-bread?net=2100&parts=1&c=paris';
const URL_BUD   = 'http://localhost:3000/france/budget';
const URL_BUDPP = 'http://localhost:3000/france/budget?net=2100&parts=1&c=paris';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet',  width: 1024, height: 768 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const REPORT = [];
const log = (s) => { console.log(s); REPORT.push(s); };

async function shoot(p, name) {
  const file = path.join(OUT, `audit-final-${name}.png`);
  await p.screenshot({ path: file, fullPage: false });
  return file;
}
async function shootFull(p, name) {
  const file = path.join(OUT, `audit-final-${name}.png`);
  await p.screenshot({ path: file, fullPage: true });
  return file;
}

const browser = await chromium.launch({ headless: true });

async function auditPage(url, slug) {
  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => log(`[${slug} ${v.name}] PAGEERROR: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') log(`[${slug} ${v.name}] CONSOLE.error: ${m.text().slice(0,260)}`); });
    p.on('requestfailed', r => {
      const u = r.url();
      if (u.includes('localhost')) log(`[${slug} ${v.name}] REQ FAIL: ${u} (${r.failure()?.errorText})`);
    });
    try {
      const resp = await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      log(`[${slug} ${v.name}] status=${resp?.status()} url=${url}`);
      await p.waitForTimeout(800);
      // scroll-in animations
      await p.evaluate(() => window.scrollTo(0, 200));
      await p.waitForTimeout(400);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(300);
      await shoot(p, `${slug}-${v.name}-fold`);
      await shootFull(p, `${slug}-${v.name}-full`);

      // Sticky header overlap?
      const navOverlap = await p.evaluate(() => {
        const nav = document.querySelector('header,nav');
        const main = document.querySelector('main');
        if (!nav || !main) return null;
        const navH = nav.getBoundingClientRect().height;
        const firstH1 = main.querySelector('h1');
        if (!firstH1) return { navH };
        const rh = firstH1.getBoundingClientRect();
        return { navH, h1Top: rh.top, h1Bottom: rh.bottom };
      });
      log(`[${slug} ${v.name}] nav/h1 = ${JSON.stringify(navOverlap)}`);

      // Overflow detection
      const overflow = await p.evaluate(() => {
        const html = document.documentElement;
        return { scrollW: html.scrollWidth, clientW: html.clientWidth, scrollH: html.scrollHeight, vh: window.innerHeight };
      });
      log(`[${slug} ${v.name}] overflow = ${JSON.stringify(overflow)}`);
      if (overflow.scrollW > overflow.clientW + 1) log(`[${slug} ${v.name}] BUG: horizontal overflow (+${overflow.scrollW - overflow.clientW}px)`);
    } catch (e) {
      log(`[${slug} ${v.name}] ERROR: ${e.message}`);
    } finally {
      await ctx.close();
    }
  }
}

await auditPage(URL_DB,    'db');
await auditPage(URL_BUD,   'bud');
await auditPage(URL_BUDPP, 'budpp');

// ─── Drawer interaction tests on Daily Bread (desktop only) ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => log(`[db-int] PAGEERROR: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') log(`[db-int] CONSOLE.error: ${m.text().slice(0,260)}`); });

  await p.goto(URL_DB, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(800);

  // 2. Inputs interactifs §01 — popovers
  // Try clicking the editable inline net amount.
  log('--- DB §01 inputs ---');
  const editables = await p.locator('button[aria-haspopup], [role="button"][aria-expanded], button:has-text("€/mois"), button:has-text("part")').count();
  log(`[db-int] editable buttons in §01 detected: ${editables}`);

  // BarRow rows count by searching for the BarList rows on §03 / §04 / §05.
  const rows = await p.locator('a, button').filter({ hasText: /CNAM|CNAV|CAF|UNEDIC|AT-MP|Éducation|Défense|Sécurité|Justice|Solidarité|Travail|Écologie|Culture|Dette|Bloc communal|Départements|Régions/i }).count();
  log(`[db-int] BarRow-like clickable items: ${rows}`);

  // Try clicking the first Sécu sub-row → drawer overlay
  try {
    const cnam = p.locator('a, button').filter({ hasText: /CNAM|Maladie|Health/i }).first();
    if (await cnam.count() > 0) {
      await cnam.scrollIntoViewIfNeeded();
      await p.waitForTimeout(200);
      await cnam.click({ timeout: 4000 });
      await p.waitForTimeout(900);
      await shoot(p, 'db-drawer-secu-cnam');
      const drawerOpen = await p.locator('[role="dialog"], [data-drawer-overlay], aside[aria-modal="true"]').count();
      log(`[db-int] after CNAM click drawer count=${drawerOpen}`);
      // Drawer content: lead %, sub-rows
      const leadHasPct = await p.evaluate(() => {
        const d = document.querySelector('[role="dialog"], [data-drawer-overlay], aside[aria-modal="true"]');
        if (!d) return null;
        const lead = d.querySelector('header, .fx-drawer-head, [data-drawer-head], h2');
        return { lead: lead?.textContent?.slice(0,200), html: d.innerHTML.slice(0,1200) };
      });
      log(`[db-int] drawer head/snippet: ${JSON.stringify(leadHasPct)?.slice(0,800)}`);
      // Close drawer
      await p.keyboard.press('Escape').catch(()=>{});
      await p.waitForTimeout(400);
    } else {
      log('[db-int] CNAM not found — Sécu drill BarRow may have different labels');
    }
  } catch (e) { log(`[db-int] CNAM click err: ${e.message}`); }

  // Click an État aggregation
  try {
    const educ = p.locator('a, button').filter({ hasText: /^Éducation|Education$/i }).first();
    if (await educ.count() > 0) {
      await educ.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
      await educ.click({ timeout: 4000 });
      await p.waitForTimeout(900);
      await shoot(p, 'db-drawer-etat-educ');
      await p.keyboard.press('Escape').catch(()=>{});
      await p.waitForTimeout(400);
    }
  } catch (e) { log(`[db-int] Education err: ${e.message}`); }

  // Click Bloc communal
  try {
    const bloc = p.locator('a, button').filter({ hasText: /Bloc communal|Municipal/i }).first();
    if (await bloc.count() > 0) {
      await bloc.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
      await bloc.click({ timeout: 4000 });
      await p.waitForTimeout(900);
      await shoot(p, 'db-drawer-local-bloc');
      await p.keyboard.press('Escape').catch(()=>{});
      await p.waitForTimeout(400);
    }
  } catch (e) { log(`[db-int] Bloc err: ${e.message}`); }

  await ctx.close();
}

// ─── Budget Explorer: same drawer tests ─────────────────────────────────
for (const [url, slug] of [[URL_BUD, 'bud-int'], [URL_BUDPP, 'budpp-int']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => log(`[${slug}] PAGEERROR: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') log(`[${slug}] CONSOLE.error: ${m.text().slice(0,240)}`); });

  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(800);

  // Treemap cells
  try {
    const cells = await p.locator('a, button').filter({ has: p.locator('[data-treemap-cell], [role="treeitem"]') }).count();
    log(`[${slug}] treemap cells (best-guess): ${cells}`);
    const tm = p.locator('a, button').filter({ hasText: /Maladie|Health|Vieillesse|Old age|Famille|Family/i }).first();
    if (await tm.count() > 0) {
      await tm.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
      await tm.click({ timeout: 4000 });
      await p.waitForTimeout(900);
      await shoot(p, `${slug}-drawer-secu-firstcell`);
      await p.keyboard.press('Escape').catch(()=>{});
      await p.waitForTimeout(400);
    }
  } catch (e) { log(`[${slug}] treemap err: ${e.message}`); }

  // Sécu Drawer
  try {
    const cnam = p.locator('a, button').filter({ hasText: /CNAM|Maladie|Health/i }).first();
    if (await cnam.count() > 0) {
      await cnam.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
      await cnam.click({ timeout: 4000 });
      await p.waitForTimeout(900);
      await shoot(p, `${slug}-drawer-cnam`);
      const html = await p.evaluate(() => {
        const d = document.querySelector('[role="dialog"], aside[aria-modal="true"]');
        return d ? d.innerHTML.slice(0, 1500) : null;
      });
      log(`[${slug}] cnam drawer snip: ${html?.slice(0,400)}`);
      await p.keyboard.press('Escape').catch(()=>{});
      await p.waitForTimeout(400);
    }
  } catch (e) { log(`[${slug}] CNAM err: ${e.message}`); }

  await ctx.close();
}

await browser.close();

fs.writeFileSync('/tmp/audit-final-comprehensive.log', REPORT.join('\n'), 'utf8');
console.log('AUDIT DONE — log: /tmp/audit-final-comprehensive.log');
