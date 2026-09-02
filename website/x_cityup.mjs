/* Time to the things a reader actually waits for, on a shaped connection.
   usage: node x_cityup.mjs [base] [Mbps] [label] */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { OUT, ARGS, init } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3100';
const MBPS = Number(process.argv[3] ?? 50);
const LABEL = process.argv[4] || 'shaped';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160)));
await p.addInitScript(init);
await p.addInitScript(() => {
  window.__m = {}; window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch {}
  const mark = (k) => { if (!(k in window.__m)) window.__m[k] = Math.round(performance.now()); };
  const poll = () => {
    if (document.querySelector('canvas')) mark('canvas');
    const rs = performance.getEntriesByType('resource');
    if (rs.some((r) => /\/bldg\//.test(r.name))) mark('firstFootprintFile');
    const b = rs.filter((r) => /\/bldg\//.test(r.name)); if (b.length >= 138) mark('allFootprintFiles');
    if (rs.some((r) => /film\/scans\/.*\.jpg/.test(r.name))) mark('filmScans');
    setTimeout(poll, 40);
  };
  poll();
});
const cdp = await p.context().newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: (MBPS * 1e6) / 8 });
const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => window.__m.allFootprintFiles !== undefined, null, { timeout: 300000, polling: 100 });
const tStanding = Date.now() - t0;
// then let everything else land
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 3000;
}, null, { timeout: 300000, polling: 300 });
const tAllCity = Date.now() - t0 - 3000;
const r = await p.evaluate(() => ({ marks: window.__m, blockedMs: window.__long.reduce((a, x) => a + x, 0), worstTask: Math.max(0, ...window.__long),
  wireMB: +(performance.getEntriesByType('resource').reduce((a, x) => a + (x.transferSize || 0), 0) / 1048576).toFixed(1),
  wireMBbeforeStanding: +(performance.getEntriesByType('resource').filter((x) => x.responseEnd <= (window.__m.allFootprintFiles ?? 1e9)).reduce((a, x) => a + (x.transferSize || 0), 0) / 1048576).toFixed(1) }));
const out = { label: LABEL, mbps: MBPS, cityStandingMs: tStanding, allCityDataMs: tAllCity, ...r };
fs.writeFileSync(`${OUT}/cityup-${LABEL}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
