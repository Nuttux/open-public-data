/* ═══════════════════════════════════════════════════════════════════════
   scripts/render-city-tiles.mjs — THE CITY, RENDERED ONCE, CUT INTO SQUARES.

   Drives the live GL page through a grid of cameras and writes a map-tile
   pyramid: 512-pixel WebP squares under public/tiles/<city>/<year>/<z>/<x>/<y>.
   A phone then shows the same picture the desktop model draws, for the cost
   of the ten squares on its screen — see the session's measurements: the
   model itself takes a phone 26 s and 1.2 GB.

   ── THE GEOMETRY OF THE PYRAMID ──────────────────────────────────────────
   Level 3 is the whole-city frame: the page's own settled camera, in a
   1280 x 768 CSS window at device ratio 2, so 2560 x 1536 device pixels =
   exactly 5 x 3 tiles. Every level doubles: level z is 5·2^(z-3) tiles wide
   and 3·2^(z-3) tall, captured as a 2^(z-3) x 2^(z-3) grid of windows, and
   each window is exactly 5 x 3 whole tiles, so no tile ever straddles two
   captures. Below level 3 the whole city fits in one window and the level's
   canvas is its centre.

   The projection is affine in the plane, so moving the camera by d screen
   pixels is moving it by d / scale plane units: a window's camera is read
   straight off its pixel position in the level's canvas.

   ── THE BAND FOLLOWS THE LEVEL, AS IT DOES ON THE DESKTOP ────────────────
   `controls.ts` §THE CUTS BELONG TO THE STOPS: the vertical exaggeration
   steps at 1.83x and 5.77x the whole-city fit. Level z is 2^(z-3) times the
   fit, so levels 0-3 are band 0, 4-5 band 1, 6-7 band 2 — the same steps a
   desktop reader crosses. The mobile page swaps tile sets at those two
   levels, which is the same discontinuity, in the same place.

   ── WITHOUT THE TYPE ─────────────────────────────────────────────────────
   `?labels=0` — `overlay.ts` §THE TILE RENDERER WANTS THE PICTURE WITHOUT
   THE WORDS. Baked labels are cut at capture edges and neighbouring captures
   disagree about which names win; the phone draws them live instead.

   usage: node scripts/render-city-tiles.mjs [--year 2026] [--zmax 7] [--out public/tiles/us/sf/city]
   needs the dev server on :3000 (the harness reaches the engine through
   `window.__cityGL`, which production does not expose).
   ═══════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
/* ONE BROWSER FOR MANY YEARS. Booting the page is ~15 s and a wide year is
   7 s of rendering, so a year per process was three parts boot to one part
   work. `--years 1906-1925,1950` renders each in turn on the one page; the
   engine's `setYear` is a draw-range gate, so switching costs nothing. */
const YEARS = (() => {
  const spec = arg('--years', '');
  if (!spec) return [arg('--year', 'now')];
  const out = [];
  for (const part of spec.split(',')) {
    const m = /^(\d{4})-(\d{4})$/.exec(part.trim());
    if (m) for (let y = Number(m[1]); y <= Number(m[2]); y++) out.push(String(y));
    else if (part.trim()) out.push(part.trim());
  }
  return out;
})();
const ZMAX = Number(arg('--zmax', 7));
const OUT_ROOT = path.resolve(arg('--out', 'public/tiles/us/sf/city'));
const BASE = arg('--base', 'http://localhost:3000');
const T = 512;                       // tile edge, device pixels
const CSS = { w: 1280, h: 768 };     // one capture window, CSS pixels — 5 x 3 tiles at dpr 2
const DPR = 2;
/* ONE ROW OF THE FRAME IS NOT THE PICTURE. MEASURED on the level-7 tiles:
   the first pixel row of every capture reads 62–80 where the rows under it
   read 93–102, and no other edge does it — the live page hides that row under
   the stage's 1 px top border. So the stage is rendered PAD px taller at each
   end, the camera stays centred, and the capture is the middle CSS.h rows. */
const PAD = 1;
/* the whole-city camera. `scale` is the page's own settled fit for a 1440-wide
   stage, narrowed to 1280 so the peninsula still fits the window. */
/* ON THE ENGINE'S OWN LADDER. `camera.ts` §snapCameraScale rounds every scale
   to 24 rungs a doubling before a frame is drawn, so a scale that is not on a
   rung is drawn at the nearest one — 0.9 % off here, which is 400 px of
   misalignment at the edges of level 7. The base is snapped once, and every
   level is an exact doubling of it, which is exactly 24 rungs. */
