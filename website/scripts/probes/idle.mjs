/* An undriven page: does the release still happen? */
import { chromium } from 'playwright';
import { ARGS, init } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3000'; const Q = process.argv[3] ?? '';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.addInitScript(init);
await p.goto(`${BASE}/us/city/sf/the-city${Q}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = performance.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
for (const wait of [2000, 5000, 10000]) { await p.waitForTimeout(wait); console.log(await p.evaluate(() => { const e = window.__cityGL; return JSON.stringify({ frames: e.getStats().frames, releasedMB: Math.round((e.releasedCpuBytes ?? 0) / 1048576), heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }); })); }
await b.close();
