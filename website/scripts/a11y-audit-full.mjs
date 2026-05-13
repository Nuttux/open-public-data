#!/usr/bin/env node
// Full-site a11y audit — axe-core via Playwright on every public route.
// Run: node scripts/a11y-audit-full.mjs   (dev server must be running)
// Env: BASE_URL (default http://localhost:3000)

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = resolve('audit-a11y');
mkdirSync(OUT, { recursive: true });

// Static routes — known stable, no dynamic params.
const STATIC_ROUTES = [
  '/',
  '/accessibilite',
  '/analyses',
  '/comparer',
  '/confidentialite',
  '/contact',
  '/france',
  '/france/dette',
  '/france/etat',
  '/france/fiscalite',
  '/licence',
  '/mentions-legales',
  '/methode',
  '/ville/paris/budget',
  '/ville/paris/daily-bread',
  '/ville/paris/dette',
  '/ville/paris/dette/stress-test',
  '/ville/paris/investissements',
  '/ville/paris/logement',
  '/ville/paris/marches',
  '/ville/paris/subventions',
  '/ville/marseille/budget',
];

// Dynamic routes — sample one realistic value per route shape.
// Slugs can fail at runtime (404 / data missing) — the script logs and continues.
const DYNAMIC_SAMPLES = [
  '/ville/paris/investissements/arrondissement/1',
  '/ville/paris/logement/arrondissement/1',
  // Other dynamic routes (subventions/association/[slug], marches/contrat/[numero],
  // analyses/[slug], etc.) need specific slugs harvested from data — skipping for
  // this pass; they share the same client component so a11y issues are inherited
  // from the parent listing pages already in STATIC_ROUTES.
];

const ROUTES = [...STATIC_ROUTES, ...DYNAMIC_SAMPLES];

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
];

const SEVERITY_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

(async () => {
  const browser = await chromium.launch();
  const allResults = [];
  const failures = [];
  let i = 0;
  for (const route of ROUTES) {
    i++;
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const p = await ctx.newPage();
      const url = `${BASE}${route}`;
      const tag = `[${i}/${ROUTES.length}] ${route} @ ${vp.id}`;
      try {
        const resp = await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        if (resp && resp.status() >= 400) {
          failures.push({ route, viewport: vp.id, status: resp.status(), reason: 'http_error' });
          console.log(`${tag}  HTTP ${resp.status()} — skipped`);
          await ctx.close();
          continue;
        }
      } catch (_e) {
        try {
          await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e2) {
          failures.push({ route, viewport: vp.id, status: 0, reason: e2.message.slice(0, 120) });
          console.log(`${tag}  navigation error — skipped`);
          await ctx.close();
          continue;
        }
      }
      await p.waitForTimeout(2500);
      let results;
      try {
        results = await new AxeBuilder({ page: p })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
          .analyze();
      } catch (_e) {
        failures.push({ route, viewport: vp.id, status: 0, reason: 'axe_failed: ' + e.message.slice(0, 120) });
        console.log(`${tag}  axe failed — skipped`);
        await ctx.close();
        continue;
      }
      const compact = {
        route,
        viewport: vp.id,
        url,
        counts: {
          total: results.violations.length,
          critical: results.violations.filter(v => v.impact === 'critical').length,
          serious: results.violations.filter(v => v.impact === 'serious').length,
          moderate: results.violations.filter(v => v.impact === 'moderate').length,
          minor: results.violations.filter(v => v.impact === 'minor').length,
          totalNodes: results.violations.reduce((s, v) => s + v.nodes.length, 0),
        },
        violations: results.violations
          .sort((a, b) => (SEVERITY_ORDER[a.impact] ?? 9) - (SEVERITY_ORDER[b.impact] ?? 9))
          .map(v => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodeCount: v.nodes.length,
            sampleTargets: v.nodes.slice(0, 2).map(n => n.target[0] || '<unknown>'),
            sampleFg: v.nodes[0] ? (v.nodes[0].failureSummary || '').match(/foreground color: (#[0-9a-f]+)/i)?.[1] : null,
            sampleBg: v.nodes[0] ? (v.nodes[0].failureSummary || '').match(/background color: (#[0-9a-f]+)/i)?.[1] : null,
          })),
      };
      allResults.push(compact);
      const counts = compact.counts;
      console.log(`${tag}  total=${counts.total} (crit=${counts.critical} serious=${counts.serious} mod=${counts.moderate}) nodes=${counts.totalNodes}`);
      await ctx.close();
    }
  }
  await browser.close();

  writeFileSync(resolve(OUT, 'axe-full-results.json'), JSON.stringify({ results: allResults, failures }, null, 2));

  // Aggregate by rule
  const ruleAgg = {};
  for (const r of allResults) {
    for (const v of r.violations) {
      if (!ruleAgg[v.id]) ruleAgg[v.id] = { id: v.id, impact: v.impact, totalNodes: 0, routes: new Set() };
      ruleAgg[v.id].totalNodes += v.nodeCount;
      ruleAgg[v.id].routes.add(r.route);
    }
  }
  const ruleList = Object.values(ruleAgg)
    .map(r => ({ ...r, routes: [...r.routes] }))
    .sort((a, b) => (SEVERITY_ORDER[a.impact] ?? 9) - (SEVERITY_ORDER[b.impact] ?? 9) || b.totalNodes - a.totalNodes);

  console.log('\n=== Aggregate by rule ===');
  for (const r of ruleList) {
    console.log(`[${r.impact ?? 'n/a'}] ${r.id} — ${r.totalNodes} nodes across ${r.routes.length} routes`);
  }

  console.log('\n=== Worst routes ===');
  const sorted = [...allResults].sort((a, b) => b.counts.totalNodes - a.counts.totalNodes);
  for (const r of sorted.slice(0, 10)) {
    if (r.counts.total === 0) break;
    console.log(`  ${r.route} @ ${r.viewport}: ${r.counts.totalNodes} nodes (crit=${r.counts.critical} serious=${r.counts.serious})`);
  }

  if (failures.length) {
    console.log('\n=== Failures (skipped) ===');
    for (const f of failures) console.log(`  ${f.route} @ ${f.viewport}: ${f.reason}`);
  }
  console.log(`\nResults: ${allResults.length} audits run, ${failures.length} skipped. Full JSON: audit-a11y/axe-full-results.json`);
})().catch(e => { console.error(e); process.exit(1); });
