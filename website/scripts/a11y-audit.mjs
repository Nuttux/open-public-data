#!/usr/bin/env node
// A11y audit — axe-core via Playwright on 4 target pages.
// Run: node scripts/a11y-audit.mjs   (dev server must be running on :3000)

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = resolve('audit-a11y');
mkdirSync(OUT, { recursive: true });
mkdirSync(resolve(OUT, 'screenshots'), { recursive: true });

const PAGES = [
  { id: 'landing', path: '/' },
  { id: 'qui-recoit', path: '/qui-recoit' },
  { id: 'marches-publics', path: '/marches-publics' },
  { id: 'methode', path: '/methode' },
];

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
];

const SEVERITY_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

(async () => {
  const browser = await chromium.launch();
  const allResults = [];

  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const p = await ctx.newPage();
      const url = `${BASE}${page.path}`;
      console.log(`\n=== ${page.id} @ ${vp.id} → ${url}`);
      try {
        await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      } catch (e) {
        console.log(`  navigation slow, falling back to domcontentloaded: ${e.message}`);
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
      await p.waitForTimeout(2500); // let charts/maps render
      const screenshotPath = resolve(OUT, 'screenshots', `${page.id}-${vp.id}-before.png`);
      await p.screenshot({ path: screenshotPath, fullPage: true });

      const results = await new AxeBuilder({ page: p })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();

      const compact = {
        page: page.id,
        viewport: vp.id,
        url,
        screenshot: screenshotPath,
        counts: {
          total: results.violations.length,
          critical: results.violations.filter(v => v.impact === 'critical').length,
          serious: results.violations.filter(v => v.impact === 'serious').length,
          moderate: results.violations.filter(v => v.impact === 'moderate').length,
          minor: results.violations.filter(v => v.impact === 'minor').length,
        },
        violations: results.violations
          .sort((a, b) => (SEVERITY_ORDER[a.impact] ?? 9) - (SEVERITY_ORDER[b.impact] ?? 9))
          .map(v => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            description: v.description,
            tags: v.tags,
            nodeCount: v.nodes.length,
            sampleNodes: v.nodes.slice(0, 3).map(n => ({
              target: n.target,
              html: n.html.slice(0, 240),
              failureSummary: n.failureSummary?.slice(0, 400),
            })),
          })),
      };
      allResults.push(compact);
      console.log(`  total=${compact.counts.total} crit=${compact.counts.critical} serious=${compact.counts.serious} mod=${compact.counts.moderate} minor=${compact.counts.minor}`);
      await ctx.close();
    }
  }

  await browser.close();
  writeFileSync(resolve(OUT, 'axe-results.json'), JSON.stringify(allResults, null, 2));

  // Aggregate by rule across all pages/viewports
  const ruleAgg = {};
  for (const r of allResults) {
    for (const v of r.violations) {
      if (!ruleAgg[v.id]) ruleAgg[v.id] = { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, totalNodes: 0, pages: new Set() };
      ruleAgg[v.id].totalNodes += v.nodeCount;
      ruleAgg[v.id].pages.add(`${r.page}/${r.viewport}`);
    }
  }
  const ruleList = Object.values(ruleAgg)
    .map(r => ({ ...r, pages: [...r.pages] }))
    .sort((a, b) => (SEVERITY_ORDER[a.impact] ?? 9) - (SEVERITY_ORDER[b.impact] ?? 9) || b.totalNodes - a.totalNodes);
  writeFileSync(resolve(OUT, 'axe-by-rule.json'), JSON.stringify(ruleList, null, 2));

  console.log('\n=== Aggregate by rule (top ROI fixes first) ===');
  for (const r of ruleList) {
    console.log(`[${r.impact ?? 'n/a'}] ${r.id} — ${r.totalNodes} occurrences across ${r.pages.length} page/vp combos — ${r.help}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
