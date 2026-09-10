import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${process.env.BASE}/us/city/sf/the-city?block=1701&probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-panel a[href]', { timeout: 120000 });
await p.waitForTimeout(2000);
const links = await p.$$eval('.fx-city-panel a[href]', (as) => as.map((a) => ({ t: a.innerText.slice(0, 55).replace(/\n/g, ' '), h: a.href })).filter((x) => /legistar|sfbos|archive/.test(x.h)).slice(0, 4));
for (const l of links) console.log(' •', l.t, '\n   ', l.h);
await b.close();
