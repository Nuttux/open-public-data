/* Where the draw calls come from: visible meshes per layer at two poses, and the CPU time to issue a frame. */
import { chromium } from 'playwright';
import { ARGS, REF, init } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3000';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.addInitScript(init);
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = performance.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(8000);
for (const [name, s, k] of [['whole city', 0, 1], ['district', 1, 4], ['street', 2, 30]]) {
  const r = await p.evaluate(async ([s, k, ref]) => {
    const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k }); e.invalidate();
    await new Promise((r) => setTimeout(r, 1500));
    const ms = []; for (let i = 0; i < 12; i++) { e.invalidate(); e.renderNow(); ms.push(e.getStats().lastFrameMs); } ms.sort((a, b) => a - b);
    const per = {}; let vis = 0;
    e.scene.traverse((o) => { if (!o.isMesh) return; let v = o.visible; let q = o.parent; while (v && q) { v = q.visible; q = q.parent; } if (!v) return; const g = o.geometry; const n = g.index ? g.index.count : g.attributes.position?.count ?? 0; const dr = Math.min(g.drawRange.count, n); if (dr <= 0) return; vis++; const k = o.userData.layer ?? '?'; per[k] ??= { meshes: 0, shadow: 0, inst: 0 }; per[k].meshes++; if (o.castShadow) per[k].shadow++; if (o.isInstancedMesh) per[k].inst++; });
    const st = e.getStats();
    return { calls: st.calls, tris: st.triangles, issueMsP50: +ms[6].toFixed(1), visibleMeshes: vis, per: Object.entries(per).sort((a, b) => b[1].meshes - a[1].meshes).slice(0, 10).map(([k, v]) => `${k}:${v.meshes}${v.shadow ? '(+' + v.shadow + ' shadow)' : ''}`).join(' ') };
  }, [s, k, REF]);
  console.log(name.padEnd(11), JSON.stringify(r));
}
await b.close();
