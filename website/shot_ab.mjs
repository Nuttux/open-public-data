/* Screenshot the city at three cameras, for an A/B pixel diff.
   usage: node shot_ab.mjs <tag> */
import { chromium } from 'playwright';
const TAG = process.argv[2] || 'x';
const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/3dcc95ea-65a8-4d0d-83f6-9cd30ef6de56/scratchpad';

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 180000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 300000, polling: 300 });
await p.waitForTimeout(2500);

/* ABSOLUTE, not a multiple of whatever the camera happened to be at when the
   harness looked. The fit runs asynchronously, so `getCamera()` answers a
   different scale depending on how fast the boot went — which is exactly the
   thing under test, and it made a faster build look like a rendering change.
   These three are one settled reading of the whole-city camera, times the
   ladder. */
const REF = { cx: 241.427019126574, cy: 707.0567508859249, scale: 0.06898352692062097 };
/* the fourth is the WAVE mid-flight, and it is the one the shader change has
   to answer for: a fractional year puts a cohort part-way up, which is the
   only state in which `rise.ts`'s position node is doing anything other than
   passing the baked height through. Driven by a number and not by the clock,
   so both runs land on the same frame. */
/* CITY LAST. The whole-city shot was the one that came back different on
   identical code — 7.22 %, the same 54,5xx pixels every time — and it was
   always the FIRST shot of the run: the label sheet placed for the page's own
   settled camera was still on hand and being scaled, and a run that happened
   to get one more frame re-placed it while another did not. Shot last, the
   camera has been posed and re-posed three times before it and the sheet has
   been re-placed for a different scale in between. */
const CAMS = [
  { name: 'district', step: 1, k: 3.3, year: undefined },
  { name: 'street', step: 2, k: 12, year: undefined },
  { name: 'wave', step: 1, k: 3.3, year: 1930.45 },
  { name: 'city', step: 0, k: 1, year: undefined },
];
/* The camera is asserted TWICE with a wait between. The page re-fits itself
   from a ResizeObserver and from its own boot, either of which can land after
   the harness has posed the camera and quietly reframe the shot — which is
   not a rendering difference but reads as a 7 % pixel diff, and did. */
const pose = async (c) => {
  await p.evaluate(([k, step, ref, year]) => {
    const e = window.__cityGL;
    e.setStep(step);
    e.setCamera({ cx: ref.cx, cy: ref.cy, scale: ref.scale * k });
    e.setYear(year ?? undefined);
    e.invalidate();
  }, [c.k, c.step, REF, c.year ?? null]);
};
/* One throwaway pose before the first real one. The page re-fits itself from
   its own boot and from a ResizeObserver, and whichever of those lands last
   was landing ON the first shot of the run — reframing it, which reads as a
   7 % pixel difference that is not a rendering difference at all. */
await pose(CAMS[0]);
await p.waitForTimeout(2500);

/* SELF-CHECKING. Each camera is shot twice with frames in between, and the
   two are compared; a run that cannot reproduce its own frame says so rather
   than handing a phantom difference to the A/B. */
const { default: sharp } = await import('sharp');
const same = async (a, b) => {
  const A = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let d = 0; for (let i = 0; i < A.data.length; i += 4) { if (Math.abs(A.data[i] - B.data[i]) > 2 || Math.abs(A.data[i + 1] - B.data[i + 1]) > 2 || Math.abs(A.data[i + 2] - B.data[i + 2]) > 2) d++; }
  return d;
};
await p.waitForTimeout(5000); // the band warm-up runs after the boot tail; let it finish before posing
const frames = async (n) => { for (let i = 0; i < n; i++) { await p.evaluate(() => window.__cityGL.invalidate()); await p.waitForTimeout(160); } };
for (const c of CAMS) {
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    await pose(c); await p.waitForTimeout(800); await pose(c); await frames(6);
    await p.locator('canvas').first().screenshot({ path: `${OUT}/ab-${TAG}-${c.name}.png` });
    await frames(3);
    await p.locator('canvas').first().screenshot({ path: `${OUT}/ab-${TAG}-${c.name}-chk.png` });
    const d = await same(`${OUT}/ab-${TAG}-${c.name}.png`, `${OUT}/ab-${TAG}-${c.name}-chk.png`);
    ok = d <= 4;
    if (!ok) console.log(`UNSTABLE ${c.name} attempt ${attempt}: ${d} px differ between two frames of the same camera`);
  }
  const st = await p.evaluate(() => ({ cam: window.__cityGL.getCamera(), step: window.__cityGL.getStep(), year: window.__cityGL.getYear() ?? null }));
  console.log(c.name, ok ? 'stable' : 'UNSTABLE', JSON.stringify(st));
}
console.log('shot', TAG);
await b.close();
