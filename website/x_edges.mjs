/* clip the last column and row of each level to the level's own extent, transparent beyond — the same rule the renderer now applies at cut time */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2];
const idx = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
const T = idx.tile;
let n = 0;
for (const [z, l] of Object.entries(idx.levels)) {
  const [nx, ny] = l.tiles, [W, H] = l.px;
  for (let X = 0; X < nx; X++) for (let Y = 0; Y < ny; Y++) {
    const cw = Math.min(T, W - X * T), ch = Math.min(T, H - Y * T);
    if (cw >= T && ch >= T) continue;
    const f = path.join(OUT, z, String(X), `${Y}.webp`);
    const buf = await sharp(f).extract({ left: 0, top: 0, width: cw, height: ch }).ensureAlpha()
      .extend({ right: T - cw, bottom: T - ch, background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(f, buf); n++;
  }
}
console.log('clipped', n, 'edge tiles');
