import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.goto('http://localhost:3100/en/usa/san-francisco/the-city?release=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => globalThis.__cityGL, null, { timeout: 300000 });
await p.waitForTimeout(8000);
console.log(await p.evaluate(() => { const e = globalThis.__cityGL; const r = [];
  for (const s of [0,1,2,3,4,5]) { try { e.setStep(s); r.push([s, e.zex(), e.descriptor.look.zexb]); } catch (x) { r.push([s, String(x)]); } }
  return JSON.stringify(r); }));
await b.close();
