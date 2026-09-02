/* How much memory the page actually RETAINS, after a forced collection, and
   roughly where it goes. usage: node prof_mem.mjs [baseUrl] */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
const cdp = await p.context().newCDPSession(p);
await cdp.send('HeapProfiler.enable');

await p.goto(`${BASE}/us/city/sf/the-city${process.argv[3]?'?'+process.argv[3]:''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 300000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 600000, polling: 400 });
await p.waitForTimeout(4000);

const before = await p.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(0));
await cdp.send('HeapProfiler.collectGarbage');
await p.waitForTimeout(1500);
await cdp.send('HeapProfiler.collectGarbage');
await p.waitForTimeout(1500);
const after = await p.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(0));

/* where it goes: the scene's own buffers, counted straight off the attributes,
   against the raw chunk cache the loader is still holding */
const split = await p.evaluate(() => {
  const e = window.__cityGL;
  if (!e) return null;
  const seen = new Set();
  let geoBytes = 0, idxBytes = 0, instBytes = 0, texBytes = 0;
  const seenTex = new Set();
  e.scene.traverse((o) => {
    if (o.isInstancedMesh && o.instanceMatrix) instBytes += o.instanceMatrix.array.byteLength;
    const g = o.geometry;
    if (g && !seen.has(g)) {
      seen.add(g);
      for (const k of Object.keys(g.attributes)) {
        const a = g.attributes[k];
        if (a && a.array && !seen.has(a.array)) { seen.add(a.array); geoBytes += a.array.byteLength; }
      }
      if (g.index && !seen.has(g.index.array)) { seen.add(g.index.array); idxBytes += g.index.array.byteLength; }
    }
    const m = o.material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      for (const k of Object.keys(mat)) {
        const t = mat[k];
        if (t && t.isTexture && t.image && !seenTex.has(t)) {
          seenTex.add(t);
          const w = t.image.width || 0, h = t.image.height || 0;
          texBytes += w * h * 4;
        }
      }
    }
  });
  const d = window.__cityGLData;
  const stats = d && d.stats ? d.stats() : null;
  return {
    geometryMB: +(geoBytes / 1048576).toFixed(0),
    indexMB: +(idxBytes / 1048576).toFixed(0),
    instanceMB: +(instBytes / 1048576).toFixed(0),
    textureMB: +(texBytes / 1048576).toFixed(0),
    chunkCacheMB: stats ? +(stats.heldBytes / 1048576).toFixed(0) : null,
    chunksHeld: stats ? stats.held : null,
  };
});

console.log(JSON.stringify({ heapBeforeGCMB: before, heapAfterGCMB: after, split }, null, 1));
await b.close();
