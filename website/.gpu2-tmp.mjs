import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU'] });
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,300)));
await p.goto('http://localhost:3000/us/city/sf/the-city-gl', { waitUntil:'domcontentloaded' });
await p.waitForFunction(() => !!globalThis.__cityGL, null, {timeout:180000});
await p.waitForTimeout(12000);
const data = await p.evaluate(async () => {
  const e = globalThis.__cityGL;
  // render, then snapshot within the same task so the front buffer is fresh
  await new Promise(r => requestAnimationFrame(() => { e.invalidate(); requestAnimationFrame(r); }));
  const c = document.querySelector('.fx-city-canvas');
  try { return c.toDataURL('image/png'); } catch (err) { return 'ERR ' + String(err); }
});
if (data.startsWith('data:image')) {
  writeFileSync(`${OUT}/gpu-todataurl.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('toDataURL ok, bytes', data.length);
} else console.log(data.slice(0,200));
await b.close();
