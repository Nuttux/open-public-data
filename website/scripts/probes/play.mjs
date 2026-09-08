/* Year play on a phone over 4G: how many tiles and bytes it pulls, how many years it actually shows, and paper during the run. */
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
const BASE = process.argv[2] || 'https://www.qipu.org';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, locale: 'en-US' });
const p = await ctx.newPage();
const tiles = []; p.on('response', (r) => { const u = r.url(); if (/\.webp/.test(u)) tiles.push({ u: u.replace(/.*\/city\//, ''), kb: Number(r.headers()['content-length'] || 0) / 1024, t: Date.now() }); });
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('.fx-city-stoprow', { timeout: 180000 }); await p.waitForTimeout(3000);
await p.getByRole('button', { name: 'District', exact: true }).tap(); await p.waitForTimeout(3000);
const st = await p.locator('.fx-city-stage').boundingBox(); const clip = { x: st.x, y: st.y, width: st.width, height: st.height };
const paper = async () => { const { data, info } = await sharp(await p.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true }); let n = 0; const tot = info.width * info.height; for (let i = 0; i < tot; i += 4) { const o = i * info.channels; if (Math.abs(data[o] - 0xec) < 6 && Math.abs(data[o + 1] - 0xe7) < 6 && Math.abs(data[o + 2] - 0xdc) < 6) n++; } return +(400 * n / tot).toFixed(1); };
const n0 = tiles.length; const t0 = Date.now();
await p.getByRole('button', { name: /Play/ }).tap();
const years = new Set(); const papers = [];
for (let i = 0; i < 20; i++) { await p.waitForTimeout(500); years.add(await p.evaluate(() => document.querySelector('.fx-city-year')?.textContent)); if (i % 4 === 0) papers.push(await paper()); }
await p.getByRole('button', { name: /Pause/ }).tap().catch(() => {});
const dur = (Date.now() - t0) / 1000;
const played = tiles.slice(n0); const kb = played.reduce((s, x) => s + x.kb, 0);
const perYear = {}; for (const x of played) { const y = x.u.split('/')[0]; perYear[y] = (perYear[y] || 0) + 1; }
const levels = {}; for (const x of played) { const l = x.u.split('/')[1]; levels[l] = (levels[l] || 0) + 1; }
console.log(`play ${dur.toFixed(1)} s at district: ${played.length} tiles, ${Math.round(kb)} kB (headers), ${Object.keys(perYear).length} year pyramids touched, years shown on the readout: ${years.size}`);
console.log('tiles per level:', JSON.stringify(levels), '| first 6 pyramids:', Object.entries(perYear).slice(0, 6).map(([y, n]) => `${y}:${n}`).join(' '));
console.log('paper% samples during play:', papers.join(' '));
const rate = await p.evaluate(() => 0); void rate;
await b.close();
