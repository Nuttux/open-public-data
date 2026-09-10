/* Do the new meetings show on the map, with their line and a link that opens? */
import { chromium } from 'playwright';
const BASE = process.env.BASE;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/us/city/sf/the-city?block=1701&probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-panel', { timeout: 120000 });
await p.waitForTimeout(2500);
const txt = await p.$eval('.fx-city-ledger', (e) => e.innerText);
console.log('LEDGER:', txt.slice(0, 700).replace(/\n+/g, ' | '));
// open the newest decade and read the first rows + their links
const dec = await p.$('.fx-city-panel details.fx-block-row summary');
if (dec) { await dec.click(); await p.waitForTimeout(900); }
const shelf = await p.$$eval('.fx-city-panel .fx-shelf-row', (els) => els.slice(0, 4).map((e) => ({
  says: e.querySelector('.fx-shelf-says')?.innerText?.slice(0, 80),
  title: e.querySelector('.fx-shelf-title')?.innerText?.slice(0, 60),
  href: e.querySelector('a')?.href?.slice(0, 90),
  src: e.querySelector('.fx-shelf-source')?.innerText?.slice(0, 50),
})));
for (const s of shelf) console.log(' •', s.says, '\n   ', s.title, '\n   ', s.src, '\n   ', s.href);
await b.close();