const rung = (s) => 2 ** (Math.round(Math.log2(s) * 24) / 24);
const REF = { cx: 241.427019126574, cy: 707.0567508859249, scale: rung(0.06898352692062097) };
const bandFor = (z) => { const k = 2 ** (z - 3); return k < 1.826 ? 0 : k < 5.77 ? 1 : 2; };
/* OUTSIDE THE LEVEL IS NOT A PICTURE. A level's canvas is `px` device pixels
   and its last column and row of tiles run past that edge (levels 0–2 are
   not multiples of 512). What the capture holds out there is the engine's
   far field and, further out, its clear colour after the grade — a grey the
   page's paper is not, and it showed as strips beyond the map: Daniel,
   *"small strips grey looks buggy of whats not on the map proper"*. So a
   tile is cut to the level's own extent and the rest is TRANSPARENT, and the
   stage's paper shows through, the same paper on both sides of the edge. */
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: CSS.w, height: 1200 }, deviceScaleFactor: DPR });
p.on('pageerror', (e) => console.error('PAGEERROR', e.message.slice(0, 160)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
/* `tilt=0&vig=0`: the tilt-shift softens the top and foot of each CAPTURE and
   the vignette darkens its corners, and a tile pyramid is many captures side
   by side — either one prints the capture grid onto the map. The grade is
   uniform over the frame and stays. */
await p.goto(`${BASE}/us/city/sf/the-city?labels=0&tilt=0&vig=0`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => !!window.__cityGL, null, { timeout: 300000 });
await p.waitForFunction(() => {
  const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !r.name.includes('/film/')).length;
  const now = performance.now();
  if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; }
  return window.__lastT !== undefined && now - window.__lastT > 4000;
}, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(6000); // the band warm-up

/* the stage exactly CSS.h tall, and nothing over it but the two canvases */
/* the stage carries a 1 px border top and bottom inside its box, so ask for
   the height, measure what the canvas actually got, and correct once */
/* The stage exactly CSS.h tall, borders off so the engine's own resize
   observer sees the same box the canvas has — its viewport must be exactly
   the capture window, or a capture covers 770 CSS px of plane while the
   camera steps by 768 and every row of tiles lands two pixels off. The page
   resizes the engine itself; a manual resize here fed it a different box and
   put the whole pyramid off-centre. */
/* A RULE, NOT A PASS: the film chrome and its cards mount against the shell
   seconds after boot (`CityGLFilmChrome` §SCAN_PRELOAD_DELAY_MS), long after
   a one-shot walk of the DOM has hidden what was there. `visibility` inherits
   but a child may override it, so the canvases stay while everything else in
   the shell — early or late — goes. The chrome's own scan canvas is a canvas
   too, hence the `display:none` on its root. */
await p.addStyleTag({ content: `.theme-fusion .fx-city-stage{height:${CSS.h + 2 * PAD}px !important;min-height:0 !important;border:0 !important}
.fx-city-shell *{visibility:hidden !important}
.fx-city-shell canvas{visibility:visible !important}
.fx-city-shell [data-citygl-film-chrome]{display:none !important}` });
await p.evaluate(() => {
  const gl = document.querySelector('canvas'); const stage = gl.parentElement;
  const keep = new Set(); let n = gl; while (n) { keep.add(n); n = n.parentElement; }
  for (const c of stage.querySelectorAll('canvas')) keep.add(c);
  for (const el of document.querySelectorAll('.fx-city-shell *')) if (!keep.has(el) && !(el instanceof HTMLCanvasElement)) el.style.visibility = 'hidden';
});
await p.waitForTimeout(1000);
const stageBox = await p.locator('canvas').first().boundingBox();
const vp = await p.evaluate(() => window.__cityGL.viewport);
if (Math.round(stageBox.width) !== CSS.w || Math.round(stageBox.height) !== CSS.h + 2 * PAD || vp.W !== CSS.w || vp.H !== CSS.h + 2 * PAD) {
  console.error('stage is', stageBox, 'engine viewport is', vp, 'wanted', { w: CSS.w, h: CSS.h + 2 * PAD }); process.exit(1);
}
/* the capture: the stage minus PAD rows top and bottom, still centred on the camera */
const box = { x: stageBox.x, y: stageBox.y + PAD, width: CSS.w, height: CSS.h };

const pose = async (cx, cy, scale, band) => {
  await p.evaluate(([cx, cy, scale, band]) => { const e = window.__cityGL; e.setStep(band); e.setCamera({ cx, cy, scale }); e.invalidate(); }, [cx, cy, scale, band]);
  await p.waitForTimeout(350);
  for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__cityGL.invalidate()); await p.waitForTimeout(120); }
  const got = await p.evaluate(() => ({ ...window.__cityGL.getCamera(), step: window.__cityGL.getStep(), vp: window.__cityGL.viewport }));
  if (Math.abs(got.cx - cx) > 1e-6 || Math.abs(got.cy - cy) > 1e-6 || Math.abs(got.scale / scale - 1) > 1e-9 || got.step !== band) {
    console.error('POSE MISMATCH wanted', { cx, cy, scale, band }, 'got', got);
  }
  if (process.env.TRACE) console.log('pose', JSON.stringify({ cx: +cx.toFixed(1), cy: +cy.toFixed(1), scale: +scale.toFixed(6), band, got: { cx: +got.cx.toFixed(1), cy: +got.cy.toFixed(1), scale: +got.scale.toFixed(6), step: got.step, vp: got.vp } }));
};

