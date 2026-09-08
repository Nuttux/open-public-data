/* The city page in the three engines: which backend comes up, does it boot,
   what errors. Desktop GL page + phone tile page.  BASE=... node x_browsers.mjs */
import { chromium, firefox, webkit } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const engines = [['chromium', chromium, { args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] }], ['webkit', webkit, {}], ['firefox', firefox, {}]];
for (const [name, eng, opts] of engines) {
  let b;
  try { b = await eng.launch(opts); } catch (e) { console.log(name, 'launch failed', String(e).slice(0, 120)); continue; }
  // desktop
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
    const t0 = Date.now();
    let ready = null, info = null;
    try {
      await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => window.__cityGL && window.__cityGL.getStats().frames > 3, null, { timeout: 120000 });
      ready = Date.now() - t0;
      await p.waitForTimeout(3000);
      info = await p.evaluate(() => { const e = window.__cityGL; let meshes = 0; e.scene.traverse((o) => { if (o.isMesh) meshes++; }); return { backend: e.backend, tier: e.quality.tier, meshes, frames: e.getStats().frames, webgpu: 'gpu' in navigator, loadingText: document.querySelector('.fx-city-loading')?.textContent ?? null }; });
    } catch (e) { errs.push('probe: ' + String(e).slice(0, 140)); }
    console.log(`${name} desktop: ready ${ready} ms`, JSON.stringify(info), errs.length ? '\n   errors: ' + [...new Set(errs)].slice(0, 5).join('\n   ') : '');
    await p.close();
  }
  // phone
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: name !== 'firefox', hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
    const t0 = Date.now(); let info = null;
    try {
      await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForSelector('.fx-city-stoprow', { timeout: 90000 });
      const ready = Date.now() - t0;
      await p.waitForTimeout(2500);
      info = await p.evaluate(() => ({ tiles: document.querySelectorAll('.leaflet-tile-loaded').length, filmrow: !!document.querySelector('.fx-city-filmrow'), find: !!document.querySelector('.fx-city-find-btn'), stage: document.querySelector('.fx-city-stage')?.getBoundingClientRect().height ?? null }));
      info.ready = ready;
    } catch (e) { errs.push('probe: ' + String(e).slice(0, 140)); }
    console.log(`${name} phone:`, JSON.stringify(info), errs.length ? '\n   errors: ' + [...new Set(errs)].slice(0, 5).join('\n   ') : '');
    await ctx.close();
  }
  await b.close();
}
