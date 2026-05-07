#!/usr/bin/env node
// Lighthouse a11y-only audit on 4 target pages.
// Run: node scripts/a11y-lighthouse.mjs   (dev server must be running on :3000)

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = resolve('audit-a11y');
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { id: 'landing', path: '/' },
  { id: 'qui-recoit', path: '/qui-recoit' },
  { id: 'marches-publics', path: '/marches-publics' },
  { id: 'methode', path: '/methode' },
];

const LH_CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['accessibility'],
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: 'provided',
  },
};

const tag = process.argv[2] || 'before';

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  const summary = [];
  for (const p of PAGES) {
    const url = `${BASE}${p.path}`;
    console.log(`\n=== Lighthouse ${p.id} → ${url}`);
    const runnerResult = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error' }, LH_CONFIG);
    const lhr = runnerResult.lhr;
    const score = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
    const failedAudits = Object.values(lhr.audits)
      .filter(a => a.score !== null && a.score < 1 && lhr.categories.accessibility.auditRefs.find(r => r.id === a.id))
      .map(a => ({ id: a.id, score: a.score, title: a.title, displayValue: a.displayValue }));
    console.log(`  score=${score}/100, failed audits: ${failedAudits.length}`);
    for (const fa of failedAudits) console.log(`    - ${fa.id}: ${fa.title}`);
    summary.push({ page: p.id, url, score, failedAudits });
    writeFileSync(resolve(OUT, `lh-${p.id}-${tag}.json`), JSON.stringify(lhr, null, 2));
  }
  await chrome.kill();
  writeFileSync(resolve(OUT, `lh-summary-${tag}.json`), JSON.stringify(summary, null, 2));
  console.log('\n=== Summary ===');
  for (const s of summary) console.log(`${s.page}: ${s.score}/100 (${s.failedAudits.length} failed audits)`);
})().catch(e => { console.error(e); process.exit(1); });
