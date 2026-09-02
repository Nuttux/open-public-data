/* Zoom in / out / in again, reporting the long tasks of each pass separately.
   A first pass that is far more expensive than the later ones means the cost is
   warm-up (pipeline compilation, texture generation), not per-crossing work.
   usage: node prof_zoom_repeat.mjs [baseUrl] [label] */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const LABEL = process.argv[3] || 'prod';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => {
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  window.__long = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); })
      .observe({ entryTypes: ['longtask'] });
  } catch {}
});

await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 180000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 300000, polling: 300 });
await p.waitForTimeout(2000);

const passes = await p.evaluate(async () => {
  const gl = document.querySelector('canvas');
  const r = gl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const run = async (dir) => {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      gl.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * 120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      await new Promise((res) => setTimeout(res, 70));
    }
    await new Promise((res) => setTimeout(res, 2000));
    const t1 = performance.now();
    const ls = window.__long.filter((l) => l.t >= t0 && l.t <= t1);
    return { blockedMs: ls.reduce((a, l) => a + l.d, 0), tasks: ls.map((l) => l.d).sort((a, x) => x - a).slice(0, 6) };
  };
  return { in1: await run(-1), out1: await run(1), in2: await run(-1), out2: await run(1) };
});

fs.writeFileSync(`${OUT}/zoomrepeat-${LABEL}.json`, JSON.stringify(passes, null, 1));
console.log(JSON.stringify(passes, null, 1));
await b.close();
