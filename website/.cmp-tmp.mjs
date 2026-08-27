import { chromium } from 'playwright';
const OUT = process.argv[2];
for (const [tag, url, args] of [
  ['webgpu', 'http://localhost:3000/us/city/sf/the-city-gl', ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU']],
  ['webgl', 'http://localhost:3000/us/city/sf/the-city-gl?gl=1', []],
  ['nowebgpu', 'http://localhost:3000/us/city/sf/the-city-gl', []],
]) {
  const b = await chromium.launch({ args });
  const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  p.on('pageerror', e => console.log(tag,'PAGEERR', String(e).slice(0,200)));
  await p.goto(url, { waitUntil:'domcontentloaded' });
  try { await p.waitForFunction(() => !!globalThis.__cityGL, null, {timeout:120000}); } catch { console.log(tag, 'no engine'); await b.close(); continue; }
  await p.waitForTimeout(20000);
  const info = await p.evaluate(() => JSON.stringify({ backend: globalThis.__cityGL.backend, hasGPU: !!navigator.gpu, ...globalThis.__cityGL.getStats() }));
  console.log(tag, info);
  await p.screenshot({ path: `${OUT}/cmp-${tag}.png` });
  await b.close();
}
