/* frame-to-frame change during a year scrub and a flight: how hard does the picture jump? */
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-scrub', { timeout: 90000 }); await p.waitForTimeout(2500);
const st = await p.locator('.fx-city-stage').boundingBox();
const clip = { x: st.x, y: st.y, width: st.width, height: st.height };
let prev = null;
const jump = async () => { const { data } = await sharp(await p.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true }); let s = 0; if (prev) { for (let i = 0; i < data.length; i += 16) s += Math.abs(data[i] - prev[i]); s = s / (data.length / 16); } prev = data; return +s.toFixed(1); };
await p.getByRole('button', { name: 'District', exact: true }).tap(); await p.waitForTimeout(2000); await jump();
const a = [];
for (const y of [1990, 1985, 1980, 1975]) { await p.evaluate((y) => { const el = document.querySelector('.fx-city-scrub'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(y)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, y); for (let k = 0; k < 6; k++) { await p.waitForTimeout(100); a.push(await jump()); } }
console.log('year scrub, mean |Δ| per frame:', a.join(' '), ' peak', Math.max(...a));
const c = [];
await p.getByRole('button', { name: 'A few streets', exact: true }).tap(); for (let k = 0; k < 12; k++) { await p.waitForTimeout(100); c.push(await jump()); }
console.log('flight to a few streets:', c.join(' '), ' peak', Math.max(...c));
await b.close();
