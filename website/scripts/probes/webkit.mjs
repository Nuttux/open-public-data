import { webkit } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => {
  const names = {}; for (const k of Object.keys(WebGL2RenderingContext.prototype)) { try { const v = WebGL2RenderingContext.prototype[k]; if (typeof v === 'number') names[v] = k; } catch {} }
  const orig = WebGL2RenderingContext.prototype.vertexAttribPointer;
  window.__bad = [];
  WebGL2RenderingContext.prototype.vertexAttribPointer = function (i, size, type, norm, stride, off) {
    const err0 = this.getError();
    const r = orig.call(this, i, size, type, norm, stride, off);
    const err = this.getError();
    if (err !== 0) window.__bad.push({ index: i, size, type: names[type] || type, norm, stride, err: names[err] || err });
    return r;
  };
});
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => !document.querySelector(".fx-city-loading"), null, { timeout: 120000 }).catch(() => console.log("veil stayed")); await p.waitForTimeout(8000);
await p.waitForTimeout(4000);
console.log(await p.evaluate(() => { const e = window.__cityGL; let meshes = 0; const per = {}; e.scene.traverse((o) => { if (o.isMesh || o.isLine) { meshes++; per[o.userData.layer ?? '?'] = (per[o.userData.layer ?? '?'] || 0) + 1; } }); return { backend: e.backend, meshes, bad: window.__bad.slice(0, 8), badN: window.__bad.length }; }));
await p.evaluate(async () => { window.__cityGL.renderNow(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
await p.screenshot({ path: process.env.OUT, type: 'jpeg', quality: 85 });
await b.close();
