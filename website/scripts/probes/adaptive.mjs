/* Does the engine step down on a slow GPU? A 6x CPU throttle stands in for
   one: the frames the camera drive produces fall past SLOW_FRAME_MS. Then
   the same drive with no throttle must NOT step down.
   BASE=... node x_adaptive.mjs */
import { chromium } from 'playwright';
import { ARGS, REF, init } from './x_common.mjs';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: [...ARGS] });
for (const rate of [6, 1]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.addInitScript(init);
  await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => !!window.__cityGL && window.__cityGL.adaptive.on, null, { timeout: 300000 });
  await p.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const drive = (n) => p.evaluate(async ([ref, n]) => {
    const e = window.__cityGL; const before = { ...e.adaptive }; const deltas = []; let last = performance.now(); let i = 0;
    await new Promise((done) => { const step = (t) => { deltas.push(t - last); last = t; i++; e.setCamera({ cx: ref.cx + i * 0.5, cy: ref.cy, scale: ref.scale * (1 + 0.1 * Math.sin(i / 25)) }); e.invalidate(); if (i < n) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
    deltas.splice(0, 5); deltas.sort((a, b) => a - b);
    return { before: before.rung, medianBefore: before.medianMs, fpsMedian: Math.round(1000 / deltas[Math.floor(deltas.length / 2)]), after: { ...e.adaptive }, castShadow: (() => { let n = 0, t = 0; e.scene.traverse((o) => { if (o.isMesh && o.userData.layer === 'buildings') { t++; if (o.castShadow) n++; } }); return `${n}/${t}`; })(), shadowMap: e.renderer.shadowMap.enabled };
  }, [REF, n]);
  const a = await drive(60); const b2 = await drive(60); const c = await drive(120);
  console.log(`throttle ${rate}x:`, JSON.stringify({ first: a, second: b2, third: c }));
  await ctx.close();
}
await b.close();
