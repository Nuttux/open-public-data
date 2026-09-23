// Export one district of the live engine's scene to <out>/scene.json + textures,
// in Blender axes (X east, Y north, Z up, metres), heights un-exaggerated.
// usage: node export_district.mjs <worldX> <worldY> <halfM> <outDir> [step]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [wx, wy, half, out, stepArg] = process.argv.slice(2);
const X = +wx, Y = +wy, H = +half, STEP = stepArg === undefined ? 2 : +stepArg;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
await p.goto('http://localhost:3100/en/usa/san-francisco/the-city?release=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => globalThis.__cityGL && globalThis.__cityGLProj, null, { timeout: 300000 });
await p.waitForTimeout(12000);
// frame the district in the live engine for the side-by-side
await p.evaluate(([X, Y, H, STEP]) => {
  const e = globalThis.__cityGL, pr = globalThis.__cityGLProj;
  e.setStep(STEP);
  const a = pr.proj(X - H, Y, 0), c = pr.proj(X + H, Y, 0), m = pr.proj(X, Y, 0);
  const wPlane = Math.hypot(c[0] - a[0], c[1] - a[1]);
  e.setCamera({ cx: m[0], cy: m[1], scale: 1600 / wPlane });
  e.invalidate();
}, [X, Y, H, STEP]);
await p.waitForTimeout(8000);
await p.screenshot({ path: `${out}/current.png` });

const res = await p.evaluate(async ([X, Y, H, SKIP]) => {
  const e = globalThis.__cityGL;
  const st = (() => { try { let s; e.scene.traverse(o => { const m = o.material; const r = m && (m.userData?.rise); if (r && !s) s = r.state(); }); return s; } catch { return null; } })();
  const b64 = (ta) => { const u = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const read = (a, i, k) => a.getComponent ? a.getComponent(i, k) : a.array[i * a.itemSize + k];
  const texIds = new Map(); const textures = {};
  const texOf = (m) => {
    const t = m?.map; if (!t || !t.image) return null;
    if (texIds.has(t.uuid)) return texIds.get(t.uuid);
    const img = t.image; const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    if (img.data) { const id = new ImageData(new Uint8ClampedArray(img.data.buffer ?? img.data), img.width, img.height); ctx.putImageData(id, 0, 0); }
    else ctx.drawImage(img, 0, 0);
    const id = 'tex' + texIds.size; texIds.set(t.uuid, id);
    textures[id] = { png: cv.toDataURL('image/png'), repeat: [t.wrapS, t.wrapT], flipY: t.flipY };
    return id;
  };
  const meshes = []; const trees = [];
  const x0 = X - H, x1 = X + H, y0 = Y - H, y1 = Y + H;
  const inBox = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const v = { x: 0, y: 0, z: 0 };
  /* true heights: every CPU-baked layer back to zex = zexb = 1 */
  for (const l of e.layers || []) { try { l.onStep?.(e.getStep(), 1, 1); } catch {} }
  e.scene.traverse(o => { if (o.name === 'terrain' && o.scale) o.userData.__ys = o.scale.y; });
  e.scene.updateMatrixWorld(true);
  e.scene.traverse(o => {
    if (!o.isMesh) return;
    const layer = o.name || o.parent?.name || '';
    if (/^(fire|block-tint|theme-mark|mark-hot)/.test(layer)) return;
    if (SKIP.includes(layer)) return;
    if (!o.visible && !/^trees|^street-detail|^street-markings/.test(layer)) return;
    const g = o.geometry, m = Array.isArray(o.material) ? o.material[0] : o.material;
    const P = g.attributes.position; if (!P) return;
    const HB = g.attributes.aHB, C = g.attributes.color, UV = g.attributes.uv, OFF = g.attributes.aOff;
    const colQ = HB ? 2 : 1;
    const idx = g.index;
    const n = idx ? idx.count : P.count;
    const mw = o.matrixWorld.elements;
    const xf = (i, mtx) => {
      let x = read(P, i, 0), y = read(P, i, 1), z = read(P, i, 2);
      if (HB) y = y + read(HB, i, 0) * 32767 / 100; // ground (true) + built height (true)
      const M = mtx || mw;
      return [M[0]*x+M[4]*y+M[8]*z+M[12], M[1]*x+M[5]*y+M[9]*z+M[13], M[2]*x+M[6]*y+M[10]*z+M[14]];
    };
    if (o.isInstancedMesh) {
      const im = o.instanceMatrix.array, ic = o.instanceColor?.array;
      const inst = [];
      for (let k = 0; k < o.count; k++) {
        const L = im.subarray(k * 16, k * 16 + 16);
        const tx = mw[0]*L[12]+mw[4]*L[13]+mw[8]*L[14]+mw[12], tz = mw[2]*L[12]+mw[6]*L[13]+mw[10]*L[14]+mw[14], ty = mw[1]*L[12]+mw[5]*L[13]+mw[9]*L[14]+mw[13];
        if (!inBox(tx, tz)) continue;
        inst.push([tx, tz, ty, Math.hypot(L[0], L[1], L[2]), Math.hypot(L[4], L[5], L[6]), Math.atan2(L[2], L[0]), ic ? ic[k*3] : 1, ic ? ic[k*3+1] : 1, ic ? ic[k*3+2] : 1]);
      }
      if (!inst.length) return;
      // prototype geometry, local
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let t = 0; t < n; t++) { const i = idx ? idx.getX(t) : t;
        pos[t*3] = read(P, i, 0); pos[t*3+1] = -read(P, i, 2); pos[t*3+2] = read(P, i, 1);
        if (C) for (let k = 0; k < 3; k++) col[t*3+k] = read(C, i, k); else col.fill(1, t*3, t*3+3); }
      const rec = { layer, mat: m?.type, color: m?.color?.toArray?.(), instanced: true, visible: o.visible, pos: b64(pos), col: b64(col), inst };
      if (/^trees/.test(layer)) trees.push(rec); else meshes.push(rec);
      return;
    }
    // quick reject by bounding sphere
    if (!g.boundingSphere) g.computeBoundingSphere();
    const pos = [], col = [], uv = [], cen = [];
    const tri = [0, 0, 0];
    for (let t = 0; t + 2 < n; t += 3) {
      let keep = false; const W = [];
      for (let k = 0; k < 3; k++) { const i = idx ? idx.getX(t + k) : t + k; tri[k] = i; const w = xf(i); W.push(w); if (inBox(w[0], w[2])) keep = true; }
      if (!keep) continue;
      for (let k = 0; k < 3; k++) { const w = W[k], i = tri[k];
        pos.push(w[0], w[2], w[1]);
        if (C) col.push(read(C, i, 0) * colQ, read(C, i, 1) * colQ, read(C, i, 2) * colQ); else col.push(1, 1, 1);
        if (UV) uv.push(read(UV, i, 0), read(UV, i, 1));
        /* the building's own centroid: the identity every per-building choice keys on */
        if (OFF) cen.push(w[0] + read(OFF, i, 0) * 2048, w[2] + read(OFF, i, 1) * 2048); } // getComponent already denormalises the snorm16
    }
    if (!pos.length) return;
    meshes.push({ layer, mat: m?.type, color: m?.color?.toArray?.(), rough: m?.roughness, metal: m?.metalness, opacity: m?.opacity, visible: o.visible,
      tex: UV ? texOf(m) : null, pos: b64(new Float32Array(pos)), col: b64(new Float32Array(col)), uv: uv.length ? b64(new Float32Array(uv)) : null, cen: cen.length ? b64(new Float32Array(cen)) : null, nv: pos.length / 3 });
  });
  const c = e.camera;
  const fwd = [0, 0, -1]; const q = c.quaternion; // rotate (0,0,-1) by q
  const [qx, qy, qz, qw] = [q.x, q.y, q.z, q.w];
  const ix = qw*fwd[0]+qy*fwd[2]-qz*fwd[1], iy = qw*fwd[1]+qz*fwd[0]-qx*fwd[2], iz = qw*fwd[2]+qx*fwd[1]-qy*fwd[0], iw = -qx*fwd[0]-qy*fwd[1]-qz*fwd[2];
  const f = [ix*qw+iw*-qx+iy*-qz-iz*-qy, iy*qw+iw*-qy+iz*-qx-ix*-qz, iz*qw+iw*-qz+ix*-qy-iy*-qx];
  const sun = []; e.scene.traverse(o => { if (o.isDirectionalLight) sun.push({ pos: o.position.toArray(), tgt: o.target.position.toArray(), color: o.color.toArray(), intensity: o.intensity }); });
  return { box: [x0, y0, x1, y1], state: st, camForwardThree: f, camForward: [f[0], f[2], f[1]], sun, meshes, trees, textures };
}, [X, Y, H, (process.env.SKIP || '').split(',').filter(Boolean)]);
for (const [id, t] of Object.entries(res.textures)) { fs.writeFileSync(`${out}/${id}.png`, Buffer.from(t.png.split(',')[1], 'base64')); delete t.png; }
fs.writeFileSync(`${out}/scene.json`, JSON.stringify(res));
const agg = {}; for (const m of res.meshes) { agg[m.layer] = (agg[m.layer] || 0) + (m.nv || m.inst?.length || 0); }
console.log('layers', agg, 'trees', res.trees.map(t => t.inst.length), 'tex', Object.keys(res.textures), 'fwd', res.camForward, 'state', res.state);
await b.close();
