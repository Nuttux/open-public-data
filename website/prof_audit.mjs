/* A full audit of what the scene is made of and what each byte buys.
   Four questions:
     1. bytes per layer, split by which attribute and what number type
     2. how many vertices each layer spends, and per published thing
     3. what fraction of it is inside the frustum at each of the three cameras
     4. what is resident but currently switched off
   usage: node prof_audit.mjs [baseUrl] */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 600000, polling: 400 });
await p.waitForTimeout(3000);

const REF = { cx: 241.427019126574, cy: 707.0567508859249, scale: 0.06898352692062097 };

const audit = await p.evaluate(async (REF) => {
  const e = window.__cityGL;
  const THREE = {};
  const seen = new Set();

  /* ── 1 & 2: bytes and vertices by layer, and by attribute ── */
  const layers = {};
  const attrRows = {};
  const L = (n) => (layers[n] ??= { bytes: 0, verts: 0, meshes: 0, hidden: 0, hiddenBytes: 0, insts: 0 });
  e.scene.traverse((o) => {
    const g = o.geometry;
    if (!g && !o.isInstancedMesh) return;
    const name = o.userData?.layer ?? o.name ?? '?';
    const rec = L(name);
    rec.meshes++;
    let own = 0;
    if (o.isInstancedMesh && o.instanceMatrix && !seen.has(o.instanceMatrix.array)) {
      seen.add(o.instanceMatrix.array);
      own += o.instanceMatrix.array.byteLength;
      rec.insts += o.count;
      (attrRows[`${name}::instanceMatrix`] ??= { bytes: 0, type: 'Float32Array', items: 0 }).bytes += o.instanceMatrix.array.byteLength;
    }
    if (g) {
      for (const k of Object.keys(g.attributes)) {
        const a = g.attributes[k];
        if (!a?.array || seen.has(a.array)) continue;
        seen.add(a.array);
        own += a.array.byteLength;
        if (k === 'position') rec.verts += a.count;
        const key = `${name}::${k}`;
        const r = (attrRows[key] ??= { bytes: 0, type: a.array.constructor.name, items: a.itemSize, count: 0 });
        r.bytes += a.array.byteLength;
        r.count += a.count;
      }
      if (g.index && !seen.has(g.index.array)) {
        seen.add(g.index.array);
        own += g.index.array.byteLength;
        const r = (attrRows[`${name}::INDEX`] ??= { bytes: 0, type: g.index.array.constructor.name, items: 1, count: 0 });
        r.bytes += g.index.array.byteLength;
        r.count += g.index.count;
      }
    }
    rec.bytes += own;
    /* resident but switched off right now */
    let vis = o.visible;
    let q = o.parent;
    while (vis && q) { if (!q.visible) vis = false; q = q.parent; }
    if (!vis) { rec.hidden++; rec.hiddenBytes += own; }
  });

  /* ── 3: how much is inside the frustum at each camera ── */
  const bands = [
    { name: 'whole city', step: 0, k: 1 },
    { name: 'district', step: 1, k: 3.3 },
    { name: 'street', step: 2, k: 12 },
  ];
  const vis = {};
  for (const bd of bands) {
    e.setStep(bd.step);
    e.setCamera({ cx: REF.cx, cy: REF.cy, scale: REF.scale * bd.k });
    e.renderNow();
    await new Promise((r) => setTimeout(r, 300));
    /* WHICH MESHES THREE ITSELF DRAWS. Reproducing the frustum test by hand
       gave an answer that could not be right — 80 % of the city still "in
       frame" at a camera showing one block — so this asks the renderer
       instead: `onBeforeRender` fires for the objects that survived the cull
       and for nothing else. */
    const drew = new Set();
    const drewShadow = new Set();
    const hooks = [];
    e.scene.traverse((o) => {
      if (!o.geometry) return;
      const prev = o.onBeforeRender;
      hooks.push([o, prev]);
      /* THE CAMERA TELLS YOU WHICH PASS IT IS. `onBeforeRender` fires for the
         shadow map too, and the shadow map is fitted to the SUN's box, not to
         the frame — so counting both together says most of the city is on
         screen at a camera showing one block, which it plainly is not. */
      o.onBeforeRender = function (r, s, camera, ...a) {
        (camera === e.camera ? drew : drewShadow).add(this.uuid);
        if (prev) prev.call(this, r, s, camera, ...a);
      };
    });
    e.renderNow();
    await new Promise((r) => setTimeout(r, 250));
    e.renderNow();
    for (const [o, prev] of hooks) o.onBeforeRender = prev;

    const per = {};
    const seen2 = new Set();
    e.scene.traverse((o) => {
      if (!o.geometry) return;
      const name = o.userData?.layer ?? o.name ?? '?';
      const q = (per[name] ??= { meshes: 0, inMeshes: 0, bytes: 0, inBytes: 0 });
      let own = 0;
      const g = o.geometry;
      for (const k of Object.keys(g.attributes)) {
        const a = g.attributes[k];
        if (a?.array && !seen2.has(a.array)) { seen2.add(a.array); own += a.array.byteLength; }
      }
      if (g.index && !seen2.has(g.index.array)) { seen2.add(g.index.array); own += g.index.array.byteLength; }
      q.meshes++; q.bytes += own;
      if (drew.has(o.uuid)) { q.inMeshes++; q.inBytes += own; }
      if (drewShadow.has(o.uuid)) { q.shMeshes = (q.shMeshes||0)+1; q.shBytes = (q.shBytes||0)+own; }
    });
    vis[bd.name] = per;
  }
  e.setStep(0);
  e.setCamera({ cx: REF.cx, cy: REF.cy, scale: REF.scale });

  return { layers, attrRows, vis, THREE };
}, REF);

