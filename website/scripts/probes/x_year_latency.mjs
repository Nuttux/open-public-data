/* Moving through time: what a year step costs, and what the heap does. */
import { chromium } from 'playwright';
import sharp from 'sharp';
const BASE = process.env.BASE;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__cityGL?.getStats && window.__cityGL.getStats().frames > 5, null, { timeout: 120000 });
await p.waitForTimeout(2500);
const x = await p.$('.fx-city-strip-x'); if (x) await x.click().catch(() => {});
const heap = () => p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
console.log('heap after boot:', await heap(), 'MB');
const shoot = () => p.locator('.fx-city-stage').first().screenshot({ type: 'jpeg', quality: 40 });
const settleAfter = async (fn) => {
  const t = Date.now(); await fn();
  let prev = null, q = 0;
  for (let i = 0; i < 40; i++) {
    const small = await sharp(await shoot()).resize(140, null).greyscale().raw().toBuffer();
    if (prev) { let d = 0; for (let k = 0; k < small.length; k++) d += Math.abs(small[k] - prev[k]);
      if (d / small.length / 255 < 0.004) { q++; if (q >= 2) return Date.now() - t; } else q = 0; }
    prev = small; await p.waitForTimeout(120);
  }
  return null;
};
const setYear = (y) => p.evaluate((yy) => {
  const s = document.querySelector('.fx-city-scrub');
  if (!s) return;
  s.value = String(yy);
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
}, y);
for (const y of [1950, 1951, 1952, 1975, 1906, 2026]) {
  const ms = await settleAfter(() => setYear(y));
  console.log(`  year ${y}: settled in ${ms ?? '>5000'} ms   heap ${await heap()} MB`);
}
/* a drag: twenty years in a row, as a thumb would */
const t = Date.now();
for (let y = 1930; y <= 1950; y++) { await setYear(y); await p.waitForTimeout(60); }
console.log(`  dragging 1930→1950 (21 steps): ${Date.now() - t} ms, heap ${await heap()} MB`);
await b.close();