for (const YEAR of YEARS) {
const OUT = path.join(OUT_ROOT, YEAR);
await p.evaluate((y) => window.__cityGL.setYear(y === 'now' ? undefined : Number(y)), YEAR);
await p.waitForTimeout(400);
const index = { tile: T, dpr: DPR, ref: REF, levels: {} };
let total = 0, bytes = 0;
const t0 = Date.now();
for (let z = 0; z <= ZMAX; z++) {
  const band = bandFor(z);
  const scale = REF.scale * 2 ** (z - 3);
  const f = 2 ** (z - 3);
  const canvasW = Math.round(CSS.w * DPR * f), canvasH = Math.round(CSS.h * DPR * f);   // device px
  const nx = Math.ceil(canvasW / T), ny = Math.ceil(canvasH / T);
  index.levels[z] = { band, scale, tiles: [nx, ny], px: [canvasW, canvasH] };
  const dir = path.join(OUT, String(z)); fs.mkdirSync(dir, { recursive: true });
  const grid = z >= 3 ? 2 ** (z - 3) : 1;                    // captures per axis
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    /* the window's centre in the level canvas, CSS px, then its camera */
    const wcx = z >= 3 ? (i + 0.5) * CSS.w : (CSS.w * f) / 2;
    const wcy = z >= 3 ? (j + 0.5) * CSS.h : (CSS.h * f) / 2;
    const cx = REF.cx + (wcx - (CSS.w * f) / 2) / scale;
    const cy = REF.cy - (wcy - (CSS.h * f) / 2) / scale;
    await pose(cx, cy, scale, band);
    const shot = await p.screenshot({ clip: box, type: 'png' });
    if (process.env.TRACE) fs.writeFileSync(path.join(OUT, `capture-z${z}-${i}-${j}.png`), shot);
    /* where this capture sits in the level's device-pixel canvas */
    const ox = z >= 3 ? i * CSS.w * DPR : Math.round((CSS.w * DPR - canvasW) / 2) * -1;
    const oy = z >= 3 ? j * CSS.h * DPR : Math.round((CSS.h * DPR - canvasH) / 2) * -1;
    /* z < 3: the level canvas is the CENTRE of the one capture, so tile (0,0)
       starts at capture pixel -ox */
    const tx0 = z >= 3 ? (i * CSS.w * DPR) / T : 0, ty0 = z >= 3 ? (j * CSS.h * DPR) / T : 0;
    const tw = z >= 3 ? (CSS.w * DPR) / T : nx, th = z >= 3 ? (CSS.h * DPR) / T : ny;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      const X = tx0 + tx, Y = ty0 + ty;
      const left = z >= 3 ? tx * T : -ox + tx * T, top = z >= 3 ? ty * T : -oy + ty * T;
      /* what this tile may show: the capture, AND the level's own extent */
      const cw = Math.min(T, CSS.w * DPR - left, canvasW - X * T);
      const ch = Math.min(T, CSS.h * DPR - top, canvasH - Y * T);
      let img = sharp(shot).extract({ left, top, width: cw, height: ch });
      if (cw < T || ch < T) img = img.ensureAlpha().extend({ right: T - cw, bottom: T - ch, background: CLEAR });
      const buf = await img.webp({ quality: 82 }).toBuffer();
      const d = path.join(dir, String(X)); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${Y}.webp`), buf);
      total++; bytes += buf.length;
    }
  }
  console.log(`z${z}  band ${band}  ${nx}x${ny} tiles  ${grid * grid} captures  ${(bytes / 1048576).toFixed(1)} MB so far  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log(`${YEAR}: ${total} tiles, ${(bytes / 1048576).toFixed(1)} MB -> ${OUT}`);
}
await b.close();
