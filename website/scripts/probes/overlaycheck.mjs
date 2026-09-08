/* Which years' level-6 tiles carry the dev overlay: a greyed tile has almost no colour. */
import sharp from 'sharp'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = 'public/tiles/us/sf/city';
const sat = async (f) => { const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true }); let s = 0, n = 0; for (let i = 0; i < data.length; i += info.channels * 7) { const r = data[i], g = data[i + 1], b = data[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx > 0) s += (mx - mn) / mx; n++; } return s / n; };
const bad = [], good = [];
for (const y of fs.readdirSync(ROOT).filter((d) => /^\d{4}$/.test(d)).sort()) {
  const dir = path.join(ROOT, y, '6'); if (!fs.existsSync(dir)) continue;
  const samples = ['20/12', '12/8', '28/14', '8/16'].map((t) => path.join(dir, t + '.webp')).filter((f) => fs.existsSync(f));
  const vals = []; for (const f of samples) vals.push(await sat(f));
  const grey = vals.filter((v) => v < 0.12).length;
  (grey > 0 ? bad : good).push(`${y}(${vals.map((v) => v.toFixed(2)).join('/')})`);
}
console.log('years with level 6:', bad.length + good.length); console.log('BAD', bad.length, bad.join(' ')); console.log('good', good.length, good.slice(0, 6).join(' '), '…');