fs.writeFileSync(`${OUT}/audit.json`, JSON.stringify(audit, null, 1));

const MB = (b2) => +(b2 / 1048576).toFixed(1);
console.log('══ 1. WHERE THE BYTES ARE ══');
console.log('layer              MB   meshes    vertices   instances   OFF-now(MB)');
const rows = Object.entries(audit.layers).sort((a, b2) => b2[1].bytes - a[1].bytes);
let tot = 0;
for (const [k, v] of rows) {
  tot += v.bytes;
  console.log(k.padEnd(18) + String(MB(v.bytes)).padStart(6) + String(v.meshes).padStart(8)
    + String(v.verts.toLocaleString()).padStart(12) + String(v.insts.toLocaleString()).padStart(12)
    + String(v.hiddenBytes ? MB(v.hiddenBytes) : '').padStart(13));
}
console.log('TOTAL'.padEnd(18) + String(MB(tot)).padStart(6));

console.log('\n══ 2. WHAT EACH ATTRIBUTE COSTS (top 22) ══');
console.log('layer::attribute            MB     type          items');
for (const [k, v] of Object.entries(audit.attrRows).sort((a, b2) => b2[1].bytes - a[1].bytes).slice(0, 22)) {
  console.log(k.padEnd(28) + String(MB(v.bytes)).padStart(6) + '   ' + String(v.type).padEnd(14) + String(v.items));
}

console.log('\n══ 3. HOW MUCH IS ON SCREEN AT EACH CAMERA ══');
for (const [band, per] of Object.entries(audit.vis)) {
  const t = Object.values(per).reduce((a, v) => a + v.bytes, 0);
  const i = Object.values(per).reduce((a, v) => a + v.inBytes, 0);
  console.log(`\n-- ${band}: ${MB(i)} MB of ${MB(t)} MB inside the frame (${(100 * i / t).toFixed(0)}%)`);
  for (const [k, v] of Object.entries(per).sort((a, b2) => b2[1].bytes - a[1].bytes).slice(0, 6)) {
    console.log('   ' + k.padEnd(18) + String(MB(v.inBytes)).padStart(7) + ' of ' + String(MB(v.bytes)).padStart(7)
      + '   on-screen ' + v.inMeshes + '/' + v.meshes + '   also-for-shadows ' + (v.shMeshes||0));
  }
}
await b.close();
