import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
p.setDefaultTimeout(90000);
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,240)));
p.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,200)); });
await p.goto('http://localhost:3000/us/city/sf/the-city-gl', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.fx-city-start', { timeout: 70000 });
await p.waitForTimeout(26000);
await p.locator('.fx-city-start').click(); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/bug-today.png` });
console.log('today', await p.evaluate(()=>JSON.stringify(globalThis.__cityGL.getStats())));
for (const y of [1950, 1906]) {
  await p.evaluate((y)=>globalThis.__cityGL.setYear(y), y);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/bug-${y}.png` });
  console.log(y, await p.evaluate(()=>JSON.stringify(globalThis.__cityGL.getStats())));
}
// what is actually in the scene and visible
console.log('scene', await p.evaluate(()=>{
  const e = globalThis.__cityGL;
  const byKind = {};
  for (const o of e.scene.children) {
    if (!o.isMesh && !o.isInstancedMesh) continue;
    const g = o.geometry;
    const k = o.isInstancedMesh ? 'instanced' : (g.attributes.aH ? 'building' : 'other');
    byKind[k] = byKind[k] ?? { n: 0, visible: 0, drawRangeZero: 0 };
    byKind[k].n++;
    if (o.visible) byKind[k].visible++;
    if (g.drawRange && g.drawRange.count === 0) byKind[k].drawRangeZero++;
  }
  return JSON.stringify(byKind);
}));
await b.close();
