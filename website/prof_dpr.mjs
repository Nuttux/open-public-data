/* Steady-state frame cost while DRAGGING (no band change), at dpr 1 and dpr 2.
   Answers: is the picture itself expensive, or only the band change?
   usage: node prof_dpr.mjs [baseUrl] */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });

for (const dpr of [1, 2]) {
  for (const band of ['city', 'street']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
    await p.addInitScript(() => {
      try { performance.setResourceTimingBufferSize(5000); } catch {}
      window.__f = []; let last = performance.now();
      const t = (n) => { window.__f.push(+(n - last).toFixed(2)); last = n; requestAnimationFrame(t); };
      requestAnimationFrame(t);
    });
    await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 180000 });
    await p.waitForFunction(() => {
      const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
      const now = performance.now();
      if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
      return window.__lastT !== undefined && now - window.__lastT > 4000;
    }, null, { timeout: 300000, polling: 300 });
    await p.waitForTimeout(1500);

    const r = await p.evaluate(async (band) => {
      const gl = document.querySelector('canvas');
      const bb = gl.getBoundingClientRect();
      const cx = bb.left + bb.width / 2, cy = bb.top + bb.height / 2;
      // get into the band and let it settle, so warm-up is not in the sample
      if (band === 'street') {
        for (let i = 0; i < 26; i++) {
          gl.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
          await new Promise((res) => setTimeout(res, 60));
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
      // drag: pure camera translation, no band change, no new geometry
      window.__f.length = 0;
      const down = (x, y) => gl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }));
      const move = (x, y) => gl.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
      const up = (x, y) => gl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
      gl.setPointerCapture = () => {};
      down(cx, cy);
      for (let i = 0; i < 90; i++) { move(cx + Math.sin(i / 9) * 200, cy + Math.cos(i / 11) * 120); await new Promise((r2) => setTimeout(r2, 16)); }
      up(cx, cy);
      await new Promise((r2) => setTimeout(r2, 200));
      const f = window.__f.slice(2).sort((a, x) => a - x);
      const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))];
      return { n: f.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: f[f.length - 1] };
    }, band);
    console.log(`dpr ${dpr}  ${band.padEnd(7)}  frames n=${r.n}  p50=${r.p50}ms  p90=${r.p90}ms  p99=${r.p99}ms  max=${r.max}ms`);
    await p.close();
  }
}
await b.close();
