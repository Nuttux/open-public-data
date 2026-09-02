/* Three real renders of the city at the ladder's three cameras, chrome hidden,
   at device ratio 2 — the raw material for a tile pyramid. */
import { chromium } from 'playwright';
import { OUT, ARGS, REF, settle, init } from './x_common.mjs';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.addInitScript(init);
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await settle(p); await p.waitForTimeout(5000);
// hide everything over the stage that is not a canvas: buttons, search, strip, panel
await p.evaluate(() => {
  const gl = document.querySelector('canvas'); const stage = gl.parentElement;
  const keep = new Set(); let n = gl; while (n) { keep.add(n); n = n.parentElement; }
  for (const c of stage.querySelectorAll('canvas')) keep.add(c);
  for (const el of document.querySelectorAll('.fx-city-shell *')) {
    if (!keep.has(el) && !(el instanceof HTMLCanvasElement)) el.style.visibility = 'hidden';
  }
});
const frames = async (n) => { for (let i = 0; i < n; i++) { await p.evaluate(() => window.__cityGL.invalidate()); await p.waitForTimeout(160); } };
for (const [nm, step, k] of [['wide', 0, 1], ['district', 1, 3.3], ['street', 2, 12]]) {
  for (let t = 0; t < 2; t++) {
    await p.evaluate(([s, kk, ref]) => { const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * kk }); e.setYear(undefined); e.invalidate(); }, [step, k, REF]);
    await p.waitForTimeout(900);
  }
  await frames(6);
  const box = await p.locator('canvas').first().boundingBox();
  await p.screenshot({ path: `${OUT}/tile-src-${nm}.png`, clip: box });
  console.log(nm, JSON.stringify(box));
}
await b.close();
