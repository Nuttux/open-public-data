/* Time every layer's onStep individually, and census the scene.
   usage: node prof_step.mjs [baseUrl] */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });

await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 180000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 300000, polling: 300 });

const out = await p.evaluate(async () => {
  const e = window.__cityGL;

  // scene weight
  let verts = 0, meshes = 0, instances = 0;
  const geos = new Set();
  e.scene.traverse((o) => {
    if (!o.geometry) return;
    meshes++;
    if (o.isInstancedMesh) instances += o.count;
    if (geos.has(o.geometry)) return;
    geos.add(o.geometry);
    const pos = o.geometry.getAttribute?.('position');
    if (pos) verts += pos.count;
  });

  // per-layer onStep timing: wrap each layer's handler
  const timings = {};
  for (const l of e.layers) {
    if (!l.onStep) continue;
    const orig = l.onStep.bind(l);
    timings[l.name] = [];
    l.onStep = (s, z, zb) => {
      const a = performance.now();
      orig(s, z, zb);
      timings[l.name].push(+(performance.now() - a).toFixed(1));
    };
  }
  // and the overlay's per-frame cost
  const frameCost = [];
  const af = e.onAfterFrame;
  if (af) e.onAfterFrame = (c, s) => { const a = performance.now(); af(c, s); frameCost.push(+(performance.now() - a).toFixed(2)); };

  // walk the whole ladder: step 0 -> 1 -> 2 -> 1 -> 0, timing setStep itself
  const wall = [];
  for (const s of [1, 2, 1, 0, 1, 2]) {
    const a = performance.now();
    e.setStep(s);
    wall.push({ to: s, ms: +(performance.now() - a).toFixed(1) });
    await new Promise((r) => setTimeout(r, 400));
  }

  const roll = Object.fromEntries(Object.entries(timings)
    .map(([k, v]) => [k, { calls: v.length, totalMs: +v.reduce((x, y) => x + y, 0).toFixed(1), maxMs: Math.max(...v, 0) }])
    .filter(([, v]) => v.totalMs > 0)
    .sort((a, x) => x[1].totalMs - a[1].totalMs));

  return {
    scene: { meshes, uniqueGeometries: geos.size, vertices: verts, instances },
    census: e.layerCensus ? e.layerCensus() : null,
    setStepWall: wall,
    perLayer: roll,
    overlayPerFrame: frameCost.length ? {
      n: frameCost.length,
      p50: frameCost.slice().sort((a, x) => a - x)[Math.floor(frameCost.length / 2)],
      max: Math.max(...frameCost),
      totalMs: +frameCost.reduce((a, x) => a + x, 0).toFixed(1),
    } : null,
    backend: e.backend ?? null,
  };
});

fs.writeFileSync(`${OUT}/stepcost.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
