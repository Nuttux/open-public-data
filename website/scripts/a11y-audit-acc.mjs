#!/usr/bin/env node
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();

for (const vp of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'mobile', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/accessibilite`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  console.log(`\n=== /accessibilite @ ${vp.id} ===`);
  console.log(`total=${results.violations.length}`);
  for (const v of results.violations) {
    console.log(`  [${v.impact}] ${v.id} (${v.nodes.length}): ${v.help}`);
    for (const n of v.nodes.slice(0, 2)) console.log(`     ${JSON.stringify(n.target)}`);
  }
  await ctx.close();
}
await browser.close();
