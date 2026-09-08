/* the same three cameras in two engines, for a diff of what one does not draw */
import { chromium, webkit } from 'playwright';
import { ARGS, REF } from './x_common.mjs';
const BASE = process.env.BASE || 'http://localhost:3007';
const OUT = process.env.OUT;
for (const [name, eng, opts] of [['chromium', chromium, { args: ARGS }], ['webkit', webkit, {}]]) {
  const b = await eng.launch(opts);
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__cityGL && !document.querySelector('.fx-city-loading'), null, { timeout: 180000 });
  await p.waitForTimeout(6000);
  for (const [cam, s, k] of [['district', 1, 4], ['street', 2, 30]]) {
    await p.evaluate(async ([ref, s, k]) => { const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k }); e.invalidate(); await new Promise((r) => setTimeout(r, 2500)); e.renderNow(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, [REF, s, k]);
    await p.screenshot({ path: `${OUT}/${name}-${cam}.jpg`, type: 'jpeg', quality: 85, clip: { x: 0, y: 200, width: 1144, height: 555 } });
  }
  await b.close();
}
