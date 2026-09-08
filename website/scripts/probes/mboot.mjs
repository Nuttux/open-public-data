/* Phone boot order: when the map div appears, when the loading sheet comes off, when the first tile lands — against when the base tier and the fine DEM finish. */
import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3000';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, locale: 'en-US' });
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__t = {}; try { performance.setResourceTimingBufferSize(3000); } catch {}
  setInterval(() => {
    const t = window.__t;
    if (!t.map && document.querySelector('.leaflet-container')) t.map = performance.now();
    if (!t.sheetOff && document.querySelector('.leaflet-container') && !document.querySelector('.fx-city-overlay')) t.sheetOff = performance.now();
    if (!t.labels && document.querySelector('.fx-city-tiles-labels canvas')) t.labels = performance.now();
    if (!t.controls && document.querySelector('.fx-city-stoprow')) t.controls = performance.now();
  }, 20);
});
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!document.querySelector('.fx-city-stoprow') && !!document.querySelector('.fx-city-tiles-labels canvas') && [...document.querySelectorAll('.leaflet-tile')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 180000, polling: 100 });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const end = (re) => { const e = performance.getEntriesByType('resource').find((r) => re.test(r.name)); return e ? Math.round(e.responseEnd) : null; };
  const t = window.__t; const R = (v) => (v == null ? null : Math.round(v));
  const w = performance.getEntriesByType('resource').filter((r) => /\.webp/.test(r.name)).map((r) => r.responseEnd);
  return { index: end(/index\.json/), map: R(t.map), firstTile: w.length ? Math.round(Math.min(...w)) : null, sheetOff: R(t.sheetOff), controls: R(t.controls), base: end(/bundle\/base\.qcb/), dem: end(/terrain-fine\.bin/), labels: R(t.labels) };
});
console.log(BASE, JSON.stringify(r), '| sheet off before the DEM by', (r.dem ?? 0) - (r.sheetOff ?? 0), 'ms');
await b.close();
