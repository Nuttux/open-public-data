/* Profile the SF the-city GL page: boot waterfall + zoom frame pacing.
   usage: node prof_city.mjs [baseUrl] [label] */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const LABEL = process.argv[3] || 'dev';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';
const URL = `${BASE}/us/city/sf/the-city`;

const b = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160)));

await p.addInitScript(() => {
  window.__prof = { long: [], frames: [] };
  // the default resource-timing buffer is 250 entries; this page issues ~800
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__prof.long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
  let last = performance.now();
  const tick = (now) => { window.__prof.frames.push([Math.round(now), +(now - last).toFixed(1)]); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

// optional network shaping: node prof_city.mjs <url> <label> <Mbps> <rttMs>
const MBPS = Number(process.argv[4]);
const RTT = Number(process.argv[5] ?? 40);
if (Number.isFinite(MBPS) && MBPS > 0) {
  const cdp0 = await p.context().newCDPSession(p);
  await cdp0.send('Network.enable');
  await cdp0.send('Network.emulateNetworkConditions', {
    offline: false, latency: RTT,
    downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: (MBPS * 1e6) / 8,
  });
  console.error(`# shaped: ${MBPS} Mbps, ${RTT} ms RTT`);
}

const t0 = Date.now();
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
const tDom = Date.now() - t0;

// `__cityGL` is dev-only; in a production build fall back to "a canvas exists"
await p.waitForFunction(
  () => !!window.__cityGL || !!document.querySelector('canvas'),
  null, { timeout: 180000 },
);
const tEngine = Date.now() - t0;
const hasEngine = await p.evaluate(() => !!window.__cityGL);

// settled = no new /data/ resource entry for 3s
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 3000;
}, null, { timeout: 300000, polling: 300 });
const tSettled = Date.now() - t0 - 3000;

const boot = await p.evaluate(() => {
  const rs = performance.getEntriesByType('resource').map((r) => ({
    u: r.name.replace(location.origin, ''),
    s: Math.round(r.startTime), e: Math.round(r.responseEnd), d: Math.round(r.duration),
    b: r.decodedBodySize || 0, tx: r.transferSize || 0, init: r.initiatorType,
  }));
  const e = window.__cityGL ?? null;
  return { rs, long: window.__prof.long, frames: window.__prof.frames,
    children: e ? e.scene.children.length : null,
    census: e && e.layerCensus ? e.layerCensus() : null };
});

// ── ZOOM RUN — wheel dispatched on the GL canvas itself (controls bind there,
//    and the overlay canvas sits on top so a real mouse wheel lands elsewhere)
await p.evaluate(() => { window.__prof.frames.length = 0; window.__prof.long.length = 0; });
const nResBefore = boot.rs.length;

const zoom = await p.evaluate(async (nBefore) => {
  const e = window.__cityGL ?? null;
  const gl = document.querySelector('canvas');
  const r = gl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const z0 = e ? e.getCamera().scale : 1;
  const ladder = [];
  for (let i = 0; i < 30; i++) {
    gl.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true,
    }));
    await new Promise((res) => setTimeout(res, 70));
    if (e) ladder.push([+(e.getCamera().scale / z0).toFixed(2), e.getStep()]);
  }
  await new Promise((res) => setTimeout(res, 2000));
  const rs = performance.getEntriesByType('resource').slice(nBefore).map((x) => ({
    u: x.name.replace(location.origin, ''), s: Math.round(x.startTime), e: Math.round(x.responseEnd),
    d: Math.round(x.duration), b: x.decodedBodySize || 0, tx: x.transferSize || 0,
  }));
  return { rs, long: window.__prof.long, frames: window.__prof.frames,
    zoomFactor: e ? +(e.getCamera().scale / z0).toFixed(2) : null,
    step: e ? e.getStep() : null, ladder };
}, nResBefore);

const stats = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, x) => a - x);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { n: s.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: s[s.length - 1],
    over33: s.filter((v) => v > 33).length, over100: s.filter((v) => v > 100).length };
};

const byGroup = (rs) => {
  const g = {};
  for (const r of rs) {
    const k = r.u.startsWith('/data/us/sf/city/') ? 'data/' + r.u.split('/')[5].replace(/\..*$/, '')
      : (r.u.match(/\.(js|css|woff2?|png|jpe?g|webp|svg)/)?.[1] ?? 'other');
    g[k] = g[k] || { n: 0, b: 0, tx: 0, s: 1e9, e: 0 };
    g[k].n++; g[k].b += r.b; g[k].tx += r.tx || 0;
    g[k].s = Math.min(g[k].s, r.s); g[k].e = Math.max(g[k].e, r.e ?? r.s + r.d);
  }
  return Object.fromEntries(Object.entries(g).sort((a, x) => x[1].b - a[1].b)
    .map(([k, v]) => [k, { n: v.n, MB: +(v.b / 1048576).toFixed(2), wireMB: +(v.tx / 1048576).toFixed(2), win: `${v.s}→${v.e}ms` }]));
};

const report = {
  label: LABEL, url: URL,
  wall: { domContentLoaded: tDom, engineExists: tEngine, dataSettled: tSettled },
  boot: {
    requests: boot.rs.length,
    decodedMB: +(boot.rs.reduce((a, r) => a + r.b, 0) / 1048576).toFixed(2),
    wireMB: +(boot.rs.reduce((a, r) => a + (r.tx || 0), 0) / 1048576).toFixed(2),
    sceneChildren: boot.children,
    byGroup: byGroup(boot.rs),
    longTasks: { count: boot.long.length, totalMs: boot.long.reduce((a, l) => a + l.d, 0), top: [...boot.long].sort((a, x) => x.d - a.d).slice(0, 12) },
    frameGaps: stats(boot.frames.map((f) => f[1])),
    lastData: [...boot.rs].filter((r) => r.u.includes('/data/')).sort((a, x) => x.e - a.e).slice(0, 8).map((r) => ({ u: r.u, end: r.e, KB: Math.round(r.b / 1024) })),
  },
  zoom: {
    zoomFactor: zoom.zoomFactor, endStep: zoom.step,
    newRequests: zoom.rs.length,
    newMB: +(zoom.rs.reduce((a, r) => a + r.b, 0) / 1048576).toFixed(2),
    byGroup: byGroup(zoom.rs),
    topNew: [...zoom.rs].sort((a, x) => x.b - a.b).slice(0, 12),
    longTasks: { count: zoom.long.length, totalMs: zoom.long.reduce((a, l) => a + l.d, 0), top: [...zoom.long].sort((a, x) => x.d - a.d).slice(0, 12) },
    frameGaps: stats(zoom.frames.map((f) => f[1])),
    worstFrames: zoom.frames.map((f) => f[1]).sort((a, x) => x - a).slice(0, 12),
    ladder: zoom.ladder,
  },
  layerCensus: boot.census,
};

fs.writeFileSync(`${OUT}/prof-${LABEL}.json`, JSON.stringify({ report, bootRs: boot.rs, zoomRs: zoom.rs }, null, 1));
const { layerCensus, ...head } = report;
console.log(JSON.stringify(head, null, 1));
await b.close();
