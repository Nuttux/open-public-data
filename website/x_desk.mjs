import { chromium } from 'playwright';
import sharp from 'sharp';
const SCR = process.env.SCR;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto('http://localhost:3000/us/city/sf/the-city?tiles=1', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-tiles.leaflet-container', { timeout: 60000 });
await p.waitForSelector('.fx-city-controls', { timeout: 60000 });
await p.waitForTimeout(3000);
const box = await p.locator('.fx-city-tiles').boundingBox();
const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
await p.screenshot({ path: `${SCR}/d-landing.png`, clip });
const zoomOf = () => p.evaluate(() => { const t = document.querySelector('.leaflet-tile'); return t ? t.src.replace(/.*now\//, '') : 'none'; });
const paper = async (buf) => { const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }); let n = 0; const tot = info.width * info.height; for (let i = 0; i < tot; i++) { const o = i * info.channels; if (Math.abs(data[o] - 0xec) < 6 && Math.abs(data[o + 1] - 0xe7) < 6 && Math.abs(data[o + 2] - 0xdc) < 6) n++; } return +(100 * n / tot).toFixed(1); };
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
console.log('landing tile sample', await zoomOf(), 'paper%', await paper(await p.screenshot({ clip })));
/* zoom in with 10 trackpad-like small ticks, sample mid-gesture, then settle */
let maxPaper = 0;
for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, -40); await p.waitForTimeout(30); maxPaper = Math.max(maxPaper, await paper(await p.screenshot({ clip }))); }
await p.waitForTimeout(600);
console.log('after 10 small ticks in:', await zoomOf(), 'max paper% during', maxPaper);
await p.screenshot({ path: `${SCR}/d-in.png`, clip });
for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 60); await p.waitForTimeout(30); maxPaper = Math.max(maxPaper, await paper(await p.screenshot({ clip }))); }
await p.waitForTimeout(800);
console.log('after 25 ticks out:', await zoomOf(), 'max paper% during', maxPaper);
await p.screenshot({ path: `${SCR}/d-out.png`, clip });
console.log('errors', errs.length ? errs : 'none');
await b.close();
