import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU'] });
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,300)));
p.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,220)); });
await p.goto('http://localhost:3000/us/city/sf/the-city-gl', { waitUntil:'domcontentloaded' });
await p.waitForFunction(() => !!globalThis.__cityGL, null, {timeout:180000});
await p.waitForTimeout(12000);
console.log('backend/stats', await p.evaluate(() => {
  const e = globalThis.__cityGL;
  return JSON.stringify({ backend: e.backend, hasWebGPU: !!navigator.gpu, ...e.getStats() });
}));
await p.screenshot({ path: `${OUT}/gpu-city.png` });
await b.close();
