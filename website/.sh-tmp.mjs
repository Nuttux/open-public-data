import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const OUT = process.argv[2];
const b = await chromium.launch({ args:['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU'] });
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,300)));
await p.goto('http://localhost:3000/us/city/sf/the-city-gl', { waitUntil:'domcontentloaded' });
await p.waitForFunction(() => !!globalThis.__cityGL, null, {timeout:180000});
await p.waitForTimeout(11000);
await p.evaluate(() => {
  const e = globalThis.__cityGL, pr = globalThis.__cityGLProj;
  e.setStep(2);
  const c0=[3256,3339]; const c=pr.proj(c0[0],c0[1],0);
  const across = pr.proj(c0[0]+420,c0[1],0)[0]-pr.proj(c0[0],c0[1],0)[0];
  e.setCamera({cx:c[0],cy:c[1],scale:(e.viewport.W*0.94)/Math.abs(across)});
});
await p.waitForTimeout(2500);
const grab = async (name) => {
  const d = await p.evaluate(async () => {
    const e = globalThis.__cityGL;
    await new Promise(r => requestAnimationFrame(() => { e.invalidate(); requestAnimationFrame(r); }));
    return document.querySelector('.fx-city-canvas').toDataURL('image/png');
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(d.split(',')[1],'base64'));
};
await grab('shON');
console.log('ON  stats', await p.evaluate(() => JSON.stringify(globalThis.__cityGL.getStats())));
await p.evaluate(() => { const e = globalThis.__cityGL; e.sun.setEnabled(false); e.invalidate(); });
await p.waitForTimeout(2500);
await grab('shOFF');
console.log('OFF stats', await p.evaluate(() => JSON.stringify(globalThis.__cityGL.getStats())));
await b.close();
