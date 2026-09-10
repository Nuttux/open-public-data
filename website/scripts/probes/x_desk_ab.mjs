/* DESKTOP A/B — the GPU model against the pre-rendered pyramid, same page,
   same size, same network. What a reader feels (when the city appears, when
   it stops moving), what it costs (bytes on the wire, JS heap), and how sharp
   each stop is (stdev of a Laplacian — higher is more detail).
   BASE=https://www.qipu.org OUT=/tmp node scripts/probes/x_desk_ab.mjs */
import { chromium } from 'playwright';
import sharp from 'sharp';
const BASE = process.env.BASE, OUT = process.env.OUT;
const STOPS = ['Whole city', 'District', 'A few streets', 'Street'];

const lap = async (buf) => (await sharp(buf).greyscale()
  .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] }).stats()).channels[0].stdev;

async function run(mode) {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
  const t0 = Date.now();
  await p.goto(`${BASE}/us/city/sf/the-city?probe=1&tiles=${mode === 'tiles' ? 1 : 0}`, { waitUntil: 'domcontentloaded' });
  const shoot = async () => {
    for (let t = 0; t < 6; t++) {
      try { return await p.locator('.fx-city-stage').first().screenshot({ type: 'jpeg', quality: 40 }); }
      catch { await p.waitForTimeout(200); }
    }
    return null;
  };
  const settle = async (limit = 100, gap = 250) => {
    let prev = null, appeared = 0, q = 0;
    for (let i = 0; i < limit; i++) {
      const shot = await shoot();
      if (!shot) { await p.waitForTimeout(gap); continue; }
      const small = await sharp(shot).resize(180, null).greyscale().raw().toBuffer();
      if (prev) {
        let d = 0; for (let k = 0; k < small.length; k++) d += Math.abs(small[k] - prev[k]);
        const pct = d / small.length / 255;
        if (!appeared && pct > 0.02) appeared = Date.now() - t0;
        if (pct < 0.004) { q++; if (q >= 3) return { appeared, done: Date.now() - t0 }; } else q = 0;
      }
      prev = small;
      await p.waitForTimeout(gap);
    }
    return { appeared, done: null };
  };
  const boot = await settle();
  /* the model says when it is really drawing; the pyramid has no engine */
  const glReady = mode === 'gl'
    ? await p.waitForFunction(() => window.__cityGL?.getStats && window.__cityGL.getStats().frames > 5, null, { timeout: 90000 })
        .then(() => Date.now() - t0).catch(() => null)
    : null;
  await p.waitForSelector('.fx-city-controls .fx-city-preset, .fx-city-stoprow button', { timeout: 120000 }).catch(() => {});
  const strip = await p.$('.fx-city-strip-x'); if (strip) await strip.click().catch(() => {});
  await p.waitForTimeout(1200);
  const bootBytes = bytes;
  const heap = await p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));

  const perStop = [];
  for (const label of STOPS) {
    let btn = await p.$(`.fx-city-controls .fx-city-preset:text-is("${label}")`);
    if (!btn) btn = await p.$(`.fx-city-stoprow button:text-is("${label}")`);
    if (!btn) { perStop.push([label, null, null]); continue; }
    const before = bytes, ts = Date.now();
    await btn.click();
    let prev = null, q = 0, st = null;
    for (let i = 0; i < 50; i++) {
      const shot = await shoot(); if (!shot) { await p.waitForTimeout(200); continue; }
      const small = await sharp(shot).resize(180, null).greyscale().raw().toBuffer();
      if (prev) { let d = 0; for (let k = 0; k < small.length; k++) d += Math.abs(small[k] - prev[k]);
        if (d / small.length / 255 < 0.004) { q++; if (q >= 3) { st = Date.now() - ts; break; } } else q = 0; }
      prev = small; await p.waitForTimeout(200);
    }
    const shot = await p.locator('.fx-city-stage').first().screenshot({ type: 'png' });
    await sharp(shot).jpeg({ quality: 82 }).toFile(`${OUT}/ab-${mode}-${label.replace(/\s+/g, '-')}.jpg`);
    perStop.push([label, st, (await lap(shot)).toFixed(1), ((bytes - before) / 1e6).toFixed(1)]);
  }
  /* a past year: the model rebuilds geometry, the pyramid swaps pyramids */
  const yb = bytes, ty = Date.now();
  await p.evaluate(() => {
    const s = document.querySelector('.fx-city-scrub');
    if (s) { s.value = '1950'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  const yr = await settle(40, 200);
  const year = { ms: yr.done ? Date.now() - ty : null, mb: ((bytes - yb) / 1e6).toFixed(1) };
  const shot = await p.locator('.fx-city-stage').first().screenshot({ type: 'png' });
  await sharp(shot).jpeg({ quality: 82 }).toFile(`${OUT}/ab-${mode}-1950.jpg`);
  const yearSharp = (await lap(shot)).toFixed(1);
  await b.close();
  return { mode, boot, glReady, bootBytes, heap, perStop, year, yearSharp };
}

for (const mode of ['gl', 'tiles']) {
  const r = await run(mode);
  console.log(`\n=== ${r.mode.toUpperCase()} ===`);
  console.log(`  city appears ${r.boot.appeared} ms · stops moving ${r.boot.done} ms` + (r.glReady ? ` · model drawing ${r.glReady} ms` : ''));
  console.log(`  ${(r.bootBytes / 1e6).toFixed(1)} MB on the wire to boot · JS heap ${r.heap} MB`);
  for (const [l, st, s_, mb] of r.perStop) console.log(`  ${l.padEnd(15)} ${String(st ?? '—').padStart(5)} ms  ${String(mb ?? '—').padStart(5)} MB  detail ${s_ ?? '—'}`);
  console.log(`  1950            ${String(r.year.ms ?? '—').padStart(5)} ms  ${r.year.mb.padStart(5)} MB  detail ${r.yearSharp}`);
}
