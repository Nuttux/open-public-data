/* When does a click on the city first open a record? */
import { chromium } from 'playwright';
const BASE = process.env.BASE;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stage canvas', { timeout: 60000 });
const x = await p.$('.fx-city-strip-x'); if (x) await x.click().catch(() => {});
const box = await (await p.$('.fx-city-stage')).boundingBox();
for (let i = 0; i < 24; i++) {
  await p.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await p.waitForTimeout(700);
  const panel = await p.$('.fx-city-panel');
  const frames = await p.evaluate(() => window.__cityGL?.getStats ? window.__cityGL.getStats().frames : -1);
  if (panel) {
    const title = await p.$eval('.fx-city-panel-title', (e) => e.innerText).catch(() => '?');
    console.log(`click answered at ${Date.now() - t0} ms (frames ${frames}) → ${title}`);
    break;
  }
  if (i % 3 === 0) console.log(`  ${Date.now() - t0} ms: no answer yet (frames ${frames})`);
  await p.waitForTimeout(500);
}
await b.close();
