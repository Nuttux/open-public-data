/* CPU-profile the zoom gesture on the SF the-city page and print self-time by
   function. Runs against the DEV server so names are readable.
   usage: node prof_zoom_cpu.mjs [baseUrl] [label] */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const LABEL = process.argv[3] || 'dev';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });

await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!window.__cityGL || !!document.querySelector('canvas'), null, { timeout: 180000 });
// wait until the data stream is quiet for 4s
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 300000, polling: 300 });

// per-phase timing hooks around the engine, if the dev global is there
const hooked = await p.evaluate(() => {
  const e = window.__cityGL; if (!e) return false;
  window.__t = { setStep: [], afterFrame: [], render: [] };
  const ss = e.setStep.bind(e);
  e.setStep = (s) => { const a = performance.now(); ss(s); window.__t.setStep.push(+(performance.now() - a).toFixed(1)); };
  const af = e.onAfterFrame;
  if (af) e.onAfterFrame = (c, s) => { const a = performance.now(); af(c, s); window.__t.afterFrame.push(+(performance.now() - a).toFixed(1)); };
  return true;
});

const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');

await p.evaluate(async () => {
  const gl = document.querySelector('canvas');
  const r = gl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 30; i++) {
    gl.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    await new Promise((res) => setTimeout(res, 70));
  }
  await new Promise((res) => setTimeout(res, 2500));
});

const { profile } = await cdp.send('Profiler.stop');

// self time per node
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas || [];
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i];
  self.set(id, (self.get(id) || 0) + (dt[i] || 0));
}
const rows = [...self.entries()].map(([id, us]) => {
  const n = byId.get(id);
  const f = n?.callFrame ?? {};
  const file = (f.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
  return { ms: +(us / 1000).toFixed(1), fn: f.functionName || '(anon)', at: `${file}:${(f.lineNumber ?? 0) + 1}` };
}).sort((a, x) => x.ms - a.ms);

const total = rows.reduce((a, r) => a + r.ms, 0);
// roll up by file
const byFile = {};
for (const r of rows) {
  const k = r.at.replace(/:\d+$/, '');
  byFile[k] = (byFile[k] || 0) + r.ms;
}

const t = await p.evaluate(() => window.__t ?? null);
const sum = (a) => a ? +a.reduce((x, y) => x + y, 0).toFixed(1) : null;

const out = {
  label: LABEL, hooked, totalSampledMs: +total.toFixed(0),
  phase: t ? {
    setStep: { n: t.setStep.length, totalMs: sum(t.setStep), each: t.setStep },
    afterFrame: { n: t.afterFrame.length, totalMs: sum(t.afterFrame), p50: t.afterFrame.sort((a, b) => a - b)[Math.floor(t.afterFrame.length / 2)], max: Math.max(...t.afterFrame, 0) },
  } : null,
  topFunctions: rows.slice(0, 35),
  topFiles: Object.entries(byFile).sort((a, x) => x[1] - a[1]).slice(0, 25).map(([k, v]) => ({ file: k, ms: +v.toFixed(0) })),
};
fs.writeFileSync(`${OUT}/zoomcpu-${LABEL}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
