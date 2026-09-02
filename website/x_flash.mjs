import { chromium } from 'playwright';
import sharp from 'sharp';
const SCR = process.env.SCR;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3000/us/city/sf/the-city?tiles=1', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-tiles.leaflet-container', { timeout: 60000 });
await p.waitForTimeout(3000);
const box = await p.locator('.fx-city-tiles').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await p.mouse.move(cx, cy);
const paperFrac = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let n = 0, tot = info.width * info.height;
  for (let i = 0; i < tot; i++) { const o = i * info.channels; if (Math.abs(data[o] - 0xec) < 6 && Math.abs(data[o + 1] - 0xe7) < 6 && Math.abs(data[o + 2] - 0xdc) < 6) n++; }
  return n / tot;
};
const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
let k = 0;
const report = [];
for (let step = 0; step < 14; step++) {
  await p.mouse.wheel(0, -120);
  for (let f = 0; f < 3; f++) {
    await p.waitForTimeout(60);
    const shot = await p.screenshot({ clip });
    const frac = await paperFrac(shot);
    const st = await p.evaluate(() => { const t = [...document.querySelectorAll('.fx-city-tile')]; return { zoom: +document.querySelector('.leaflet-container')._leaflet_id, n: t.length, loaded: t.filter((i) => i.classList.contains('leaflet-tile-loaded')).length }; });
    report.push({ step, f, paper: +(frac * 100).toFixed(1), tiles: st.n, loaded: st.loaded });
    if (frac > 0.25) { await sharp(shot).resize(720).png().toFile(`${SCR}/flash-${k++}.png`); }
  }
}
console.log(report.filter((r) => r.paper > 5).map((r) => JSON.stringify(r)).join('\n') || 'no frame with >5% paper');
console.log('max paper %', Math.max(...report.map((r) => r.paper)), ' frames', report.length);
await b.close();
