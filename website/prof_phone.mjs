/* What the SF the-city page does on a phone: a phone's frame, a phone's pixel
   ratio, a throttled CPU and a shaped network. Reports load, memory, a zoom
   and a drag.

   HONEST CAVEAT, and it is the same one `lib/citygl/quality.ts` makes about
   its own phone numbers: this is a phone's FRAME and a throttled desktop CPU,
   on desktop GPU silicon. It is a good guide to the JavaScript and the
   download and a poor one for the fill rate.

   usage: node prof_phone.mjs [baseUrl] [cpuThrottle] [Mbps] [label] */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const CPU = Number(process.argv[3] ?? 4);
const MBPS = Number(process.argv[4] ?? 50);
const LABEL = process.argv[5] || `phone-cpu${CPU}`;
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => {
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  window.__long = []; window.__f = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); })
      .observe({ entryTypes: ['longtask'] });
  } catch {}
  let last = performance.now();
  const t = (n) => { window.__f.push(+(n - last).toFixed(1)); last = n; requestAnimationFrame(t); };
  requestAnimationFrame(t);
});

const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 60,
  downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: (MBPS * 1e6) / 8,
});

const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 300000 });
const tCanvas = Date.now() - t0;
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 600000, polling: 400 });
const tSettled = Date.now() - t0 - 4000;

const boot = await p.evaluate(() => {
  const rs = performance.getEntriesByType('resource');
  const m = performance.memory;
  return {
    requests: rs.length,
    wireMB: +(rs.reduce((a, r) => a + (r.transferSize || 0), 0) / 1048576).toFixed(1),
    blockedMs: window.__long.reduce((a, l) => a + l.d, 0),
    worstTask: Math.max(0, ...window.__long.map((l) => l.d)),
    heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(0) : null,
    heapLimitMB: m ? +(m.jsHeapSizeLimit / 1048576).toFixed(0) : null,
    backend: window.__cityGL ? window.__cityGL.backend : '(prod: not exposed)',
    dpr: window.devicePixelRatio,
    frame: [window.innerWidth, window.innerHeight],
  };
});

await p.waitForTimeout(3000);

// zoom, as a pinch is delivered: wheel with ctrlKey is what a trackpad/pinch sends
const zoom = await p.evaluate(async () => {
  window.__long.length = 0; window.__f.length = 0;
  const gl = document.querySelector('canvas');
  const r = gl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 24; i++) {
    gl.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    await new Promise((res) => setTimeout(res, 80));
  }
  await new Promise((res) => setTimeout(res, 2500));
  const f = window.__f.slice().sort((a, x) => a - x);
  const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))];
  const m = performance.memory;
  return {
    blockedMs: window.__long.reduce((a, l) => a + l.d, 0),
    worstTask: Math.max(0, ...window.__long.map((l) => l.d)),
    p50: at(0.5), p90: at(0.9), max: f[f.length - 1],
    heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(0) : null,
  };
});

// drag at the close camera
const drag = await p.evaluate(async () => {
  window.__f.length = 0; window.__long.length = 0;
  const gl = document.querySelector('canvas');
  gl.setPointerCapture = () => {};
  const r = gl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  gl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: cx, clientY: cy, bubbles: true }));
  for (let i = 0; i < 70; i++) {
    gl.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: cx + Math.sin(i / 8) * 90, clientY: cy + Math.cos(i / 10) * 60, bubbles: true }));
    await new Promise((res) => setTimeout(res, 16));
  }
  gl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: cx, clientY: cy, bubbles: true }));
  await new Promise((res) => setTimeout(res, 400));
  const f = window.__f.slice(2).sort((a, x) => a - x);
  const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))];
  return { p50: at(0.5), p90: at(0.9), max: f[f.length - 1], blockedMs: window.__long.reduce((a, l) => a + l.d, 0) };
});

const out = { label: LABEL, cpuThrottle: CPU, mbps: MBPS, tCanvasMs: tCanvas, tSettledMs: tSettled, boot, zoom, drag };
fs.writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await p.screenshot({ path: `${OUT}/${LABEL}.png` });
await b.close();
