/* a phone pinch, frame by frame, measuring paper per frame; and a slow scrub of years */
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-scrub', { timeout: 90000 }); await p.waitForTimeout(2500);
const st = await p.locator('.fx-city-stage').boundingBox();
const clip = { x: st.x, y: st.y, width: st.width, height: st.height };
const paper = async () => { const { data, info } = await sharp(await p.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true }); let n = 0; const tot = info.width * info.height; for (let i = 0; i < tot; i += 4) { const o = i * info.channels; if (Math.abs(data[o] - 0xec) < 6 && Math.abs(data[o + 1] - 0xe7) < 6 && Math.abs(data[o + 2] - 0xdc) < 6) n++; } return +(400 * n / tot).toFixed(1); };
/* pinch: drive the map like TouchZoom does, via the same private moves the wheel uses */
const seq = [];
await p.evaluate(() => { const m = window.__cityTiles.map; window.__pinch = { m, z0: m.getZoom(), c: m.getCenter() }; });
for (let i = 1; i <= 20; i++) {
  await p.evaluate((i) => { const { m, z0, c } = window.__pinch; if (i === 1) m._moveStart(true, false); m._move(c, z0 + i * 0.2); if (i === 20) m._moveEnd(true); }, i);
  await p.waitForTimeout(60); seq.push(await paper());
}
for (let i = 0; i < 6; i++) { await p.waitForTimeout(150); seq.push(await paper()); }
console.log('pinch in 1.3->5.3 paper% per frame:', seq.join(' '));
const seq2 = [];
for (let i = 1; i <= 20; i++) {
  await p.evaluate((i) => { const { m } = window.__pinch; const z = 5.3 - i * 0.2; if (i === 1) m._moveStart(true, false); m._move(m.getCenter(), z); if (i === 20) m._moveEnd(true); }, i);
  await p.waitForTimeout(60); seq2.push(await paper());
}
for (let i = 0; i < 6; i++) { await p.waitForTimeout(150); seq2.push(await paper()); }
console.log('pinch out 5.3->1.3 paper% per frame:', seq2.join(' '));
/* scrub years slowly at the district stop */
await p.getByRole('button', { name: 'District', exact: true }).tap(); await p.waitForTimeout(1500);
const seq3 = [];
for (const y of [1990, 1985, 1980, 1975, 1970, 1965]) { await p.evaluate((y) => { const el = document.querySelector('.fx-city-scrub'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(y)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, y); for (let k = 0; k < 4; k++) { await p.waitForTimeout(120); seq3.push(await paper()); } }
console.log('scrub years at district paper%:', seq3.join(' '));
await b.close();
