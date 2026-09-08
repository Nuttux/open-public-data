import { webkit } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => {
  window.__bad = [];
  for (const fn of ['vertexAttribPointer', 'vertexAttribIPointer']) {
    const orig = WebGL2RenderingContext.prototype[fn];
    WebGL2RenderingContext.prototype[fn] = function (...a) { this.getError(); const r = orig.apply(this, a); const err = this.getError(); if (err !== 0 && window.__bad.length < 6) window.__bad.push({ fn, args: a.slice(0, 4), err, stack: new Error().stack.split('\n').slice(1, 5).map((l) => l.trim().slice(0, 90)) }); return r; };
  }
});
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__cityGL && !document.querySelector('.fx-city-loading'), null, { timeout: 180000 });
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => window.__bad), null, 1));
await b.close();
