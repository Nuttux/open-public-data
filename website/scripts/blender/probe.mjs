import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://localhost:3100/en/usa/san-francisco/the-city?release=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => globalThis.__cityGL && globalThis.__cityGLProj, null, { timeout: 300000 });
await p.waitForTimeout(15000);
const info = await p.evaluate(() => {
  const e = globalThis.__cityGL; const out = [];
  e.scene.traverse(o => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    const g = o.geometry; const m = Array.isArray(o.material) ? o.material[0] : o.material;
    out.push({ name: o.name || o.parent?.name, type: o.type, vis: o.visible, inst: o.isInstancedMesh ? o.count : 0,
      attrs: Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, [a.count, a.itemSize, a.array?.length ?? -1]])),
      idx: g.index ? g.index.count : 0, mat: m?.type, map: !!m?.map, vc: !!m?.vertexColors, color: m?.color?.getHexString?.() });
  });
  const c = e.camera;
  return { n: out.length, meshes: out, cam: { pos: c.position.toArray(), quat: c.quaternion.toArray(), l: c.left, r: c.right, t: c.top, b: c.bottom, zoom: c.zoom },
    proj: globalThis.__cityGLProj.centre, span: globalThis.__cityGLProj.spanM, keys: Object.keys(e).slice(0, 80) };
});
const agg={}; for (const m of info.meshes){const k=[m.name,m.type,m.mat,'map='+m.map,Object.keys(m.attrs).join(',')].join(' | '); agg[k]=agg[k]||{n:0,v:0,vis:0,inst:0}; agg[k].n++; agg[k].v+=m.attrs.position?.[0]||0; agg[k].vis+=m.vis?1:0; agg[k].inst+=m.inst;}
for (const [k,v] of Object.entries(agg)) console.log(k, JSON.stringify(v));
console.log(JSON.stringify(info.cam), info.proj, info.span);
await p.screenshot({ path: '/tmp/opd-probe.png' });
await b.close();
