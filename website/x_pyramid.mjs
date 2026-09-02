/* Cut the three renders into a Leaflet tile pyramid. Wide = zoom 0-3 over the
   whole extent; district = zoom 5 over its own footprint; street = zoom 7 over
   its footprint. Whole-tile interiors only, so every tile is a JPEG. */
import sharp from 'sharp';
import fs from 'node:fs';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';
const T = 256, Q = 76;
const wide = sharp(`${OUT}/tile-src-wide.png`); const { width: MW, height: MH } = await wide.metadata();
const tiles = {}; const stats = {};
const put = async (layer, z, x, y, buf) => { tiles[`${layer}/${z}/${x}/${y}`] = 'data:image/jpeg;base64,' + buf.toString('base64'); stats[layer] = (stats[layer] || 0) + 1; };

// A: the wide render, zoom 3 = native, down to zoom 0
for (let z = 3; z >= 0; z--) {
  const f = 2 ** (z - 3); const w = Math.round(MW * f), h = Math.round(MH * f);
  const img = await sharp(`${OUT}/tile-src-wide.png`).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  for (let y = 0; y * T < h; y++) for (let x = 0; x * T < w; x++) {
    const cw = Math.min(T, w - x * T), ch = Math.min(T, h - y * T);
    const t = sharp(img).extract({ left: x * T, top: y * T, width: cw, height: ch });
    const pad = (cw < T || ch < T) ? t.extend({ right: T - cw, bottom: T - ch, background: '#cfd6db' }) : t;
    await put('A', z, x, y, await pad.jpeg({ quality: Q }).toBuffer());
  }
}
// B and C: an overlay camera at k× the wide scale, centred on the same point.
// At zoom z the canvas is MW·2^(z-3) wide and the overlay's native pixels are
// scaled by 2^(z-3)/k, placed with its centre on the canvas centre.
const overlay = async (layer, src, k, z) => {
  const f = 2 ** (z - 3); const s = f / k;
  const meta = await sharp(src).metadata();
  const ow = Math.round(meta.width * s), oh = Math.round(meta.height * s);
  const img = await sharp(src).resize(ow, oh, { kernel: 'lanczos3' }).toBuffer();
  const left = Math.round(MW * f / 2 - ow / 2), top = Math.round(MH * f / 2 - oh / 2);
  const x0 = Math.ceil(left / T), x1 = Math.floor((left + ow) / T) - 1;
  const y0 = Math.ceil(top / T), y1 = Math.floor((top + oh) / T) - 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const buf = await sharp(img).extract({ left: x * T - left, top: y * T - top, width: T, height: T }).jpeg({ quality: Q }).toBuffer();
    await put(layer, z, x, y, buf);
  }
  return { z, x0, x1, y0, y1, left, top, ow, oh };
};
const B = await overlay('B', `${OUT}/tile-src-district.png`, 3.3, 5);
const C = await overlay('C', `${OUT}/tile-src-street.png`, 12, 7);
const bytes = Object.values(tiles).reduce((a, s) => a + s.length, 0);
fs.writeFileSync(`${OUT}/tiles.json`, JSON.stringify({ MW, MH, B, C, tiles }));
console.log(JSON.stringify({ MW, MH, stats, inlineMB: +(bytes / 1048576).toFixed(1), B: { z: B.z, x: [B.x0, B.x1], y: [B.y0, B.y1] }, C: { z: C.z, x: [C.x0, C.x1], y: [C.y0, C.y1] } }));
