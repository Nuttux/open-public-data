import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const b = await chromium.launch({ args:['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU'] });
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,300)));
p.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,200)); });
await p.goto('http://localhost:3000/us/city/sf/the-city-gl', { waitUntil:'domcontentloaded' });
await p.waitForFunction(() => !!globalThis.__cityGL, null, {timeout:180000});
await p.waitForTimeout(12000);
console.log('stops', await p.locator('.fx-city-preset').allTextContents());
// full page screenshot shows the 2D overlay (a normal canvas) even if the GPU one is blank
await p.screenshot({ path: `${OUT}/ov-full.png` });
// and the composite: GPU canvas + overlay, read from the page
const d = await p.evaluate(async () => {
  const e = globalThis.__cityGL;
  await new Promise(r => requestAnimationFrame(() => { e.invalidate(); requestAnimationFrame(r); }));
  const gpu = document.querySelector('.fx-city-canvas');
  const ov = document.querySelector('.fx-city-overlay-2d');
  const c = document.createElement('canvas');
  c.width = gpu.width; c.height = gpu.height;
  const g = c.getContext('2d');
  g.drawImage(gpu, 0, 0);
  g.drawImage(ov, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
});
writeFileSync(`${OUT}/ov-composite.png`, Buffer.from(d.split(',')[1],'base64'));
// try a drag and a zoom
await p.mouse.move(700, 400); await p.mouse.down(); await p.mouse.move(600, 340, {steps:8}); await p.mouse.up();
await p.mouse.wheel(0, -600);
await p.waitForTimeout(1500);
console.log('after gesture', await p.evaluate(() => JSON.stringify({ ...globalThis.__cityGL.getCamera(), step: globalThis.__cityGL.getStep() })));
await b.close();
