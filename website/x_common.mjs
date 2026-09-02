export const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';
export const REF = { cx: 241.427019126574, cy: 707.0567508859249, scale: 0.06898352692062097 };
export const ARGS = ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'];
export async function settle(p, quietMs = 4000) {
  await p.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 300000 });
  await p.waitForFunction((q) => {
    const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
    const now = performance.now();
    if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
    return window.__lastT !== undefined && now - window.__lastT > q;
  }, quietMs, { timeout: 600000, polling: 300 });
}
export const init = () => { try { performance.setResourceTimingBufferSize(5000); } catch {} };
export async function pose(p, step, k, year) {
  await p.evaluate(([s, kk, ref, y]) => { const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * kk }); e.setYear(y ?? undefined); e.invalidate(); }, [step, k, REF, year ?? null]);
  await p.waitForTimeout(1200);
  await p.evaluate(([s, kk, ref]) => { const e = window.__cityGL; e.setStep(s); e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * kk }); e.invalidate(); }, [step, k, REF]);
  await p.waitForTimeout(900);
}
export async function diff(a, b) {
  const sharp = (await import('sharp')).default;
  const A = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let d = 0, s = 0, m = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const v = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (v > 2) { d++; s += v; if (v > m) m = v; }
  }
  const px = A.info.width * A.info.height;
  return { pct: +(100 * d / px).toFixed(3), px: d, mean: d ? +(s / d).toFixed(1) : 0, max: m };
}
