import { chromium } from 'playwright';
import sharp from 'sharp';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3000/us/city/sf/the-city?tiles=1', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 90000 });
await p.waitForTimeout(3000);
const box = await p.locator('.fx-city-tiles').boundingBox();
const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
const paper = async () => { const { data, info } = await sharp(await p.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true }); let n = 0; const tot = info.width * info.height; for (let i = 0; i < tot; i += 4) { const o = i * info.channels; if (Math.abs(data[o] - 0xec) < 6 && Math.abs(data[o + 1] - 0xe7) < 6 && Math.abs(data[o + 2] - 0xdc) < 6) n++; } return +(400 * n / tot).toFixed(1); };
for (const stop of ['District', 'Street', 'Whole city', 'A few streets']) {
  await p.getByRole('button', { name: stop, exact: true }).click();
  const seq = []; for (let i = 0; i < 8; i++) { seq.push(await paper()); await p.waitForTimeout(80); }
  console.log(stop.padEnd(14), 'paper% over 8 frames:', seq.join(' '));
}
/* a fast wheel burst, 6 big ticks in 200 ms */
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const seq = []; for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(30); seq.push(await paper()); } for (let i = 0; i < 6; i++) { await p.waitForTimeout(100); seq.push(await paper()); }
console.log('fast wheel in    paper%:', seq.join(' '));
await b.close();
