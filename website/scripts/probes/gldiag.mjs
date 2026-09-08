import { chromium } from 'playwright';
import { ARGS } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3000';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
const failed = []; p.on('requestfailed', (r) => failed.push(r.url().slice(0, 140) + ' ' + (r.failure()?.errorText ?? '')));
const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 120000 });
for (const wait of [3000, 7000, 15000]) {
  await p.waitForTimeout(wait);
  const s = await p.evaluate(() => ({ gpu: !!navigator.gpu, canvas: document.querySelectorAll('canvas').length, engine: !!window.__cityGL, tiles: !!document.querySelector('.fx-city-tiles'), skeleton: !!document.querySelector('.fx-city-skeleton, [class*=skeleton]'), stageText: (document.querySelector('.fx-city-stage, .fx-city-shell, main')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 240), data: performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length }));
  console.log((Date.now() - t0) + 'ms', JSON.stringify(s));
}
await p.screenshot({ path: process.env.SCR + '/gldiag-' + (BASE.includes('qipu') ? 'prod' : 'local') + '.png' });
console.log('failed requests:', failed.length ? failed.slice(0, 8).join('\n') : 'none');
console.log('errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
await b.close();
