/* §THE COPY THE GPU ALREADY HAS — A/B: heap and pixels with the release on and off. */
import { chromium } from 'playwright';
import { ARGS, REF, OUT, init, diff } from './x_common.mjs';
const BASE = process.argv[2] || 'http://localhost:3000';
const POSES = [['whole', 0, 1, null], ['district', 1, 4, null], ['street', 2, 30, null], ['street1950', 2, 30, 1950], ['district1930', 1, 4, 1930]];
const run = async (q) => {
  const b = await chromium.launch({ args: ARGS });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.addInitScript(init);
  await p.goto(`${BASE}/us/city/sf/the-city${q}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
  await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = performance.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
  await p.waitForTimeout(8000);
  /* give the release its scans: frames */
  for (let i = 0; i < 4; i++) { for (const [, s, k, y] of POSES) { await p.evaluate(([s, k, ref, y]) => { const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k }); e.setYear(y ?? undefined); e.invalidate(); }, [s, k, REF, y]); await p.waitForTimeout(400); } }
  await p.waitForTimeout(2000);
  const shots = {};
  for (const [name, s, k, y] of POSES) {
    await p.evaluate(([s, k, ref, y]) => { const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k }); e.setYear(y ?? undefined); e.invalidate(); }, [s, k, REF, y]);
    await p.waitForTimeout(1500);
    const box = await p.locator('canvas').first().boundingBox();
    shots[name] = `${OUT}/rel-${q.replace(/[^a-z0-9]/g, '') || 'on'}-${Math.random().toString(36).slice(2, 6)}-${name}.png`;
    await p.screenshot({ path: shots[name], clip: box });
  }
  const m = await p.evaluate(() => { const e = window.__cityGL; let held = 0; const seen = new Set(); e.scene.traverse((o) => { const g = o.geometry; if (!g) return; for (const a of [...Object.values(g.attributes), g.index].filter(Boolean)) { if (seen.has(a)) continue; seen.add(a); held += a.array.byteLength; } }); return { heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), arraysMB: Math.round(held / 1048576), releasedMB: Math.round((e.releasedCpuBytes ?? 0) / 1048576), hasRelease: 'releasedCpuBytes' in e, stats: e.getStats() }; });
  await b.close();
  return { m, shots, errs };
};
const off = await run(process.argv[3] ?? '?release=0');
const on = await run(process.argv[4] ?? '');
console.log('release OFF', JSON.stringify(off.m), off.errs.length ? off.errs : '');
console.log('release ON ', JSON.stringify(on.m), on.errs.length ? on.errs : '');
for (const name of Object.keys(off.shots)) console.log('  pixels', name.padEnd(13), JSON.stringify(await diff(off.shots[name], on.shots[name])));
