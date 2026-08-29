/**
 * terrain.ts — the DEM, the hillshade, the aerial fade.
 *
 * Block P3. Ported from `scratchpad/sf-city-anim/gen/part3.html`
 * (§THE GROUND CHECKERBOARD, §THE HILL OVER THE VALLEY, §BLOCK WARMTH,
 * §BLOCK RES) together with `world/BLOCK-W.md`, `warmth/BLOCK-WARMTH.md`
 * and `paint/BLOCK-PAINT.md`.
 *
 * This module is the bottom of the paint order, so it also owns the two
 * things every other draw module needs and nothing else can sensibly hold:
 * the `Frame` (what one paint of one canvas is) and the colour arithmetic
 * (`shade`, `skylit`, `skylitN`, `lerpHex`, `rgbHex`). Those are not
 * "terrain" in the map sense; they are here because the ground is the first
 * surface painted, because it is the largest consumer of all of them, and
 * because putting them anywhere else would make some other module import
 * *down* the paint order.
 */

import {
  type Plane,
  type ViewCamera,
  Projection,
  SX,
  SY,
} from "./projection";
import type { Chunk } from "./data";

// ── the frame ───────────────────────────────────────────────────────────────

/**
 * One paint of one canvas.
 *
 * `moving` is not cosmetic. Every quality dial in this file has a settled
 * value and a moving value, and the rule the whole port is held to is
 * *no visible hitch during a camera move* — so the moving values are the
 * ones that must never be exceeded, and the settled ones are what the
 * reader is actually shown.
 */
export interface Frame {
  readonly ctx: CanvasRenderingContext2D;
  /** CSS px */
  readonly W: number;
  /** CSS px */
  readonly H: number;
  readonly cam: ViewCamera;
  readonly proj: Projection;
  /** device pixels per CSS px of the canvas being painted into */
  readonly dpr: number;
  /** true while a gesture or a film move is in flight */
  readonly moving: boolean;
  /** the film's year, or undefined for "every year" */
  readonly year?: number;
}

export const sx = (f: Frame, p: Plane): number => SX(p, f.W, f.cam);
export const sy = (f: Frame, p: Plane): number => SY(p, f.H, f.cam);

/** `cam.scale / cam.base` — the zoom the LOD ladder and the data layer read. */
export function zOf(cam: ViewCamera & { base?: number }): number {
  const base = typeof cam.base === "number" && cam.base > 0 ? cam.base : 0.05565;
  return cam.scale / base;
}

// ── the dials ───────────────────────────────────────────────────────────────

/**
 * `LOOK` in the mock. Ablation switches, all on. Kept because every one of
 * them names a decision somebody argued for, and turning one off is how the
 * next person tells whether it is still earning its place.
 */
export const LOOK = {
  ao: 1, // screen-space contact shadow under the city layer
  attr: 1, // roof/wall tone from measured height and roll year
  palette: 1, // the gouache value range
  aerial: 1, // distance haze, further and warmer
  edge: 1, // silhouette ink as a value of its own roof
  grain: 1, // paper tooth
  depthfix: 1, // aerial perspective applied to the FAR city, not the near
  shore: 1, // the coastline is the published line, not the DEM's staircase
  waves: 1, // the water carries a hand-drawn wave tooth, under the haze
  /* ── BLOCK 1, 2026-08-26 — value and light. Each is a runtime dial so an
     A/B is the same page, the same caches, toggled: `__cityLOOK.x = 0/1`,
     then `invalidateBands()` + `invalidate()`. */
  roofval: 1, // roofs muted and lifted: a top face in daylight, not tar
  facek: 1, // wider sun/sky split on the walls
  relief2: 1, // the hillshade swing doubled, city DEM and surround alike
  shorerim: 1, // a pale rim under the coastline ink
  /* ── BLOCK 2 — ground structure ── */
  ground: 1, // the block interior one value warmer than the street
  artbed: 1, // arterials carry a pale bed under their ink
  /* ── BLOCK 3 — light ── */
  cast: 1, // every prism throws a shadow the length of its own height
  /* ── BLOCK 4 — the buildings themselves ── */
  faceZ: 2.4, // the zoom the facade openings open at (shipped 4.0)
  storeys: 1, // storey lines from 8 px of wall, not 14
  roofgrain: 1, // a material stipple on every roof wide enough to carry one
  skin: 1, // tall walls carry their storey and bay grid, from the roll's own columns
  /* ── BLOCK 5 — the glass ── */
  tilt: 1, // the film's settled frame is a diorama: soft at the top and foot of the frame
  vig: 1, // the explorer keeps a light vignette so the frame has a middle
  bathsoft: 1, // the depth plate's quantile step is rounded once, at build, by less than a node
  surrink: 1, // the surround's published coast gets the same rim and ink the city's does
  surrfix: 1, // the water is laid back over every raster cell that overshoots a published coast
};

/** the hillshade swing: `k = RELIEF_LO + RELIEF_SPAN * lam` */
export const reliefK = (lam: number): number =>
  LOOK.relief2 ? 0.60 + 0.66 * lam : 0.86 + 0.2 * lam;

/** `QF` in the mock — the quality-fix switches, each naming a bug that was fixed. */
export const QF = {
  xlam: 1, // the surround hillshade reads a slope, not a rise per cell
  shore: 1, // the shore corridor closes its corners; XHOLE is the disagreement
  water: 1, // the bay recedes with the same haze the land recedes with
  warm: 1, // two illuminants instead of one scalar
  relief: 1, // the surround's Lambert swing, re-derived now that XLAM is real
  coast: 1, // the surround is cut at the published shoreline, not at its cells
  tintsm: 1, // the canopy tint is smoothed at load, as `WCAN` smooths it
};

/**
 * `WA` in the mock — Block WARMTH.
 *
 * > The city's DEM cell is 53.815 m and the surround's is 110.01 x 139.15 m,
 * > and BOTH rasters paint one flat value per cell. […] You can see the grid
 * > with the naked eye because it IS a grid.
 *
 * The fix is not a finer raster. It is that the value painted at a POINT is
 * the bilinear interpolation of the value at the four grid NODES around it —
 * the same published measurement read as the continuous surface it is a
 * sample of. Continuity is structural, not tuned: neighbouring cells share
 * their nodes, so the field is C0 across every cell boundary in both rasters.
 */
export const WA = {
  smooth: 1, // the two terrain rasters are bilinear over their own nodes
  ramp: 1, // a cell the pixel floor pinned to k=1 ramps instead of stepping
  shoal: 1, // the shallows are one interpolated plate, not 13,409 quads
  tgt: 1.5, // the largest value step, of 255, a sub-quad seam may carry
  minpx: 2.4, // css px: the MOTION floor. Settled, see RS.minpxDev.
  kmax: 64,
  wallpx: 11, // css px of wall height above which the wall carries its grade
  wtop: 1.14, // the wall at the top, as a value of its own colour (1.055 before Block 4's glass dial)
  wbot: 0.76, // ...and at the bottom, where the street is (0.855 before)
  iq: "low" as ImageSmoothingQuality, // bilinear. "high" is a multi-pass resample and this is an UPSCALE
  gq: 3, // css px the wall gradient's ends quantise to, for the cache key
  /* css px the CELL ramp's ends quantise to. Not `gq`: at DPR 1 the surround
     cell is 3.69 css px tall and a 3 px quantum collapses the ramp to a
     constant, which is the thing it exists to remove. At 0.5 the endpoint is
     within a quarter pixel of the cell's own edge, so the colour at the edge
     is off by at most `step/(2·cellPx)` — 0.6 of 255 on the p95 cell — against
     the 8.86 it removes. Rows share exact y, so the hit rate is a row. */
  rampq: 0.5,
  /**
   * How far the far shore may wash toward the paper.
   *
   * **0.62, and the port shipped 0.42.** `part3.html` L1790, `WA.hazecap:
   * 0.62`, with its own comment — *"and it comes back out at the shipped
   * number. warmth/haze.py"* — so the number is a re-derivation, not a taste.
   *
   * It is read in three places that must agree, and at 0.42 two of them did
   * not: `TerrainField.hazeAt` (the land, and the depth plate's own per-node
   * fade), `drawDepthHaze` (the same fade as one fill), and `bayPlate`, whose
   * far stop is written `lerpHex(BAY_OPEN, HAZE, 0.62)` — the literal, from
   * the reference, sitting beside a cap of 0.42.
   *
   * MEASURED on the open Pacific at B3, the far field where the cap binds:
   * the mock reads 191,200,206 and `lerpHex(BAY_OPEN, HAZE, .62)` is
   * 197.6,206.3,211.6; prod read 172,188,203 against `lerp(.42)` =
   * 177.4,193.3,207.2. The distance was being under-painted by a fifth of the
   * whole fade over everything more than 3.4 km from downtown.
   */
  hazecap: 0.45, // 0.62 until 2026-08-26; the far city kept a fifth more of its contrast on the A/B and the argument for 0.62 was a match to the mock, not to the eye
};

/**
 * `RS` in the mock — Block RES. Device-pixel floors.
 *
 * MEASURED 2026-08-23, `res/floor.py`, one build, every camera, against the
 * 1-device-pixel frame:
 *
 * ```
 *   floor        whole city            civic (district)      street
 *   1.0 dev      518 ms  659k quads    223 ms  242k          107 ms
 *   2.0 dev      264 ms  232k  (0.14)  208 ms  209k  (0.02)  102 ms (0.0006)
 *   4.8 = ship   147 ms   59k  (0.83)  140 ms   92k  (0.25)  100 ms (0.15)
 * ```
 *
 * The bracket is how far that frame sits from the 1-device-pixel frame, as a
 * whole-frame mean of 255. Going below 2 device pixels DOUBLES the ground
 * plate at whole city and moves the frame by 0.14 of one level, none of which
 * survives a 4x magnified crop: what it is paying for at that camera is not
 * banding, it is the antialiased overlap between sub-quads, which is noise
 * around zero and not a picture.
 */
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityWA?: typeof WA }).__cityWA = WA;
  (globalThis as { __cityQF?: typeof QF }).__cityQF = QF;
  /* `window.LOOK` in the mock, and the switch every LOOK treatment is ablated
     through. `LOOK.grain` in particular has to be reachable from a probe or
     the paper cannot be measured, only asserted. */
  (globalThis as { __cityLOOK?: typeof LOOK }).__cityLOOK = LOOK;
}

export const RS = {
  on: 1,
  minpxDev: 2, // DEVICE px: the settled floor on a terrain sub-quad
  kmax: 64, // settled ceiling on the subdivision of one cell, per axis
  kmaxMove: 24, // ...and the shipped ceiling, kept for the motion tier
  tgtMove: 3.0, // the seam target while the camera is moving
  minpxMove: 2.4, // css px: the sub-quad floor while moving (WA.minpx's own)
  smoothMove: 1, // 0 = one flat fill per cell while moving
  aoss: 1,
  aossMove: 0.5,
  bayss: 1,
  bayssMove: 0.25,
  shoalss: 4, // the shallows plate, in samples per published node step
};

export interface ResTune {
  /** the largest value step, of 255, a sub-quad seam may carry; 0 disables subdivision */
  readonly tgt: number;
  /** ceiling on the subdivision of one cell, per axis */
  readonly kmax: number;
  /** CSS px floor on one sub-quad */
  readonly minpx: number;
  readonly bayss: number;
  readonly aoss: number;
}

/**
 * The three numbers `paintCell` reads, retuned once per ground rasterisation —
 * never inside one, and never per cell.
 */
export function resTune(dpr: number, moving: boolean): ResTune {
  const d = dpr > 0 ? dpr : 1;
  if (!RS.on) {
    return { tgt: WA.tgt, kmax: WA.kmax, minpx: WA.minpx, bayss: 0.25, aoss: 0.5 };
  }
  return moving
    ? {
        tgt: RS.smoothMove ? RS.tgtMove : 0,
        kmax: RS.kmaxMove,
        minpx: RS.minpxMove,
        bayss: RS.bayssMove,
        aoss: RS.aossMove,
      }
    : {
        tgt: WA.tgt,
        kmax: RS.kmax,
        minpx: RS.minpxDev / d,
        bayss: RS.bayss,
        aoss: RS.aoss,
      };
}

// ── the light ───────────────────────────────────────────────────────────────

/** The one key light. `SUN[2]` = 0.73 is what a flat surface returns. */
export const SUN: readonly [number, number, number] = [0.2435, 0.6346, 0.73];
export const LAM0 = 0.73;

/**
 * THE LIGHT IS TWO COLOURS.
 *
 * `shade(hex,k)` multiplies all three channels by the same scalar. That is a
 * VALUE ramp and nothing else: a shadowed plane comes out as the lit plane
 * with the brightness turned down, same hue, same chroma. It is the reason a
 * flat-shaded render reads as a render.
 *
 * Outdoors there are two sources. A surface facing the sun is lit by the sun,
 * which at this elevation is warm. A surface facing away is not lit by LESS
 * SUN — it is lit by the SKY DOME, which is blue.
 *
 * THE VALUE CURVE IS NOT TOUCHED. `k` still decides how light a surface is.
 * What is added is a HUE TILT whose luminance is renormalised to the
 * achromatic result EXACTLY, per colour, in the table build.
 *
 * Both illuminants are normalised to Rec.709 luminance 1.000, so on a neutral
 * base they change hue and nothing else.
 */
export const SUNC: readonly [number, number, number] = [1.054, 0.9998, 0.8949];
export const SKYC: readonly [number, number, number] = [0.9427, 0.9924, 1.1355];
const LUMR = 0.2126,
  LUMG = 0.7152,
  LUMB = 0.0722;

/** Amplitude of the warm/cool separation. 0 = `shade()` exactly. */
export let QWARM = 0.6;
export function setQWarm(v: number): void {
  QWARM = v;
  skyCache.clear();
}

export function luminance(r: number, g: number, b: number): number {
  return LUMR * r + LUMG * g + LUMB * b;
}

/** tilt in [-1,+1]: +1 fully sunlit, -1 fully sky-lit, 0 the flat-cell anchor. */
export function tiltOf(lam: number): number {
  return lam >= LAM0
    ? Math.min(1, (lam - LAM0) / (1 - LAM0))
    : Math.max(-1, (lam - LAM0) / LAM0);
}

/**
 * The wall ramp's four steps, as a tilt. q = 0 is the wall turned furthest
 * from the key light and q = 3 the one turned toward it; the anchor is the
 * middle of the ramp, which is a wall standing edge-on to the sun.
 */
export function qTilt(q: number): number {
  return (q - 1.5) / 1.5;
}

const HX2 = (() => {
  const a = new Array<string>(256);
  for (let i = 0; i < 256; i++) a[i] = (i < 16 ? "0" : "") + i.toString(16);
  return a;
})();
const hx = (v: number): string =>
  HX2[Math.max(0, Math.min(255, Math.round(v)))];

export function lerpHex(a: string, b: string, t: number): string {
  const f = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const A = f(a),
    B = f(b);
  return (
    "#" +
    hx(A[0] + (B[0] - A[0]) * t) +
    hx(A[1] + (B[1] - A[1]) * t) +
    hx(A[2] + (B[2] - A[2]) * t)
  );
}

const shadeCache = new Map<string, string>();
export function shade(hex: string, k: number): string {
  const key = hex + "|" + Math.round(k * 40);
  const c = shadeCache.get(key);
  if (c) return c;
  const n = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const out = "#" + hx(n[0] * k) + hx(n[1] * k) + hx(n[2] * k);
  shadeCache.set(key, out);
  return out;
}

const skyCache = new Map<string, string>();
/**
 * The cached, string-in string-out illuminant mix. Quantises `tilt` to a
 * twelfth and `k` to a two-hundredth so the cache can hit; that quantisation
 * is a property of the CACHE and not of the model, which is why `skylitN`
 * exists beside it and is strictly smoother.
 *
 * LUMINANCE HELD EXACTLY. Not asserted by algebra — computed, per colour.
 */
export function skylit(hex: string, k: number, tilt: number): string {
  if (!QF.warm) return shade(hex, k);
  const tq = Math.max(-12, Math.min(12, Math.round(tilt * 12)));
  const key = hex + "|" + Math.round(k * 200) + "|" + tq;
  const hit = skyCache.get(key);
  if (hit) return hit;
  const kk = Math.round(k * 200) / 200,
    t = tq / 12,
    a = QWARM * Math.abs(t);
  const I = t >= 0 ? SUNC : SKYC;
  const mr = 1 + (I[0] - 1) * a,
    mg = 1 + (I[1] - 1) * a,
    mb = 1 + (I[2] - 1) * a;
  const r0 = parseInt(hex.slice(1, 3), 16) * kk,
    g0 = parseInt(hex.slice(3, 5), 16) * kk,
    b0 = parseInt(hex.slice(5, 7), 16) * kk;
  let r = r0 * mr,
    g = g0 * mg,
    b = b0 * mb;
  const l0 = luminance(r0, g0, b0),
    l1 = luminance(r, g, b);
  if (l1 > 0.0001) {
    const s = l0 / l1;
    r *= s;
    g *= s;
    b *= s;
  }
  const out = "#" + hx(r) + hx(g) + hx(b);
  skyCache.set(key, out);
  return out;
}

export type RGB = Float64Array | [number, number, number];

/**
 * `skylit()` without the string cache and without the tilt-to-a-twelfth
 * quantisation the cache forced — strictly smoother, identical in the limit.
 * `skylit()` itself is UNTOUCHED so `gen/functional.py` Q3 still measures the
 * function it was written against.
 */
export function skylitN(
  r: number,
  g: number,
  b: number,
  k: number,
  tilt: number,
  o: RGB,
): RGB {
  if (!QF.warm) {
    o[0] = r * k;
    o[1] = g * k;
    o[2] = b * k;
    return o;
  }
  const t = tilt < -1 ? -1 : tilt > 1 ? 1 : tilt,
    a = QWARM * (t < 0 ? -t : t);
  const I = t >= 0 ? SUNC : SKYC;
  const r0 = r * k,
    g0 = g * k,
    b0 = b * k;
  let R = r0 * (1 + (I[0] - 1) * a),
    G = g0 * (1 + (I[1] - 1) * a),
    B = b0 * (1 + (I[2] - 1) * a);
  const l0 = luminance(r0, g0, b0),
    l1 = luminance(R, G, B);
  if (l1 > 0.0001) {
    const s = l0 / l1;
    R *= s;
    G *= s;
    B *= s;
  }
  o[0] = R;
  o[1] = G;
  o[2] = B;
  return o;
}

/**
 * AND THE COLOUR STRING IS CACHED, WHICH IS MOST OF THE COST.
 *
 * MEASURED: the ground plate at whole city ran 84 ms shipped and 143 ms with
 * the same NUMBER of fills once every one of them carried a freshly built
 * "#rrggbb". The shipped renderer never noticed because the ramp holds 1,152
 * strings and hands the same object back every time, so the browser's CSS
 * colour parse is a cache hit on every fill. A bilinear field builds a new
 * string per sub-quad and every one of them is a parse.
 *
 * One Map from the packed 24-bit colour to its string puts that back: the
 * allocation happens once per DISTINCT colour in the frame, not once per fill.
 */
const csC = new Map<number, string>();
export function rgbHex(r: number, g: number, b: number): string {
  const R = r < 0 ? 0 : r > 255 ? 255 : r | 0,
    G = g < 0 ? 0 : g > 255 ? 255 : g | 0,
    B = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  const k = (R << 16) | (G << 8) | B;
  let s = csC.get(k);
  if (s === undefined) {
    s = "#" + HX2[R] + HX2[G] + HX2[B];
    if (csC.size > 200000) csC.clear();
    csC.set(k, s);
  }
  return s;
}

// ── the ground palette ──────────────────────────────────────────────────────

/**
 * ground, low to high; the park row; the canopy end of the tint ramp.
 *
 * THESE SIX WERE INVENTED BY THE PORT. THEY ARE THE REFERENCE'S AGAIN.
 *
 * `gen/part3.html` L3360-3361 and L3456 — identical in every one of the six
 * `part3.html` snapshots under `scratchpad/sf-city-anim` and in the served
 * `mock-frame.html` L4735-4736 / L4831, and read back off the RUNNING mock,
 * whose `terrainColor(10, 0.73, 0, 0, 0)` returns `#f7eed4` where this port's
 * returned `#d9d3be`:
 *
 * ```
 *            reference   this port shipped   error, of 255
 *   WG0      #f8f0d8     #d9d3bf             -31 -29 -25
 *   WG1      #dcc79a     #c8bda1             -20 -10  +7
 *   WPK0     #eef0d8     #b9c79a             -53 -41 -62
 *   WPK1     #d3d3a8     #9fb283             -52 -33 -37
 *   WCN0     #c9d79c     #a9bd8c             -32 -26 -16
 *   WCN1     #7c9455     #7d9a63              +1  +6 +14
 * ```
 *
 * The ground is 70.8 % of the district frame and this table is what it is made
 * of. Bare ground came out about THIRTY LEVELS DARK and twenty-five COLD — the
 * Sunset read grey where the reference reads tan — and the park row, 41 to 62
 * levels off and the worst of the six, turned the reference's pale
 * yellow-green meadow into a mid sage. `grep -rn 'd9d3bf'` over the whole of
 * `scratchpad/sf-city-anim` finds nothing: these numbers are not a stale
 * revision of the source, they are not in it.
 *
 * `WFLG.pal` is the reference's own switch — "the earthier ground, water and
 * park values" — and it ships at 1, so the shipped pair is the first one. The
 * `pal: 0` pair is carried because the flag is, and because an ablation switch
 * is the only way to measure what it does.
 */
export const WPAL = { pal: 1 };
/* ── THE GROUND WAS A PAPER-MAP PALETTE, AND IT IS WHY SHADOWS CUT ───────
   `#f8f0d8` to `#dcc79a` is a cartographer's warm base — the tone a printed
   map leaves under its ink so the ink reads. It is correct on paper and wrong
   under a sun: open ground came out as pale sand at every camera, which is
   most of *"the terrain looks like a background not a varied lush detailled
   world"*, and it made every cast shadow the ONLY dark thing in the frame.

   That last part is worth stating plainly, because it is the cheapest half of
   a complaint that looked like a lighting problem. A shadow is a RATIO, not a
   value: the same shadow that reads as a soft grade on asphalt reads as a
   knife on cream. Darkening the ground shrinks the shadow's bite without
   touching a single light.

   These are AUTHORED, exactly as the wall palette above is, and they are not
   a claim about the colour of any square metre of San Francisco. */
export const WG0 = WPAL.pal ? "#b3ac8e" : "#faf6ec",
  WG1 = WPAL.pal ? "#9a9066" : "#e2d5b8";
/* ── THE GREENS WERE LURID, AND THE NEW CAMERA IS WHY IT SHOWS ──────────
   Measured at Twin Peaks on the deepest camera the clamp now allows, mean
   saturation over the whole frame is 0.508 — half again what a residential
   frame reads (0.30) and more than twice a downtown one (0.18). Open hillside
   filled most of it, and the green it was filled with is a full-chroma
   yellow-green.

   San Francisco's hills are not that colour. They are dry gold most of the
   year and a grey-olive green after rain, and the canopy over them is a
   dark blue-green eucalyptus and cypress, not a lawn. So both ends of both
   ramps come down in chroma and toward olive, which is the same authored
   decision the wall palette is and carries the same status: chosen, not
   measured, and not a claim about any square metre.

   The park ramp keeps more of its lightness than the canopy ramp, because a
   meadow IS brighter than a wood and the two need to stay apart. */
export const WPK0 = "#a3b184",
  WPK1 = "#6f855a";
export const WCN0 = "#b6c398",
  WCN1 = "#6f855f";

/* ── THE REGION'S GROUND, BY WHAT IS GROWING ON IT ──────────────────────────
   Everything outside the city's own DEM used to be coloured from ONE quantity,
   its elevation, lerped between a low sand and a high sand. Elevation cannot
   tell a reservoir from a subdivision from a redwood hillside, so it did not:
   the whole region came out as one tone, which is *"someone put a color and
   thats it theres no detail, no texture nothing."*

   Two cheaper answers were tried first and both are recorded in the pipeline
   script with their numbers — a detail normal map from real 3DEP moved 0.57 %
   of the frame at NINE times strength (this land is lit nearly head-on, so
   shading is not the lever), and a colour mottle moved 4.43 %, which varies
   the tone of a wrong colour. What was actually missing is that the map did
   not know what was there.

   Now it does: `base/surround-landcover` carries the fraction of every 110 x
   139 m cell that is each of these eight families, reduced from NLCD 2021 at
   30 m. The cell's base tone is those colours blended by those fractions, and
   the relief, the aerial haze, the city seam and the mottle all still run on
   top of it exactly as before.

   ── THESE EIGHT COLOURS ARE AUTHORED ────────────────────────────────────
   The FRACTIONS are measured; the colours are chosen, the same status as the
   wall palette and the greens above, and they are not a claim about the
   colour of any square metre. Two things constrain the choice. They sit
   LIGHTER than the city's own ground, because this land is far away behind
   haze and it must not compete with the subject — `surround.ts` opens by
   saying the region is *"the land that is not the subject"* and that stays
   true. And they are separated by HUE rather than by value, because value is
   already spoken for by the relief shading. */
export const XLC: readonly string[] = [
  "#9fb0b4", // water — reservoirs and inland water, muted blue-grey
  "#b3b294", // wetland — the South Bay marsh, olive
  "#8f9d83", // conifer — Marin's evergreen, the darkest of the eight
  "#a9b28b", // broadleaf — oak woodland and mixed forest
  "#c5b78f", // shrub — coastal chaparral
  "#d6c895", // grass — the California hills, gold most of the year
  "#ccc2b1", // developed — stucco suburb, warm; NOT concrete grey
  "#dad2bd", // barren — rock, sand and clay, the lightest
];

/** elevation quantum of the ramp, and the canopy quantum */
export const WTQ = 64,
  WCQ = 9;

/** the burned-ground tone, as numbers */
const BRN: readonly [number, number, number] = [0xd6, 0xcf, 0xc3];

const WTBL: string[] = (() => {
  const out = new Array<string>(2 * WTQ * WCQ);
  for (let pk = 0; pk < 2; pk++)
    for (let ti = 0; ti < WTQ; ti++) {
      const t = ti / (WTQ - 1);
      const g0 = pk ? lerpHex(WPK0, WPK1, t) : lerpHex(WG0, WG1, t);
      const cn = lerpHex(WCN0, WCN1, t);
      for (let ci = 0; ci < WCQ; ci++)
        out[(pk * WTQ + ti) * WCQ + ci] = ci ? lerpHex(g0, cn, ci / (WCQ - 1)) : g0;
    }
  return out;
})();

const WTBL_R = new Float32Array(WTBL.length),
  WTBL_G = new Float32Array(WTBL.length),
  WTBL_B = new Float32Array(WTBL.length);
for (let k = 0; k < WTBL.length; k++) {
  const h = WTBL[k];
  WTBL_R[k] = parseInt(h.slice(1, 3), 16);
  WTBL_G[k] = parseInt(h.slice(3, 5), 16);
  WTBL_B[k] = parseInt(h.slice(5, 7), 16);
}

/* ── ONE GREEN FOR EVERY TREED CELL IS WHY A PARK READS AS MOSS ──────────
   `WTBL` is a real ramp — 2 park states x 64 elevation steps x 9 canopy steps
   — and inside a flat, fully treed park it collapses to ONE ENTRY. Golden
   Gate Park is flat and its canopy fraction is pinned near the top, so every
   node in it lands on the same colour and the park comes out as a single
   stippled mass. Daniel: *"Canopies still look like giant bushes"*.

   That the fix belongs HERE and not in the tree layers was measured rather
   than guessed. `citygl/tree-geometry.ts` §ONE GREEN PER FAMILY put a
   per-instance jitter on all 195,310 street trees and all 50,897 park masses;
   Golden Gate Park moved **0.51 % of the frame**, and **1.60 % with that
   jitter cranked to four times what shipped**. The park's green is not the
   foliage geometry at all — it is this table, painted on the ground.

   ── WHAT IS PUBLISHED, AND WHAT THIS IS ─────────────────────────────────
   The canopy FRACTION is published and is not touched: the mottle is a factor
   ON the colour the published fraction already chose, and it is scaled BY that
   fraction, so open ground, streets and bare cells are left exactly as they
   were and only treed ground varies. What is declared is that a wood is not
   one colour, which no register records either way.

   Deterministic in the node's own index, so a burn phase, a band change or a
   rebuild puts every node back at the colour it had — the node cache
   (`tnST`/`tnKey`) would otherwise hand out a different green each time it was
   invalidated, which is a flicker across every park in the city.

   The scale is the DEM's: one draw per node, 53.8 m apart, interpolated
   between. That is coarser than a crown and it is the right coarseness — it
   is stand-sized rather than tree-sized, which is what varies in a real wood
   and is also the only scale this grid can express. */
const CANOPY_MOTTLE = 0.26;
/** how much of the mottle is a warm/cool skew rather than a value change */
const CANOPY_MOTTLE_WARM = 0.35;

/**
 * Vary a node's colour where it is treed, in place, in sRGB bytes.
 *
 * `cov` is the published canopy byte, 0..255 — NOT a fraction, and that cost a
 * round: scaling the jitter by it directly multiplied the mottle by up to 255,
 * which saturated the clamp at every treed node and made the strength constant
 * do nothing at all. Both 0.5 and 0.10 came back with the same maximum change
 * of 234, which is the tell. So it is normalised HERE the way `terrainRGB`
 * normalises it — `can * (1.5 / 255)`, capped at 1 — and the mottle is then
 * zero exactly where the tint it varies is zero.
 */
export function canopyMottle(k: number, cov: number, c: Float64Array): void {
  const q = Math.min(1, cov * (1.5 / 255));
  if (!(q > 0.06)) return;
  let h = Math.imul(k | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  const v = ((h >>> 8) & 1023) / 511.5 - 1;
  const w = ((h >>> 20) & 511) / 255.5 - 1;
  const kv = 1 + v * CANOPY_MOTTLE * q;
  const warm = w * CANOPY_MOTTLE * CANOPY_MOTTLE_WARM * q;
  const cl = (x: number): number => (x < 0 ? 0 : x > 255 ? 255 : x);
  c[0] = cl(c[0] * (kv + warm));
  c[1] = cl(c[1] * kv);
  c[2] = cl(c[2] * (kv - warm));
}

/* ── AND OPEN GROUND WAS ONE COLOUR, WHICH IS MOST OF THE CITY ────────────
   `canopyMottle` returns early wherever there is no canopy, so every square
   metre of unwooded ground took its colour from the elevation ramp and nothing
   else. On a hillside that ramp does vary. On the flat it does not vary at
   all: South of Market is at sea level from end to end, so the whole district
   resolved to a single value of the table and came out as one sheet of khaki.

   It is exactly the defect the regional land had, sitting inside the city
   where the reader actually looks, and it has the same answer for the same
   reason -- the problem is that the COLOUR does not vary, so vary the colour.
   Deterministic in the node's own index, so a rebuild puts every node back.

   It tapers out as the canopy comes in rather than adding to it: a treed node
   is already varied by the mottle above and two of them stacked reads as
   noise. Declared, and not a claim about any square metre -- the same status
   as the canopy mottle it complements and as the wall palette. */
const GROUND_MOTTLE = 0.11;
/** how much of it is a warm/cool skew rather than a change of value */
const GROUND_MOTTLE_WARM = 0.4;
/** canopy fraction by which the open-ground mottle has handed over entirely */
const GROUND_MOTTLE_OUT = 0.5;

/**
 * Vary a node of OPEN ground, in place, in sRGB bytes.
 *
 * `cov` is the published canopy byte, 0..255, normalised here the way
 * `terrainRGB` and `canopyMottle` both normalise it. The hash is seeded
 * differently from the canopy mottle's on purpose: sharing it would make the
 * two agree node for node and the handover would show as a seam.
 */
export function groundMottle(k: number, cov: number, c: Float64Array): void {
  const q = Math.min(1, cov * (1.5 / 255));
  const open = 1 - Math.min(1, q / GROUND_MOTTLE_OUT);
  if (!(open > 0)) return;
  let h = Math.imul((k | 0) ^ 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  const v = ((h >>> 8) & 1023) / 511.5 - 1;
  const w = ((h >>> 20) & 511) / 255.5 - 1;
  const kv = 1 + v * GROUND_MOTTLE * open;
  const warm = w * GROUND_MOTTLE * GROUND_MOTTLE_WARM * open;
  const cl = (x: number): number => (x < 0 ? 0 : x > 255 ? 255 : x);
  c[0] = cl(c[0] * (kv + warm));
  c[1] = cl(c[1] * kv);
  c[2] = cl(c[2] * (kv - warm));
}

/** true where the canopy tint is applied to the ground */
export const WFLG = { tint: 1 };

/**
 * The quantised, string-returning ramp. Kept EXACTLY as the mock has it
 * because `gen/functional.py` measures this function; `terrainRGB` is the
 * continuous one the ground plate actually paints through.
 */
export function terrainColor(
  z: number,
  lam: number,
  park: number,
  burnT: number,
  can: number,
): string {
  const t = Math.min(1, Math.pow(z / 175, 0.85));
  const ti = (t * (WTQ - 1)) | 0;
  let ci = 0;
  if (can > 0 && WFLG.tint) {
    const cf = can * (1.5 / 255);
    if (cf > 0.06) ci = Math.min(WCQ - 1, 1 + ((cf * (WCQ - 1)) | 0));
  }
  let base = WTBL[((park ? WTQ : 0) + ti) * WCQ + ci];
  if (burnT > 0) base = lerpHex(base, "#d6cfc3", burnT);
  return skylit(base, reliefK(lam), tiltOf(lam));
}

const sc3 = new Float64Array(3);

/**
 * The same ramp `terrainColor()` indexes, read CONTINUOUSLY in elevation, in
 * canopy fraction and in park membership.
 *
 * `park` was a boolean row selector; a node sitting on the edge of Golden Gate
 * Park belongs to both rows in the proportion of the cells that meet there,
 * which is what stops the park's own 53.8 m staircase. The published ring is
 * still drawn over the top of it.
 */
export function terrainRGB(
  z: number,
  lam: number,
  parkF: number,
  burnT: number,
  can: number,
  o: RGB,
): RGB {
  const t = Math.min(1, Math.pow(z / 175, 0.85));
  const tf = t * (WTQ - 1),
    t0 = Math.min(WTQ - 2, tf | 0),
    tr = Math.min(1, Math.max(0, tf - t0));
  let cf = 0;
  if (can > 0 && WFLG.tint) {
    const q = can * (1.5 / 255);
    if (q > 0.06) cf = Math.min(WCQ - 1, 1 + q * (WCQ - 1));
  }
  const c0 = Math.min(WCQ - 2, cf | 0),
    cr = Math.min(1, Math.max(0, cf - c0));
  let R = 0,
    G = 0,
    B = 0;
  for (let pk = 0; pk < 2; pk++) {
    const w = pk ? parkF : 1 - parkF;
    if (w <= 0.0001) continue;
    const b0 = pk * WTQ * WCQ,
      a = b0 + t0 * WCQ + c0,
      b = a + 1,
      c = b0 + (t0 + 1) * WCQ + c0,
      d = c + 1;
    const ra = WTBL_R[a] + (WTBL_R[b] - WTBL_R[a]) * cr,
      rb = WTBL_R[c] + (WTBL_R[d] - WTBL_R[c]) * cr;
    const ga = WTBL_G[a] + (WTBL_G[b] - WTBL_G[a]) * cr,
      gb = WTBL_G[c] + (WTBL_G[d] - WTBL_G[c]) * cr;
    const ba = WTBL_B[a] + (WTBL_B[b] - WTBL_B[a]) * cr,
      bb = WTBL_B[c] + (WTBL_B[d] - WTBL_B[c]) * cr;
    R += w * (ra + (rb - ra) * tr);
    G += w * (ga + (gb - ga) * tr);
    B += w * (ba + (bb - ba) * tr);
  }
  if (burnT > 0) {
    R += (BRN[0] - R) * burnT;
    G += (BRN[1] - G) * burnT;
    B += (BRN[2] - B) * burnT;
  }
  return skylitN(R, G, B, reliefK(lam), tiltOf(lam), o);
}

// ── the DEM ─────────────────────────────────────────────────────────────────

export interface TerrainProj {
  readonly X0: number;
  readonly Y0: number;
  /** grid steps per world metre; `1/s` is the cell's own width in metres */
  readonly s: number;
  readonly N: number;
  readonly downtown: readonly [number, number];
  readonly ferry: readonly [number, number];
  readonly castro: readonly [number, number];
}

/**
 * `SN` in the mock — Block SHADOW, and the two of its numbers this file owns.
 *
 * **BOTH WERE WRONG, AND BOTH IN THE SAME DIRECTION.** `part3.html` L2136-37:
 *
 * ```
 *   terrk: 0.80,   // share of the direct term a terrain shadow removes
 *   terrs: 34,     // exaggerated metres of overshoot for a FULL terrain shadow
 * ```
 *
 * against this file's own defaults of `terrs ?? 6` and `shadow.k ?? 1`, which
 * nothing overrides — `grep -rn 'terrs\|shadow:' src/components` returns
 * nothing, so 6 and 1 were live at every camera. Neither number is anywhere in
 * `scratchpad/sf-city-anim`.
 *
 * **`terrs` is a saturation, so 6 against 34 is not "a bit more shadow".**
 * `tsh = min(1, over / terrs)`, and the shipped `over` on the cells that have
 * any runs p25 7.4 m, p50 14.7, p75 33.1, p95 61.9. At `terrs = 34` the
 * median shadowed cell lands at 0.43 and the field is a modelled ramp across
 * the published quartiles. At 6 the median lands at **1.0** — clipped — so
 * three quarters of the shadowed ground carries the same value and the
 * penumbra the 1-2-1 blur exists to make is a cliff with a blur on it.
 * *A saturation destroys relief in the one place the map is trying to show
 * it.*
 *
 * **And `terrk = 1` drives `lam` to exactly 0.** `lamSh = lam * (1 - k * tsh)`,
 * and at `k = 1` with `tsh` clipped to 1 the diffuse term is annihilated,
 * which sends `tiltOf(lam)` to its floor of −1: the cell is rendered wholly
 * through `SKYC` at the bottom of the ramp. The reference leaves 20 % of the
 * direct term in, so a shadowed slope keeps a trace of the sun and reads as
 * shaded ground rather than as a hole.
 *
 * **What it is worth, stated honestly: not much, because the field is small.**
 * Re-marched offline over the 37,754 land cells (`.parity/g2qc.py` + the same
 * arithmetic), **only 0.8 % of them are in terrain self-shadow at all** — the
 * sun sits at 47° and the DEM is a 53.8 m raster, so few cells occlude any
 * other.
 *
 * MEASURED on the GROUND ALONE — `?layers=surround,terrain,water,shore,parks`,
 * `.parity/g2ground.py`, so a label re-placing itself between two runs cannot
 * be read as the treatment. **The first attempt at this measurement was the
 * full frame and it reported 1.22 % moved at Nob Hill with a max of 224; the
 * diff map (`out-g2/diff-shadow-nobhill.png`) is street names, place markers
 * and Grace Cathedral, and none of it is ground.**
 *
 * ```
 *   camera            moved >2   gross >12   the moved pixels: before -> after
 *   whole city          0.08 %     0.00 %          174.90 -> 177.11
 *   district Twin Peaks 0.35 %     0.00 %          165.17 -> 167.44
 *   district Nob Hill   0.09 %     0.00 %          158.72 -> 160.48
 *   district GG Park    0.37 %     0.00 %          166.45 -> 168.71
 *   block Twin Peaks    0.33 %     0.00 %          155.19 -> 157.01
 * ```
 *
 * A third of a percent of the ground, about **+2 levels** on the pixels it
 * touches, and the gross band does not move at all. It does NOT add dark
 * detail — it un-clips a saturated one, which is a different thing and the
 * correct one. It is landed for the reason every constant in this file is: a
 * number that exists in production and nowhere in the source is the pattern
 * that has produced most of the wins here.
 */
export const SN = {
  /** share of the direct term a terrain shadow removes — `part3.html` L2136 */
  terrk: 0.8,
  /** exaggerated metres of overshoot for a FULL terrain shadow — L2137 */
  terrs: 34,
};

export interface TerrainOptions {
  /** terrain exaggeration at the band the field is built for; `ZEX_BY_STEP` */
  readonly zex?: number;
  /** self-shadow: how many metres of overshoot saturate the penumbra */
  readonly terrs?: number;
  /** self-shadow on/off and its strength */
  readonly shadow?: { readonly on: boolean; readonly k: number };
  /**
   * WHICH SUN THE HILLSHADE IS BAKED FOR — `[i, j, up]`, unit length.
   *
   * Defaults to `SUN`, the published one, which is what the Canvas page wants
   * and what every number in this file was measured against. It is an option
   * because a renderer that throws a REAL shadow cannot use it.
   *
   * `lib/citygl/light.ts` §the sun swings round explains why: under the
   * axonometric projection screen-y does not depend on world x, so only a sun
   * whose azimuth is screen-right throws its shadows horizontally ACROSS the
   * frame — any other azimuth hides them behind the towers that cast them, or
   * backlights the whole city. That renderer's sun is therefore due EAST at
   * 30 degrees, MEASURED off the rig and identical at all three zoom bands.
   *
   * The published sun is 69 degrees from it in azimuth and 17 in elevation.
   * Baking one while casting the other puts a hillside's lit face and the
   * shadow of every building standing on that hillside in different places.
   * That is the "false illusion of depth ... not really feelings of depth"
   * a reader sees without being able to name it.
   */
  readonly sun?: readonly [number, number, number];
  /**
   * HOW FAR THE HILLSHADE SWINGS, ABOUT THE VALUE FLAT GROUND TAKES.
   *
   * 1, the default, is the published behaviour exactly and the Canvas page
   * gets it unchanged.
   *
   * It exists because `sun` and this are coupled, and the coupling bites. The
   * diffuse term a FLAT cell returns is the sun's own up-component: 0.730 for
   * the published sun at 47 degrees, but only 0.500 for a sun at 30. `reliefK`
   * maps that through `0.60 + 0.66 * lam`, so simply lowering the sun drops
   * open ground from 1.082 of its albedo to 0.930 — a 14 % darkening of every
   * flat surface in the city, which is a side effect and not a decision.
   *
   * So the term is re-centred: whatever a flat cell returns for THIS sun is
   * mapped back onto `SUN[2]`, the value the published palette was built
   * around, and only the departure from flat is scaled. Open ground therefore
   * does not move at any elevation, and `gain` buys hill contrast without
   * spending the frame's mid-tone on it.
   */
  readonly reliefGain?: number;
}

/**
 * Two passes of a separable 1-2-1 kernel over a coverage FRACTION.
 *
 * `part3.html` L3286-3300, index for index. `k = i*N + j`, so `k ± 1` are the
 * j neighbours and `k ± N` the i ones, and each pass is horizontal then
 * vertical. The `+2` before the `>> 2` is the reference's rounding and it is
 * kept: without it the field loses a level a pass and the forest fades.
 *
 * **The input is never written to.** It is a view on the chunk's own buffer,
 * which the cache hands out to every reader.
 */
export function smoothCanopy(a: Uint8Array, N: number): Uint8Array {
  const N2 = N * N;
  let src: Uint8Array = a;
  let dst: Uint8Array = new Uint8Array(N2);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        const l = j > 0 ? src[k - 1] : src[k],
          r = j < N - 1 ? src[k + 1] : src[k];
        dst[k] = (l + 2 * src[k] + r + 2) >> 2;
      }
    let t: Uint8Array = src;
    src = dst;
    dst = t === a ? new Uint8Array(N2) : t;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        const u = i > 0 ? src[k - N] : src[k],
          d = i < N - 1 ? src[k + N] : src[k];
        dst[k] = (u + 2 * src[k] + d + 2) >> 2;
      }
    t = src;
    src = dst;
    dst = t;
  }
  return src;
}

/**
 * The city's own DEM, its hillshade, its self-shadow, and everything derived
 * from all three. 260 x 260 = 67,600 nodes; three float planes and a stamp,
 * allocated once.
 */
export class TerrainField {
  readonly N: number;
  readonly ZMAX: number;
  readonly proj: TerrainProj;
  /** metres per grid step — the cell's OWN width. 53.815 m. */
  readonly cellM: number;
  readonly zex: number;

  private readonly dem: Uint8Array;
  private readonly maskBits: Uint8Array;
  private coastFixBits: Uint8Array | null = null;
  private landFieldBits: Uint8Array | null = null;

  /** the diffuse term, per node */
  readonly lam: Float32Array;
  /** the self-shadow term, per node, 0 = lit */
  readonly tsh: Float32Array;

  /** per-cell park fraction and burn flag, filled by `parks`/`coast` */
  readonly cellPark: Uint8Array;
  readonly cellBurn: Uint8Array;
  private canopyRaw: Uint8Array | null = null;
  private canopySm: Uint8Array | null = null;

  /**
   * THE CANOPY TINT IS SMOOTHED AT LOAD, AND THIS PORT WAS PAINTING IT RAW.
   *
   * `part3.html` L3277 `WCAN` runs **two passes of a separable 1-2-1 kernel**
   * over `base/canopy-tint` before anything reads it, and says why in its own
   * words:
   *
   * > The canopy fraction is measured on the DEM's own 53.8 m grid, and
   * > painted raw it is a chequerboard: one cell of the Presidio's forest
   * > against its neighbour of open sand is a hard 53.8 m square, which is
   * > the exact artefact Block M spent a night removing from the shoreline.
   * > Two passes of a separable 1-2-1 kernel — the field is a coverage
   * > fraction, so **smoothing it is smoothing a measurement rather than
   * > inventing one, and no cell is moved.** Costs 4 x 67,600 adds, once, at
   * > load.
   *
   * **The encoder says the same thing on the wire** — `manifest.kinds
   * ['canopy-tint'].note` repeats that sentence verbatim, so the field is
   * shipped raw ON PURPOSE and the client is the half that was missing.
   * `scene.ts:1092` assigned `tint.fields.demFrac` straight across.
   *
   * MEASURED over the 67,600 cells of the shipped chunk:
   *
   * ```
   *                 non-zero    mean    p50   p90   max
   *   raw            39.33 %   18.90      0    63   255
   *   smoothed       61.04 %   19.19      6    56   220
   *
   *   cells changed 60.18 %,  mean |d| 10.57 of 255,  p95 46,  max 198
   *   over terrainColor's own 0.06 tint gate:  31.67 %  ->  42.17 %
   * ```
   *
   * **A third more of the city's ground gets a canopy tint**, the hardest
   * forest cell softens from 255 to 220, and the mean is unmoved (18.90 to
   * 19.19) — which is the check that this spreads a measurement rather than
   * adding one.
   *
   * The raw array is a VIEW ON THE CHUNK'S OWN BUFFER and is never written to:
   * the reference is careful about that too (`dst = (t === a) ? new
   * Uint8Array(N2) : t`), and here the smoothing allocates its own pair.
   * Re-assigning the same array is a no-op, so the band builder can set it
   * every rebuild without paying for it or dropping the node cache.
   *
   * `QF.tintsm` = 0 keeps the raw field, for an ablation.
   */
  get canopyFrac(): Uint8Array | null {
    return this.canopySm;
  }

  set canopyFrac(a: Uint8Array | null) {
    if (a === this.canopyRaw) return;
    this.canopyRaw = a;
    this.canopySm =
      a && QF.tintsm && a.length === this.N * this.N
        ? smoothCanopy(a, this.N)
        : a;
    this.invalidateNodes();
  }

  private readonly shadowOn: boolean;
  private readonly shadowK: number;

  // the node colour planes
  private readonly tnR: Float32Array;
  private readonly tnG: Float32Array;
  private readonly tnB: Float32Array;
  private readonly tnST: Int32Array;
  private tnKey = 1;

  constructor(chunk: Chunk, proj: TerrainProj, opts: TerrainOptions = {}) {
    const dem = chunk.fields.dem;
    const mask = chunk.fields.mask;
    if (!(dem instanceof Uint8Array) || !(mask instanceof Uint8Array))
      throw new Error("terrain chunk is missing dem/mask");
    this.dem = dem;
    this.maskBits = mask;
    this.proj = proj;
    this.N = proj.N;
    this.ZMAX = 300;
    this.cellM = 1 / proj.s;
    this.zex = opts.zex ?? 3.3;
    this.shadowOn = opts.shadow?.on ?? true;
    this.shadowK = opts.shadow?.k ?? SN.terrk;
    /* normalised here rather than trusted: a caller derives this from a camera
       basis, and a basis is only unit-length if someone remembered */
    const sv = opts.sun ?? SUN;
    const sl = Math.hypot(sv[0], sv[1], sv[2]) || 1;
    this.sun = [sv[0] / sl, sv[1] / sl, sv[2] / sl];
    this.reliefGain = opts.reliefGain ?? 1;
    const N = this.N;
    this.cellPark = new Uint8Array(N * N);
    this.cellBurn = new Uint8Array(N * N);
    this.tnR = new Float32Array(N * N);
    this.tnG = new Float32Array(N * N);
    this.tnB = new Float32Array(N * N);
    this.tnST = new Int32Array(N * N);
    this.lam = this.buildLam();
    this.tsh = this.buildTsh(opts.terrs ?? SN.terrs);
  }

  /**
   * A CELL MORE THAN 300 m OUTSIDE THE PUBLISHED LAND IS NOT LAND.
   *
   * `base/terrain`'s `mask` is DataSF `txuc-3kzm` rasterised at 53.815 m, and
   * `txuc-3kzm` is the boundary of the **City and County of San Francisco** —
   * a LEGAL boundary. It runs kilometres offshore into the Pacific and
   * straight across the Golden Gate. **4,787 of the 43,187 ground cells —
   * 11.1 %, 13.86 km2 — are open water painted in the city's ground tone**, and
   * their 53.8 m edge is the straight line in the water at the south-west of
   * the opening frame, and the reason the strait does not read as a strait.
   *
   * `cityOffshore` is one published bit per cell out of
   * `base/surround-coast.json`: this cell's centre is more than `city_pad_m`
   * = 300 m outside the TIGERweb land polygon. The 300 m is argued in
   * `coast/build_coast.py` and it is not a fudge — **within 300 m of the shore
   * DataSF wins**, because it is the city's own register of its own waterfront,
   * and that is what keeps the Embarcadero's finger piers, Fort Mason and the
   * Aquatic Park breakwater, which are real made land the county-scale
   * hydrography does not carry.
   *
   * Applied HERE rather than in the cell loop, because `maskAt` is also what
   * the node average, the depth order and `fitCity`'s own extent walk read: a
   * cell that is not land must not be land to any of them.
   */
  set coastFix(bits: Uint8Array | null) {
    this.coastFixBits = QF.coast ? bits : null;
  }

  /**
   * ── AND WHERE THE LAND BIT ITSELF COMES FROM, WHICH IS THE SAME SEAM ────
   *
   * The paragraph above is the right idea and this extends it rather than
   * working around it. `maskAt` is the one place a cell's land-ness is
   * decided, and everything downstream — the node average that gives a cell
   * its COLOUR, the depth order, `fitCity`'s extent walk, and the GL
   * renderer's coast cut — reads it. So a second register that disagrees
   * with `maskBits` must be applied HERE or it is applied nowhere.
   *
   * It had to be. `maskBits` is the city's own published land bit and it
   * calls the Hunters Point fill water, so the ground was cut away there and
   * the far shore painted a second, coarser copy of San Francisco over the
   * hole — 110.01 x 139.15 m cells with a staircase for a shoreline, which
   * `lib/city/data.ts` §surroundOrder names as the one thing that must not
   * happen. Cutting the ground at a better register alone did not fix it:
   * the cut moved and the COLOUR did not, because the colour comes through
   * here, and the ground came back bleached white instead.
   *
   * Set this and the two agree by construction, because there is only one of
   * them. Unset — which is every caller that does not opt in, including the
   * published Canvas page — nothing changes at all.
   */
  set landField(bits: Uint8Array | null) {
    this.landFieldBits = bits;
  }

  maskAt(i: number, j: number): number {
    const k = i * this.N + j;
    const lf = this.landFieldBits;
    const land = lf
      ? (lf[k >> 3] >> (7 - (k & 7))) & 1
      : (this.maskBits[k >> 3] >> (7 - (k & 7))) & 1;
    if (land) {
      const cf = this.coastFixBits;
      if (cf && (cf[k >> 3] >> (7 - (k & 7))) & 1) return 0;
      return 1;
    }
    return 0;
  }

  elevAt(i: number, j: number): number {
    return (this.dem[i * this.N + j] / 255) * this.ZMAX;
  }

  toGrid(x: number, y: number): [number, number] {
    return [(x - this.proj.X0) * this.proj.s, (y - this.proj.Y0) * this.proj.s];
  }

  /** elevation in metres at a world point, nearest node. */
  elevM(x: number, y: number): number {
    const N = this.N;
    const gx = (x - this.proj.X0) * this.proj.s;
    const gy = (y - this.proj.Y0) * this.proj.s;
    const i = Math.max(0, Math.min(N - 1, Math.round(gx)));
    const j = Math.max(0, Math.min(N - 1, Math.round(gy)));
    return this.elevAt(i, j);
  }

  /**
   * THE GROUND CHECKERBOARD WAS THE HILLSHADE, AND IT WAS A UNITS BUG.
   *
   * Reported twice and owned by nobody: "the ground renders as a checkerboard
   * of pale rectangles", loudest across the Sunset. At ROT 315 the projection
   * is axis-aligned, so a DEM cell draws as an EXACT screen-aligned rectangle
   * — 53.815 m, which is 26 x 15 px at block zoom — and those rectangles were
   * flat tiles of visibly different value on ground that is flat.
   *
   * THE CAUSE. The gradient read `(elev(i+1) - elev(i-1)) / 2 * ZEX`: metres
   * of rise per CELL, used as a slope, **with the cell's own 53.815 m width
   * never divided out**. One DEM quantum is 300/255 = 1.176 m, so a single
   * step of QUANTISATION NOISE was read as a slope of 1.176 x 3.3 = 3.88 : 1
   * — a 76 degree face — on ground whose real slope is 1.25 degrees.
   *
   * MEASURED over the 10,763 land cells whose TRUE local slope is under 2 %:
   * the light difference between vertically adjacent cells ran median 0.000,
   * p95 0.548, max 0.931 and exceeded 0.05 on 32.4 % of them; the true slope
   * runs 0.000 / 0.026 / 0.468 and 2.0 %. A third of the flat city was lit
   * differently from the cell next to it.
   *
   * And the same bug had destroyed the hills it exists for: over the whole
   * city LAM ran p01 0.000, p05 0.000, MEDIAN 0.321. Corrected it runs
   * p01 0.113, p05 0.453, median 0.730, p95 0.905.
   *
   * THE FIX IS THE MISSING DIVIDE AND NOTHING ELSE. No gain, no fitted
   * constant, no smoothing pass. A flat cell still returns exactly
   * `SUN[2]` = 0.730, so the value of open ground does not move at all. What
   * changes is only what a SLOPE returns.
   */
  /** the sun the hillshade and the ridge march are built for — see
   *  `TerrainOptions.sun`. `SUN` unless a caller says otherwise. */
  private readonly sun: readonly [number, number, number];
  /** see `TerrainOptions.reliefGain` */
  private readonly reliefGain: number;

  private buildLam(): Float32Array {
    const N = this.N;
    const L = new Float32Array(N * N);
    // `s` is exaggeration per METRE: ZEX divided by the cell's own width.
    const s = this.zex / this.cellM;
    for (let i = 1; i < N - 1; i++)
      for (let j = 1; j < N - 1; j++) {
        const gx = ((this.elevAt(i + 1, j) - this.elevAt(i - 1, j)) / 2) * s;
        const gy = ((this.elevAt(i, j + 1) - this.elevAt(i, j - 1)) / 2) * s;
        const nz = 1 / Math.sqrt(gx * gx + gy * gy + 1),
          nx = -gx * nz,
          ny = -gy * nz;
        L[i * N + j] = Math.max(
          0,
          Math.min(1, nx * this.sun[0] + ny * this.sun[1] + nz * this.sun[2]),
        );
      }
    return L;
  }

  /**
   * THE HILL OVER THE VALLEY.
   *
   * `lam` is the DIFFUSE term and nothing else: it asks which way a cell faces
   * and it never asks what is standing between that cell and the sun. On a
   * city whose whole wide shot is its hills that is the largest missing shadow
   * in the frame.
   *
   * THE MARCH. For each DEM node, step along the sun's own horizontal
   * direction and ask whether the surface ever rises above the ray. The ray's
   * slope is `SUN[2]/|SUN.xy|` = 1.0740 metres of rise per metre travelled —
   * 47.0 deg. The surface is read at the SAME vertical exaggeration `lam`
   * reads it at, so the terrain is occluded by the hills at the height they
   * are drawn.
   *
   * The maximum useful reach is the tallest exaggerated point over the ray's
   * slope: 285 m x 3.3 / 1.0740 = 876 m, which is 16.3 cells of 53.815 m. The
   * march runs 20 and stops.
   *
   * IT IS NOT A BINARY MASK. The overshoot is carried, so a ridge's shadow has
   * a penumbra instead of a hard 53.8 m staircase, and the field is then
   * smoothed with a separable 1-2-1 kernel.
   *
   * WHAT IT DOES TO THE COLOUR, AND WHY IT IS NOT A MULTIPLY. It removes the
   * DIRECT term and leaves the ambient: lam falls toward 0, which drops the
   * value through the ramp the ground already has (0.86 + 0.20*lam) and, more
   * importantly, drives `tiltOf(lam)` NEGATIVE — so a shadowed slope is
   * rendered through `SKYC` rather than `SUNC` and comes back COOL, not merely
   * dark.
   */
  private buildTsh(terrs: number): Float32Array {
    const N = this.N;
    const T = new Float32Array(N * N);
    const hl = Math.hypot(this.sun[0], this.sun[1]) || 1;
    const ux = this.sun[0] / hl,
      uy = this.sun[1] / hl;
    const cell = this.cellM;
    const tanE = this.sun[2] / hl;
    const REACH = 20;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const z0 = this.elevAt(i, j) * this.zex;
        let over = 0;
        for (let t = 1; t <= REACH; t++) {
          const fi = i + ux * t,
            fj = j + uy * t;
          const ii = fi | 0,
            jj = fj | 0;
          if (ii < 0 || jj < 0 || ii >= N - 1 || jj >= N - 1) break;
          const fx = fi - ii,
            fy = fj - jj;
          const za = this.elevAt(ii, jj),
            zb = this.elevAt(ii + 1, jj),
            zc = this.elevAt(ii, jj + 1),
            zd = this.elevAt(ii + 1, jj + 1);
          const z =
            ((za + (zb - za) * fx) * (1 - fy) + (zc + (zd - zc) * fx) * fy) *
            this.zex;
          const d = z - (z0 + t * cell * tanE);
          if (d > over) over = d;
        }
        T[i * N + j] = over <= 0 ? 0 : Math.min(1, over / terrs);
      }
    // separable 1-2-1, once each way — the penumbra, at the grid's own scale
    const B = new Float32Array(N * N);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const a = T[(i > 0 ? i - 1 : i) * N + j],
          b = T[i * N + j],
          c = T[(i < N - 1 ? i + 1 : i) * N + j];
        B[i * N + j] = (a + 2 * b + c) * 0.25;
      }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const a = B[i * N + (j > 0 ? j - 1 : j)],
          b = B[i * N + j],
          c = B[i * N + (j < N - 1 ? j + 1 : j)];
        T[i * N + j] = (a + 2 * b + c) * 0.25;
      }
    return T;
  }

  /**
   * RE-CENTRE THIS SUN'S FLAT VALUE ONTO THE PUBLISHED ONE, THEN SCALE.
   *
   * See `TerrainOptions.reliefGain`. With the published sun and a gain of 1
   * this is the identity — `this.sun[2]` IS `SUN[2]` — so the Canvas page and
   * every number ever measured against it are untouched, by construction
   * rather than by care.
   */
  private reliefMap(lam: number): number {
    const v = SUN[2] + (lam - this.sun[2]) * this.reliefGain;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /** the diffuse term with the hill's own shadow taken out of it */
  lamSh(k: number): number {
    const lam = this.reliefMap(this.lam[k]);
    return this.shadowOn ? lam * (1 - this.shadowK * this.tsh[k]) : lam;
  }

  /** drop the node colour cache — a burn phase, a canopy change, a dial move */
  invalidateNodes(): void {
    this.tnKey++;
  }

  /**
   * The node colour cache's generation.
   *
   * `GROUND_PLATE` keys on it, so anything that drops the node colours drops
   * the plate painted from them — which is the whole of what `invalidateNodes`
   * has to reach for the ground to stay correct.
   */
  get nodeGen(): number {
    return this.tnKey;
  }

  /**
   * THE NODE IS THE THING THAT CARRIES A COLOUR.
   *
   * A node's park / burn / canopy is the mean over the up-to-four LAND cells
   * that meet there — land only, so a coastal node takes the value of the land
   * it is the corner of and the bay does not darken the shore. Its elevation
   * and its Lambert are read at the node itself, which is where both are
   * already defined: `elevAt()` is a node sample and `lam`'s central
   * difference is a node quantity that was being painted as a cell.
   */
  node(i: number, j: number, burnT: number): number {
    const N = this.N;
    const k = i * N + j;
    if (this.tnST[k] === this.tnKey) return k;
    let np = 0,
      nb = 0,
      nc = 0,
      n = 0;
    for (let a = -1; a <= 0; a++)
      for (let b = -1; b <= 0; b++) {
        const ii = i + a,
          jj = j + b;
        if (ii < 0 || jj < 0 || ii >= N - 1 || jj >= N - 1) continue;
        if (!this.maskAt(ii, jj)) continue;
        const kk = ii * N + jj;
        np += this.cellPark[kk];
        nb += this.cellBurn[kk];
        nc += this.canopyFrac ? this.canopyFrac[kk] : 0;
        n++;
      }
    const li = i < 1 ? 1 : i > N - 2 ? N - 2 : i,
      lj = j < 1 ? 1 : j > N - 2 ? N - 2 : j;
    const cov = n ? nc / n : 0;
    terrainRGB(
      this.elevAt(i, j),
      this.lamSh(li * N + lj),
      n ? np / n : 0,
      n ? burnT * (nb / n) : 0,
      cov,
      sc3,
    );
    /* a wood is not one colour — see §ONE GREEN FOR EVERY TREED CELL */
    canopyMottle(k, cov, sc3);
    /* and neither is a flat district — see §AND OPEN GROUND WAS ONE COLOUR */
    groundMottle(k, cov, sc3);
    this.tnR[k] = sc3[0];
    this.tnG[k] = sc3[1];
    this.tnB[k] = sc3[2];
    this.tnST[k] = this.tnKey;
    return k;
  }

  nodeR(k: number): number {
    return this.tnR[k];
  }
  nodeG(k: number): number {
    return this.tnG[k];
  }
  nodeB(k: number): number {
    return this.tnB[k];
  }

  /**
   * Aerial perspective: the far shore washes toward the paper so that San
   * Francisco stays the subject even when Oakland is in frame.
   *
   * The cap is measured rather than picked — `warmth/haze.py` renders the
   * surround ALONE into the frame and reads the painted value back. Q's §6
   * records which way the lever points: HAZE is luminance 0.905 and the city's
   * open ground is 0.917, so hazing the surround HARDER pushes it TOWARD the
   * subject's value rather than away from it.
   */
  hazeAt(x: number, y: number): number {
    const d = Math.hypot(x - this.proj.downtown[0], y - this.proj.downtown[1]);
    return Math.max(0, Math.min(WA.hazecap, (d - 3400) / 15000));
  }
}

/**
 * BLOCK M: the city hazes toward WARM paper, not toward the cool bay. The cool
 * haze was pulling the whole fabric grey.
 */
export const HAZE = LOOK.aerial ? "#ece7dc" : "#e6e9ef";

// ── tracking is geometry, not a character ───────────────────────────────────

/**
 * TRACKING IS GEOMETRY, NOT A CHARACTER.
 *
 * The surround names used to be tracked out by joining the letters with U+2009
 * THIN SPACE, **and that made the width of every label a property of whichever
 * font happened to be resolved at the moment the layer was painted.**
 * MEASURED: U+2009 advances 2.0 px in JetBrains Mono and 6.0 px in the fallback
 * monospace — "MARIN COUNTY" comes out 116 px in one and 204 px in the other,
 * **76 % wider**.
 *
 * The webfont is fetched with `display=swap` and these names are baked into the
 * CACHED ground, so a layer painted before the font landed kept fallback
 * metrics; the two ground buffers are baked independently, so they could hold
 * different metrics and the cross-fade turned them into a doubled, illegible
 * label. **That is what ALCATRAZ, ANGEL ISLAND and MARIN COUNTY were doing in
 * the whole-city shot.**
 *
 * So the letters are advanced here, by a fraction of the type size, and **no
 * spacing character is involved.** The shell must additionally drop the ground
 * cache when `document.fonts.ready` settles, so nothing painted early can
 * survive to be cross-faded against something painted late — that half belongs
 * to P4 and is stated here because this is where the bug shows.
 */
export const NAME_TRACK = 0.46;

/**
 * How much of the bottom of the frame a surround name may not be written in.
 * 24 px is just the halo. The FILM raises it to clear its copy plate; nothing
 * else writes to it.
 */
export let NAME_BOT = 24;
export function setNameBot(px: number | null): void {
  NAME_BOT = px == null || !(px > 24) ? 24 : px;
}

export function trackedWidth(
  ctx: CanvasRenderingContext2D,
  s: string,
  size: number,
): number {
  const gap = size * NAME_TRACK;
  let w = -gap;
  for (let i = 0; i < s.length; i++) w += ctx.measureText(s[i]).width + gap;
  return w;
}

/**
 * Every halo first, then every letter — **one letter's halo laid over the
 * previous letter's ink is exactly what makes tracked-out type look chewed.**
 */
export function trackedText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
): void {
  const gap = size * NAME_TRACK;
  const adv: number[] = [];
  let w = -gap;
  for (let i = 0; i < s.length; i++) {
    const a = ctx.measureText(s[i]).width;
    adv.push(a);
    w += a + gap;
  }
  const x0 = x - w / 2;
  let cx = x0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== " ") ctx.strokeText(s[i], cx, y);
    cx += adv[i] + gap;
  }
  cx = x0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== " ") ctx.fillText(s[i], cx, y);
    cx += adv[i] + gap;
  }
}

/**
 * THE MARGIN IS THE NAME'S OWN HALF-WIDTH.
 *
 * `trackedText` centres on x, so a 40 px constant is a margin for a name 80 px
 * wide. SAN MATEO COUNTY tracks out to 151 px at size 10 and MARIN COUNTY to
 * 116, so on any frame narrow enough for their anchors to sit inside 40 px of
 * the edge **they were written straight off it**.
 */
export function nameFitsFrame(
  x: number,
  y: number,
  textW: number,
  W: number,
  H: number,
): boolean {
  return !(x - textW / 2 < 6 || x + textW / 2 > W - 6 || y < 24 || y > H - NAME_BOT);
}


// ── the surround's own names ────────────────────────────────────────────────

/**
 * One published name on the surround — `base/surround`'s own `labels`.
 */
export interface SurroundName {
  readonly n: string;
  readonly x: number;
  readonly y: number;
  /** a water body rather than a landmass */
  readonly w?: number;
  /** set smaller — the register's own bit, the two islands */
  readonly sm?: number;
}

export const SURROUND_SIZE = 10;
/** the smaller size, for the two islands the register marks `sm` */
export const SURROUND_SIZE_SM = 8.5;
export const SURROUND_INK_LAND = "rgba(72,66,54,.86)";
export const SURROUND_INK_WATER = "rgba(60,80,122,.80)";
export const SURROUND_HALO = "rgba(252,251,246,.86)";

/**
 * NAMING THE SURROUND IS THE OTHER HALF OF RECOGNISABILITY, and this layer was
 * written, ported, unit-tested and READ BY NOTHING.
 *
 * `trackedWidth`, `trackedText`, `NAME_TRACK`, `NAME_BOT` and the frame margin
 * above are all here for these seven names, and the only thing missing was the
 * call — **the same defect this port already records against `LB_ORDER`**,
 * which sorted every street label and had one occurrence in the whole tree,
 * its own definition.
 *
 * The names are PUBLISHED: seven of them on the `base/surround` chunk entry —
 * MARIN COUNTY, THE EAST BAY, ALCATRAZ, ANGEL ISLAND, SAN MATEO COUNTY,
 * PACIFIC OCEAN, SAN FRANCISCO BAY — each with a world position out of
 * `gen_context.py`. Nothing here types a coordinate or a name, and a grid that
 * carries none draws none.
 *
 * *An unlabelled grey mass north of the bridge is not Marin to anyone who has
 * not lived here.*
 *
 * WHOLE CITY ONLY, which is the reference's own `if (cam.step > 0) return`: at
 * district zoom the surround is mostly off-frame and its names point off the
 * edge of it.
 *
 * A WATER NAME SITS AT SEA LEVEL AND A LAND NAME ON THE GROUND. `w` is the
 * published bit for a water body; a water name is projected at z = 0 and a land
 * name at the surround's own elevation, or SAN FRANCISCO BAY rides up the East
 * Bay hills behind it.
 */
export function surroundNames(
  f: Frame,
  labels: readonly SurroundName[],
  elev: (x: number, y: number) => number,
): number {
  const { ctx, W, H, cam } = f;
  const c = cam as { step?: number; scale: number; base?: number };
  const b = typeof c.base === "number" && c.base > 0 ? c.base : 0.05565;
  const step = typeof c.step === "number" ? c.step : c.scale / b < 2.35 ? 0 : 1;
  if (step > 0 || !labels.length) return 0;
  let n = 0;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const L of labels) {
    const size = L.sm ? SURROUND_SIZE_SM : SURROUND_SIZE;
    ctx.font = `500 ${size}px "JetBrains Mono",ui-monospace,monospace`;
    const p = f.proj.proj(L.x, L.y, L.w ? 0 : elev(L.x, L.y));
    const x = sx(f, p),
      y = sy(f, p);
    const tw = trackedWidth(ctx, L.n, size);
    if (!nameFitsFrame(x, y, tw, W, H)) continue;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = SURROUND_HALO;
    ctx.fillStyle = L.w ? SURROUND_INK_WATER : SURROUND_INK_LAND;
    trackedText(ctx, L.n, x, y, size);
    n++;
  }
  ctx.textAlign = "center";
  ctx.restore();
  return n;
}

// ── the paper ───────────────────────────────────────────────────────────────

/**
 * A canvas, or nothing at all under Node.
 *
 * `draw.test.ts` runs in vitest with no DOM and no rasteriser, and the rule
 * this port is held to is no new dependencies — so everything in this file
 * that needs a real canvas asks for one here and **no-ops when there is
 * none**, rather than pulling one in.
 */
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function newCanvas(w: number, h: number): AnyCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function ctxOf(c: AnyCanvas): CanvasRenderingContext2D | null {
  return c.getContext("2d") as CanvasRenderingContext2D | null;
}

/**
 * BLOCK M: THE PAPER. And it is 100 % of the frame at low magnitude, which is
 * why it is worth its place: it is exactly the faint 12-32 band that dominates
 * every whole-city row of the parity difference.
 *
 * Vector flat is the other half of the 90s read. One 96 x 96 tile of
 * DETERMINISTIC value noise, tiled over the ground at low alpha, is how
 * illustration escapes it. The tooth is in SCREEN space and does not move with
 * the camera, which is correct: **the paper does not pan.** Seeded, built
 * once; a per-frame noise would shimmer, and a randomised one would be
 * invented data with a different value every reload.
 *
 * The tile carries **both signs of its own alpha** — a warm dark tooth and a
 * warm light one, alpha-weighted — so ONE `source-over` fill does what a
 * two-way `overlay` blend was doing. That is the whole of why it is
 * affordable: a full-frame separable blend mode over 5.4 M pixels is not a
 * per-frame effect in this renderer (MEASURED in the mock at 1440 x 940 DPR 2:
 * playback 117 -> 33 fps, a district pan 46 -> 21).
 *
 * ITS HISTORY IS WORTH KEEPING, because a later write-up got it backwards and
 * claimed the treatment had been rejected. It was not. It was **measured at
 * 11 ms per ground rasterisation and deliberately kept**, because it suits the
 * register — and it is paid per ground rasterisation rather than per frame,
 * which here means it is paid inside `GROUND_PLATE` and not otherwise.
 */
const GRAIN_SEED = 19060418;

function grainTile(wash: boolean): AnyCanvas | null {
  const n = 96,
    m = wash ? 8 : n;
  const src = newCanvas(m, m);
  if (!src) return null;
  const sg = ctxOf(src);
  if (!sg) return null;
  const im = sg.createImageData(m, m),
    d = im.data;
  let s = GRAIN_SEED >>> 0;
  for (let i = 0; i < m * m; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    const v = s / 4294967296 - 0.5; // -0.5 .. +0.5
    const dark = v < 0;
    d[i * 4] = dark ? 58 : 255;
    d[i * 4 + 1] = dark ? 48 : 252;
    d[i * 4 + 2] = dark ? 32 : 242;
    d[i * 4 + 3] = Math.round(Math.abs(v) * 2 * 255);
  }
  sg.putImageData(im, 0, 0);
  if (!wash) return src;
  /*
   * AND THE OTHER KIND OF PAPER. The tile above is a TOOTH: per-pixel noise,
   * the grain of the sheet. Gouache board has a second texture that is not
   * grain at all — the WASH, the low-frequency unevenness of a flat colour
   * laid down by hand, which is what separates a painted flat from a vector
   * flat. Same machinery, an 8 x 8 field smoothed up to 96 x 96 by the
   * browser's own bilinear filter, so one cell is ~12 css px instead of 1.
   * Same seed.
   */
  const c = newCanvas(n, n);
  if (!c) return null;
  const g = ctxOf(c);
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, n, n);
  return c;
}

let GRAIN_TOOTH: AnyCanvas | null = null,
  GRAIN_WASH: AnyCanvas | null = null,
  GRAIN_BUILT = false;

/**
 * `LOOK.grain` level -> [pattern scale, alpha, which tile].
 *
 * **At DPR 2 a one-device-pixel grain is not a tooth, it is mush**: the
 * browser resolves it below the eye's acuity and what arrives is a flat 2 %
 * darkening. The tooth has to be 2-3 device pixels to read as paper at all,
 * which is what the scale of 2 is for. The shipped level is 1.
 */
export const GRAIN_LV: readonly (readonly [number, number, number] | null)[] = [
  null,
  [2, 0.03, 0],
  [2, 0.03, 0],
  [2, 0.055, 0],
  [2, 0.09, 0],
  [1, 0.22, 1],
  [2, 0.34, 1],
  [1, 0.45, 1],
];

/** patterns belong to the context that made them — the `wallGrad` rule. */
const grainPatterns = new WeakMap<
  CanvasRenderingContext2D,
  Map<number, CanvasPattern | null>
>();

/**
 * Tooth the whole of `w x h`, in the context's own units.
 *
 * Returns false where there is no paper to lay — no canvas factory (Node), or
 * `LOOK.grain` off — so a caller can count what it actually painted.
 */
export function paintGrain(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode?: GlobalCompositeOperation,
  /**
   * Where the tile's own origin sits, in the context's user space. THE PAPER
   * DOES NOT PAN, so a plate painted with a pad has to anchor its tooth to the
   * FRAME's origin and not the plate's — otherwise the tooth's phase jumps by
   * the pad at the instant the camera settles and the padded plate is replaced
   * by an exact one. 96 px tile at pattern scale 2 is a 192 px period and the
   * pad is 123; a shift of two thirds of a period is the whole tooth moving.
   */
  ox = 0,
  oy = 0,
): boolean {
  const lv = LOOK.grain | 0;
  const spec = lv > 0 && lv < GRAIN_LV.length ? GRAIN_LV[lv] : null;
  if (!spec) return false;
  const [sc, al, tl] = spec;
  if (!GRAIN_BUILT) {
    GRAIN_TOOTH = grainTile(false);
    GRAIN_WASH = grainTile(true);
    GRAIN_BUILT = true;
  }
  const tile = tl ? GRAIN_WASH : GRAIN_TOOTH;
  if (!tile) return false;
  let m = grainPatterns.get(g);
  if (!m) {
    m = new Map();
    grainPatterns.set(g, m);
  }
  let pat = m.get(lv);
  if (pat === undefined) {
    pat = g.createPattern(tile, "repeat");
    if (pat && typeof DOMMatrix !== "undefined" && pat.setTransform)
      pat.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
    m.set(lv, pat);
  }
  if (!pat) return false;
  const a = g.globalAlpha,
    o = g.globalCompositeOperation;
  if (mode) g.globalCompositeOperation = mode;
  g.globalAlpha = al;
  g.fillStyle = pat;
  if (ox || oy) {
    g.save();
    g.translate(ox, oy);
    g.fillRect(-ox, -oy, w, h);
    g.restore();
  } else {
    g.fillRect(0, 0, w, h);
  }
  g.globalAlpha = a;
  g.globalCompositeOperation = o;
  return true;
}

/** drop every cached grain pattern — a `LOOK.grain` move */
export function invalidateGrain(): void {
  GRAIN_BUILT = false;
  GRAIN_TOOTH = null;
  GRAIN_WASH = null;
}

// ── the ground is rasterised once per (band, camera), not once per frame ────

/**
 * THE GROUND IS THE FRAME'S COST, AND IT IS MEASURED.
 *
 * `scratchpad/r2/rastercost.py` times `scene.paint` itself with a
 * `getImageData` flush INSIDE the timed region — Canvas 2D is deferred and
 * timing the call alone measures JS only, which has fooled four agents on this
 * project — and forces a full re-render (`cur = null`) for every sample, so
 * nothing incremental is being measured. Per-layer by prod's own `?layers=`
 * ablation, 1200 x 680, DPR 2, median of 7-19 samples:
 *
 * ```
 *   camera            all      -surround   -terrain    ground's share
 *   A4 whole city     404 ms   178 ms      308 ms      322 ms   80 %
 *   B3 district       459 ms   447 ms      197 ms      261 ms   57 %
 * ```
 *
 * **The surround is 226 ms of the whole-city frame and the city's own DEM is
 * 261 ms of the district frame**, and at district the surround is off-frame
 * and free. That is `FILM.md` §6's residual, measured rather than left as a
 * residual: between rasterisations the film is free and every rasterisation is
 * a frozen frame, and 57-80 % of every one of them is ground that **did not
 * change**.
 *
 * So each of the two ground passes keeps a plate. The plate is painted at the
 * frame's own size and blitted 1:1, which is **exact**: `source-over` is
 * associative, so painting the cells into a transparent plate and compositing
 * that over the water is pixel-for-pixel what painting the cells straight onto
 * the water does, antialiased edges included.
 *
 * WHAT THE KEY DOES AND DOES NOT CARRY. It carries the camera, so it does NOT
 * survive a zoom — and that is deliberate rather than a shortfall. A
 * scale-tolerant plate (paint at camera A, blit at camera B) is exact in
 * geometry by the same similarity argument the frame buffer itself rests on,
 * but it is a resample: holding it to 1.3x of its painted scale over the
 * film's z 3.2 -> 28 move needs about seven plates where the buffer currently
 * takes two to five rasterisations. **It would do more work, not less**, so it
 * is not done. What the key omits is the year, the tier and the data: those
 * are what force most re-rasterisations, and the ground is identical across
 * all of them. A century scrub at a fixed camera, a hold while a tier lands
 * and the settle raster after a move now cost the ground once.
 */
interface GroundPlate {
  readonly cv: AnyCanvas;
  readonly g: CanvasRenderingContext2D;
  /** everything the plate depends on EXCEPT where the camera is looking */
  rest: string;
  /** the camera it was painted for */
  cx: number;
  cy: number;
  s: number;
  /** the frame it was painted for, in CSS px, and its device-pixel pad */
  W: number;
  H: number;
  dpr: number;
  padX: number;
  padY: number;
  /** the quality tier it was painted at — see `plateFor`'s tier order */
  mv: boolean;
  cells: number;
  subQuads: number;
}

/**
 * HOW MANY PLATES MAY EXIST AT ONCE, AND WHY IT IS A GLOBAL CAP.
 *
 * A plate is a full device-resolution RGBA canvas — 13 MB at the 1200 x 680
 * stage at DPR 2, and about 16 MB at the film's own buffer, which is painted
 * with the motion margin on it. There is one `TerrainField` and one
 * `SurroundGrid` PER BAND, so a cache hung off each of them with two slots
 * apiece is **twelve** live full-frame canvases, 150-190 MB, for a page that is
 * shown to a room off one laptop. Only one band is ever drawn in a frame, so
 * the cap is global rather than per band and the field's identity goes in the
 * KEY: two slots each for the ground and the surround, which is what the
 * renderer's own two buffer sizes need and nothing more.
 */
const PLATE_SLOTS = 2;

/**
 * DEV-ONLY, the same idiom as `__cityWA` above. Block C2's whole argument is
 * about HOW MANY ground rasterisations a camera move forces and what camera
 * each of them is at, and neither number was written down anywhere. This
 * records one row per ground pass — the camera, the frame size, and whether
 * the plate hit — so the question is answered by reading the sequence off the
 * running film rather than by reasoning about `decideRaster` from outside.
 */
export const GPROBE: {
  on: boolean;
  log: {
    k: string;
    W: number;
    H: number;
    dpr: number;
    cx: number;
    cy: number;
    s: number;
    mv: number;
    hit: number;
    /** 1 when the plate was laid down 1:1, 0 when it was resampled */
    ex: number;
    t: number;
    key: string;
  }[];
} = { on: false, log: [] };
function gprobe(
  k: string,
  f: Frame,
  hit: boolean,
  key: string,
  ex: boolean,
) {
  if (!GPROBE.on) return;
  if (GPROBE.log.length > 4000) return;
  GPROBE.log.push({
    k,
    W: f.W,
    H: f.H,
    dpr: f.dpr,
    cx: f.cam.cx,
    cy: f.cam.cy,
    s: f.cam.scale,
    mv: f.moving ? 1 : 0,
    hit: hit ? 1 : 0,
    ex: ex ? 1 : 0,
    t: typeof performance !== "undefined" ? performance.now() : 0,
    key,
  });
}
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityGPROBE?: typeof GPROBE }).__cityGPROBE = GPROBE;
}


/**
 * §GPROBE's sibling, and the answer to a class of bug an ablation cannot find.
 *
 * BUGS §23's low-frequency gap is ALWAYS-ON in both builds — every switchable
 * treatment was ranked in §20.13 and none of them is it, because switching a
 * term off removes it from both sides. What finds a value difference is
 * reading the value out of both builds AT THE SAME INPUT: the ground's colour
 * is a pure function of (z, lam, park, burn, canopy) and so is the
 * reference's, so the two can be sampled over their whole domain and
 * subtracted, with no camera, no frame, no threshold and no blur kernel in
 * the way.
 *
 * The same shape as the proof that closed the back-wall bug — capture the
 * actual polygons out of both builds and compare — on colour instead of
 * geometry.
 *
 * Dev only, and it exports the FUNCTIONS rather than copies of them, so a
 * sample cannot drift from what the renderer runs.
 */
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityGROUND?: unknown }).__cityGROUND = {
    terrainColor,
    terrainRGB,
    skylit,
    skylitN,
    shade,
    lerpHex,
    tiltOf,
    luminance,
    tbl: () => WTBL.slice(),
    consts: () => ({
      WTQ, WCQ, LAM0, QWARM,
      SUNC: [...SUNC], SKYC: [...SKYC],
      WG0, WG1, WPK0, WPK1, WCN0, WCN1,
      BRN: [...BRN],
      HAZE,
      WPAL: { ...WPAL },
      WFLG_tint: WFLG.tint,
      hazecap: WA.hazecap,
    }),
  };
}

/** a stable id per field/grid, so the identity can live in the key string */
const plateIds = new WeakMap<object, number>();
let plateIdNext = 1;
function plateId(o: object): number {
  let id = plateIds.get(o);
  if (id === undefined) {
    id = plateIdNext++;
    plateIds.set(o, id);
  }
  return id;
}

/**
 * HOW FAR A PLATE MAY BE BLOWN UP. Measured, in `DRAW.md` 19, against the 132
 * ground builds the film's eight travels actually forced.
 *
 * `PLATE_KMAX` is a ceiling on `frameScale / plateScale`. Below 1 the plate is
 * MINIFIED, which is sharper than painting it, so only the upper end needs a
 * bound. 1.30 is inside what the film's own frame buffer already does to the
 * whole picture during a move (`camera.ts` EXT_K_MAX = 1.70) and, unlike a
 * street hairline, the ground has nothing in it at that spatial frequency —
 * ablated by eye in `DRAW.md` 19.6.
 *
 * A resampled plate is only ever shown WHILE THE CAMERA IS TRAVELLING: a
 * settled camera gets a plate at its own scale and a pixel-exact 1:1 blit, so
 * nothing a reader stops on is resampled.
 */
export const PLATE_KMAX = 1.3;

/**
 * HOW A TRAVELLING PLATE BUYS ITS COVERAGE, AND THE ONE INVARIANT IT MAY NOT
 * BREAK.
 *
 * A plate has to hold more than the frame or the first pan puts a hole at the
 * edge. There are two ways and only one of them is safe.
 *
 * The cheap way is to paint the plate at `scale / 1.10` into a canvas of the
 * frame's own size: 1.10x more world for no pixels at all, paid in
 * magnification headroom instead of raster. It measured beautifully — worst
 * frame of the eight travels 733 / 709 / 900 / 517 / 426 / 650 / 608 / 675 ms
 * — and it is WRONG, because a plate painted that way does not serve the frame
 * that built it at 1:1. `.parity/c2settle.py`: a wheel zoom in the explorer is
 * three ground passes, all three of them BUILDS, and there is no fourth — the
 * page does not repaint after a gesture, so a resampled ground laid down on
 * the last of them is the picture the reader keeps. Neither `f.moving` nor
 * "the camera repeated itself" identifies that frame in advance.
 *
 * So: **a build is always exact for its own frame**, and the coverage comes
 * from a PAD — `PLATE_PAD` per side, as a fraction of the frame — which leaves
 * the plate at the frame's own scale and centre. A frame that builds gets a
 * 1:1 sub-rect blit and cannot be resampled by construction, whatever the
 * renderer thought it was doing; only a frame that REUSES a plate is ever
 * resampled, and reuse is gated on the camera travelling.
 *
 * The pad costs `(1+2*PAD)²` = 1.25x pixels on a build. It is paid on the
 * motion tier (see `plateFor`), which is about half price, so it lands where a
 * settled build never sees it.
 */
export const PLATE_PAD = 0.06;

/**
 * The blit that takes a plate painted for camera A to a frame at camera B.
 *
 * `SX`/`SY` are `(p - cam.c) * cam.scale + centre`, and `proj()` does not see
 * the camera at all, so the ground at camera B is EXACTLY the ground at camera
 * A under a uniform scale and a translation — the same similarity argument the
 * frame buffer itself rests on, one layer down. In frame DEVICE pixels, with
 * `k = B.scale / A.scale`:
 *
 *     X = k*u + (A.cx - B.cx)*B.scale*dpr + W*dpr/2 - k*Wp/2
 *     Y = k*v + (H/2 - (A.cy - B.cy)*B.scale)*dpr   - k*Hp/2
 *
 * where `(u, v)` is a plate device pixel and `Wp, Hp` are the plate's own
 * device size. Returns the destination rect, or null when the plate does not
 * cover the frame or would have to be magnified past `PLATE_KMAX`.
 */
export interface PlateGeom {
  /** the plate canvas, in device px */
  readonly pw: number;
  readonly ph: number;
  /** the camera it was painted for */
  readonly cx: number;
  readonly cy: number;
  readonly s: number;
}

export function plateRect(
  p: PlateGeom,
  cam: ViewCamera,
  W: number,
  H: number,
  dpr: number,
  kmax: number,
): { dx: number; dy: number; dw: number; dh: number } | null {
  const k = cam.scale / p.s;
  if (!(k > 0) || k > kmax + 1e-9) return null;
  const Wd = W * dpr,
    Hd = H * dpr;
  const dw = k * p.pw,
    dh = k * p.ph;
  const dx = (p.cx - cam.cx) * cam.scale * dpr + Wd / 2 - dw / 2;
  const dy = Hd / 2 + (p.cy - cam.cy) * cam.scale * dpr - dh / 2;
  // the frame's own device rect has to sit inside it, or the ground has a hole
  if (dx > 1e-6 || dy > 1e-6 || dx + dw < Wd - 1e-6 || dy + dh < Hd - 1e-6)
    return null;
  return { dx, dy, dw, dh };
}

function plateBlit(
  p: GroundPlate,
  f: Frame,
  kmax: number,
): { dx: number; dy: number; dw: number; dh: number } | null {
  return plateRect(
    { pw: p.cv.width, ph: p.cv.height, cx: p.cx, cy: p.cy, s: p.s },
    f.cam,
    f.W,
    f.H,
    f.dpr,
    kmax,
  );
}

/** true when this plate is the frame's camera exactly, to the device pixel */
function plateExact(p: GroundPlate, f: Frame): boolean {
  return (
    p.s === f.cam.scale &&
    p.cx === f.cam.cx &&
    p.cy === f.cam.cy &&
    p.dpr === f.dpr &&
    p.W === f.W &&
    p.H === f.H
  );
}

function plateFor(
  cache: GroundPlate[],
  f: Frame,
  rest: string,
  restSettled: string,
  travelling: boolean,
): { plate: GroundPlate; hit: boolean } | null {
  /*
   * A SETTLED PLATE MAY SERVE A TRAVELLING FRAME; THE REVERSE MAY NOT.
   * `rest` carries the quality tier, so a motion-tier plate and a settled one
   * are different plates — which is right, and it would also mean the first
   * frame of a travel could not reuse the hold's plate it is a few pixels
   * away from. The tier is an ORDER, not a name: a plate painted at settled
   * quality is a legal answer to any frame, so a travelling frame matches
   * either key and a settled frame matches only its own.
   */
  const ok = (p: GroundPlate) =>
    p.rest === rest || (travelling && p.rest === restSettled);
  // an exact camera always wins, whatever else is in the cache: it blits 1:1
  for (let i = 0; i < cache.length; i++) {
    const p = cache[i];
    if (!ok(p) || !plateExact(p, f)) continue;
    if (i) {
      cache.splice(i, 1);
      cache.unshift(p);
    }
    return { plate: p, hit: true };
  }
  /*
   * A RESAMPLED PLATE IS ONLY EVER SHOWN WHILE THE CAMERA IS MOVING. The
   * signal is the ground pass itself: a settled camera asks for the same
   * camera twice running, a travel never does. So a frame that repeats its
   * predecessor falls through to a full repaint at its own camera and the
   * hold is sharp from its second frame, which is the frame that would have
   * built the plate anyway.
   */
  if (travelling)
    for (let i = 0; i < cache.length; i++) {
      const p = cache[i];
      if (!ok(p) || p.dpr !== f.dpr || p.W !== f.W || p.H !== f.H) continue;
      if (!plateBlit(p, f, PLATE_KMAX)) continue;
      if (i) {
        cache.splice(i, 1);
        cache.unshift(p);
      }
      return { plate: p, hit: true };
    }
  const padX = travelling ? Math.round(PLATE_PAD * f.W * f.dpr) : 0,
    padY = travelling ? Math.round(PLATE_PAD * f.H * f.dpr) : 0;
  const w = Math.max(1, Math.round(f.W * f.dpr) + 2 * padX),
    h = Math.max(1, Math.round(f.H * f.dpr) + 2 * padY);
  // reuse a slot of the right size before allocating one
  let plate: GroundPlate | null = null;
  for (let i = 0; i < cache.length; i++)
    if (cache[i].cv.width === w && cache[i].cv.height === h) {
      plate = cache.splice(i, 1)[0];
      break;
    }
  if (!plate) {
    const cv = newCanvas(w, h);
    if (!cv) return null;
    const g = ctxOf(cv);
    if (!g) return null;
    plate = {
      cv,
      g,
      rest: "",
      cx: 0,
      cy: 0,
      s: 0,
      W: 0,
      H: 0,
      dpr: 1,
      padX: 0,
      padY: 0,
      mv: false,
      cells: 0,
      subQuads: 0,
    };
  }
  plate.g.setTransform(1, 0, 0, 1, 0, 0);
  plate.g.clearRect(0, 0, w, h);
  plate.g.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  plate.rest = rest;
  plate.cx = f.cam.cx;
  plate.cy = f.cam.cy;
  plate.s = f.cam.scale;
  plate.W = f.W;
  plate.H = f.H;
  plate.dpr = f.dpr;
  plate.padX = padX;
  plate.padY = padY;
  plate.mv = travelling || f.moving;
  cache.unshift(plate);
  while (cache.length > PLATE_SLOTS) cache.pop();
  return { plate, hit: false };
}

/**
 * The Frame a plate is PAINTED through: the same camera, widened by the pad so
 * the rasteriser's own culling reaches into the margin. `sx` is
 * `(p - cx) * scale + W/2`, so widening W by `2*padX/dpr` moves every mark
 * right by exactly `padX` device pixels — which is where the pad is — and the
 * tier goes with the plate, not with the frame that asked for it.
 */
function plateFrame(f: Frame, p: GroundPlate): Frame {
  const q = { ...f, ctx: p.g, moving: p.mv };
  return p.padX || p.padY
    ? { ...q, W: f.W + (2 * p.padX) / f.dpr, H: f.H + (2 * p.padY) / f.dpr }
    : q;
}

/** lay a plate on the frame; 1:1 and integer-aligned when the camera matches */
function plateDraw(f: Frame, p: GroundPlate): void {
  f.ctx.save();
  f.ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (plateExact(p, f)) {
    const Wd = Math.round(f.W * f.dpr),
      Hd = Math.round(f.H * f.dpr);
    f.ctx.drawImage(p.cv, p.padX, p.padY, Wd, Hd, 0, 0, Wd, Hd);
  } else {
    const b = plateBlit(p, f, PLATE_KMAX);
    if (b) f.ctx.drawImage(p.cv, b.dx, b.dy, b.dw, b.dh);
  }
  f.ctx.restore();
}

/**
 * IS THE CAMERA TRAVELLING — the one signal a resampled plate is gated on, and
 * it takes two answers because the page has two clocks.
 *
 * IN THE EXPLORER `f.moving` is the truth and it is used as the truth. A
 * gesture rasterises two or three times and the LAST of those is the settle,
 * with `moving` false — and nothing repaints after it, so a resampled ground
 * laid down there would stay on screen until the reader touched the map again.
 * MEASURED, `.parity/c2settle.py`: a wheel zoom is three ground passes, all
 * three of them builds, and the last one is the picture the reader keeps.
 *
 * IN THE FILM `renderer.ts` forces `moving` false on every frame (`const
 * moving = film ? false : …`, FILM.md §6b's open item 2), so there is no such
 * signal and the camera itself is the signal: a travel never repeats a camera,
 * a hold repeats it every frame. That is safe HERE and not in the explorer for
 * one reason — the film keeps painting. The frame after a travel's last
 * rasterisation asks for the same camera again, reads as settled, and repaints
 * the ground at its own scale and its own tier.
 *
 * `f.year` is the discriminator, and it is not a proxy: it is the film's year,
 * and it is `undefined` exactly when there is no film.
 *
 * The last camera is remembered PER `rest` KEY rather than per cache, because
 * the page paints more than one canvas — the stage and the film's own extended
 * buffer are different sizes and alternate, and one shared last-camera would
 * read every settled frame as a travel.
 */
const lastCam = new Map<string, string>();
function travelling(rest: string, f: Frame): boolean {
  const k = `${f.cam.cx}|${f.cam.cy}|${f.cam.scale}`;
  const was = lastCam.get(rest);
  if (lastCam.size > 32) lastCam.clear();
  lastCam.set(rest, k);
  if (f.year === undefined) return f.moving;
  return was !== undefined && was !== k;
}

/**
 * Everything a ground rasterisation is a function of, other than the geometry
 * the caller keys separately. The dials are live objects the studies page
 * mutates in place, so their VALUES go in the key rather than a generation
 * counter that nothing would bump.
 */
function dialsKey(moving: boolean, dpr: number): string {
  const t = resTune(dpr, moving);
  return (
    `${t.tgt}|${t.kmax}|${t.minpx}|${WA.smooth}|${WA.ramp}|${WA.rampq}|` +
    `${WA.hazecap}|${QWARM}|${LOOK.grain}|${LOOK.aerial}|${LOOK.palette}|` +
    `${QF.warm}|${QF.relief}|${QF.xlam}|${QF.coast}|${WFLG.tint}|${LOOK.relief2}`
  );
}

/**
 * Everything about the frame a plate depends on OTHER than where the camera is
 * looking. The centre and the scale are held on the plate itself, because a
 * plate that only differs from the frame by those two is a resample away from
 * being the right plate (see `plateBlit`); the bearing, the tilt and the
 * vertical exaggeration are not — a change in any of them is a different
 * picture, not a different view of one.
 */
function viewKey(f: Frame): string {
  return `${f.W}x${f.H}@${f.dpr}|${f.proj.rotDeg}|${f.proj.sA}|${f.proj.zex}`;
}

// ── one cell, painted as the piece of surface it is ─────────────────────────

/**
 * THE RAMP IS CACHED THE WAY `wallGrad` IS, AND FOR THE SAME REASON.
 *
 * `createLinearGradient` per cell is the mistake this file already recorded
 * once: per face at block zoom it took `drawCity` from 60.3 ms to 74.0. On a
 * uniform grid the cache hits hard, because **every cell in a surround ROW
 * shares its two y-coordinates** — only the two colours vary along it — so the
 * key is a row key plus a colour pair. Ends quantise to `WA.gq` CSS px, and
 * the cache hangs off the CONTEXT, because a gradient belongs to the context
 * that made it and the suite paints into a canvas of its own.
 */
const rampCaches = new WeakMap<
  CanvasRenderingContext2D,
  Map<string, CanvasGradient>
>();

function cellRamp(
  ctx: CanvasRenderingContext2D,
  down: boolean,
  x0: number,
  y0: number,
  x2: number,
  y2: number,
  a: string,
  b: string,
): CanvasGradient {
  let m = rampCaches.get(ctx);
  if (!m) {
    m = new Map();
    rampCaches.set(ctx, m);
  }
  const q = WA.rampq;
  const p0 = Math.round((down ? y0 : x0) / q) * q;
  const p1 = Math.round((down ? y2 : x2) / q) * q;
  const key = `${down ? "v" : "h"}|${p0}|${p1}|${a}|${b}`;
  let g = m.get(key);
  if (!g) {
    g = down
      ? ctx.createLinearGradient(0, p0, 0, p1 === p0 ? p0 + 1 : p1)
      : ctx.createLinearGradient(p0, 0, p1 === p0 ? p0 + 1 : p1, 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    if (m.size > 6000) m.clear();
    m.set(key, g);
  }
  return g;
}

/**
 * The corner arrays are (screen x, screen y) at the four nodes.
 *
 * `proj()` is LINEAR in (x, y, z), so bilinear interpolation of the four
 * projected corners is EXACTLY the projection of the bilinearly interpolated
 * surface — the sub-quads are not an approximation of the geometry, only of
 * the shading, and adjacent sub-quads and adjacent cells share their corner
 * arithmetic character for character, so there is no crack to fill.
 *
 * Returns the number of sub-quads drawn.
 */
export function paintCell(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  cr: ArrayLike<number>,
  cg: ArrayLike<number>,
  cb: ArrayLike<number>,
  tgt: number,
  kmax: number,
  minpx: number,
  /**
   * OUTWARD BLEED ON THE +u AND +v SIDES, IN CSS PX — P4b, and it closes the
   * one artefact this whole function exists to remove, at the one place it was
   * not removing it.
   *
   * The one-third overlap below is INTRA-CELL. It never reaches the cell's own
   * outer edge: `u1` was `min(1, (a+1)/kx + ov)`, and at the last column that
   * clamp lands exactly on the boundary where the neighbour begins. So every
   * cell abutted its neighbour precisely, Canvas antialiased both edges, and
   * the shared edge composited to `1 − a + a² < 1` — leaking whatever was
   * painted underneath. On the surround that underneath is the BAY PLATE, so
   * the leak is blue and the whole of Marin and San Mateo carried a fine hatch
   * at the cell pitch.
   *
   * MEASURED, on the shipped frame at 1440 × 940 DPR 2: the predicted surround
   * cell is 12.02 × 7.38 device px and the dominant x-period of the hatch is
   * 11.92 px in Marin and 11.85 in San Mateo — the CELL pitch, not the
   * sub-quad pitch, which would have been 12/kx. And the seam pixels are a
   * colour the surround cannot paint: over all 56,330 own cells and every
   * lighting, tilt and haze state, `R − B` runs min +2.58 / median +20.27 and
   * is **never negative**; the seam pixels read **R − B = −17.2** against a
   * field of +2.7. That is the plate showing through, not a shading step.
   *
   * The Lambert is NOT the cause and was measured to rule it out: `|Δlam|`
   * between adjacent surround land cells runs median 0.019 / p95 0.160
   * horizontally and 0.025 / 0.235 vertically, against the fixed city DEM's
   * own 0.024 / 0.190 and 0.025 / 0.208. **The surround's light field is
   * statistically indistinguishable from the city's**, so there is no step to
   * smooth and smoothing it would erase real relief to hide a compositing bug.
   *
   * In a controlled Chromium reproduction at the same cell size over the same
   * blue, half a device pixel of outward bleed took the column-profile
   * standard deviation from **2.243 to 0.080 — 28×** — and returned the seam
   * pixel to the field colour.
   *
   * **Nothing is invented by the bleed.** `proj()` is linear and the cells
   * tessellate exactly, so the sliver painted past the boundary is a bilinear
   * extrapolation of the same surface the neighbour interpolates there, in a
   * colour that differs from the neighbour's own by at most one `tgt` step.
   * It is the neighbour's pixel, painted twice, instead of neither cell's.
   *
   * The caller decides, and only `drawSurround` asks: the city's own DEM does
   * not show the artefact (it is painted over ground, not over the plate) and
   * its edge cells front the coastline, where half a pixel of bleed would put
   * land over published water. `part3.html` has the same two clauses character
   * for character and the same seam — the mock's own `drawContext` measures
   * R − B −0.9 against a field of +21.5 — so **this is not a port regression
   * and the mock is not the reference for it.**
   */
  bleedU = 0,
  bleedV = 0,
): number {
  const x0 = xs[0],
    x1 = xs[1],
    x2 = xs[2],
    x3 = xs[3];
  const y0 = ys[0],
    y1 = ys[1],
    y2 = ys[2],
    y3 = ys[3];
  const wpx = Math.max(Math.abs(x1 - x0), Math.abs(x2 - x3));
  const hpx = Math.max(Math.abs(y3 - y0), Math.abs(y2 - y1));
  /* the bleed, as a fraction of this cell's own size — see the parameter */
  const bu = bleedU > 0 ? bleedU / Math.max(1e-6, wpx) : 0;
  const bv = bleedV > 0 ? bleedV / Math.max(1e-6, hpx) : 0;
  let kx = 1,
    ky = 1;
  if (tgt > 0) {
    /*
     * THE SUBDIVISION IS CHOSEN BY THE COLOUR STEP, NOT BY THE PIXEL.
     *
     * A fixed pixel target subdivides the Sunset — a square mile of ground
     * whose four corner colours are the same number — as hard as it
     * subdivides a Twin Peaks hillside, and MEASURED that way the ground plate
     * cost 160-175 ms at every camera. The thing a seam is made of is the
     * VALUE STEP across it, so that is what sets k: enough sub-quads that no
     * step exceeds `tgt` of 255, and never more than one per `minpx` of
     * screen, because a step finer than the pixel it lands in cannot be seen.
     *
     * A cell with no gradient in it gets one fill and is not approximated at
     * all — every sub-quad drawn is carrying a value the frame would otherwise
     * not have.
     */
    const du = Math.max(
      Math.abs(cr[1] - cr[0]),
      Math.abs(cg[1] - cg[0]),
      Math.abs(cb[1] - cb[0]),
      Math.abs(cr[2] - cr[3]),
      Math.abs(cg[2] - cg[3]),
      Math.abs(cb[2] - cb[3]),
    );
    const dv = Math.max(
      Math.abs(cr[3] - cr[0]),
      Math.abs(cg[3] - cg[0]),
      Math.abs(cb[3] - cb[0]),
      Math.abs(cr[2] - cr[1]),
      Math.abs(cg[2] - cg[1]),
      Math.abs(cb[2] - cb[1]),
    );
    kx = Math.max(
      1,
      Math.min(kmax, Math.min(Math.ceil(du / tgt), Math.floor(wpx / minpx))),
    );
    ky = Math.max(
      1,
      Math.min(kmax, Math.min(Math.ceil(dv / tgt), Math.floor(hpx / minpx))),
    );
  }
  /*
   * The flat fast path. At ROT 315 the projection is axis-aligned, so a cell
   * whose four corners sit at one elevation is an EXACT screen rectangle and
   * `fillRect` draws it without a path, without four line segments and without
   * an antialiased edge to seam against. Most of the Sunset, SoMa and the
   * Mission is that cell.
   */
  const flat = y1 === y0 && y2 === y3 && x3 === x0 && x2 === x1;
  /* A cell with a bleed goes through the loop below even at k = 1, because the
     bleed IS the last column's and the last row's `u1`/`v1`. One fill either
     way — the fast path's only advantage is skipping the bilinear, and the
     bilinear at k = 1 returns the same mean of the four corners. */
  if (kx === 1 && ky === 1 && bu === 0 && bv === 0) {
    /* ── THE PIXEL FLOOR IS A STEP IN THE DERIVATIVE, AND AT DPR 1 IT LANDS
           ON EVERY SURROUND CELL ────────────────────────────────────────
       `k` is `min(ceil(d/tgt), floor(px/minpx))`, and `minpx` is 2 DEVICE px
       at every DPR. At DPR 2 the surround cell is 12.02 x 7.38 device px and
       the vertical subdivision runs up to 7; at DPR 1 the same cell is
       6.01 x 3.69 and `floor(3.69/2)` pins `ky` to **1 on every cell of the
       surround, whatever the value step is**. The cell is then painted as the
       MEAN of its four nodes, so the bilinear surface this whole function
       exists to draw is replaced by a staircase whose tread is the cell:
       measured vertical cell-to-cell step median **1.48**, p95 **8.86**, max
       **20.70** of 255, against a `tgt` of 1.5.

       The floor itself is right and stays — a sub-quad finer than the pixel it
       lands in is paint nobody can see. What is wrong is painting a CONSTANT
       when the floor bites. A linear gradient down the cell is the same number
       of fills, needs no sub-quad, and along the axis it runs on it is
       **exactly** the bilinear surface: with `k = 1` in that axis the bilinear
       reduces to a linear interpolation between the two edge means. The other
       axis keeps the mean, which is what the flat path already did in both.

       Only where the step is worth it (`> tgt`), and never while the camera is
       moving — `resTune` sets `tgt = 0` for a move, which is also what pins
       `kx`/`ky` to 1 there, so the guard on `tgt` keeps a gesture on exactly
       the fills it had. */
    const eU = Math.abs((cr[1] + cr[2]) - (cr[0] + cr[3])) * 0.5;
    const eV = Math.abs((cr[3] + cr[2]) - (cr[0] + cr[1])) * 0.5;
    const eUg = Math.abs((cg[1] + cg[2]) - (cg[0] + cg[3])) * 0.5;
    const eVg = Math.abs((cg[3] + cg[2]) - (cg[0] + cg[1])) * 0.5;
    const eUb = Math.abs((cb[1] + cb[2]) - (cb[0] + cb[3])) * 0.5;
    const eVb = Math.abs((cb[3] + cb[2]) - (cb[0] + cb[1])) * 0.5;
    const stepU = Math.max(eU, eUg, eUb);
    const stepV = Math.max(eV, eVg, eVb);
    if (WA.ramp && tgt > 0 && Math.max(stepU, stepV) > tgt) {
      const down = stepV >= stepU;
      const gA = down
        ? rgbHex((cr[0] + cr[1]) * 0.5, (cg[0] + cg[1]) * 0.5, (cb[0] + cb[1]) * 0.5)
        : rgbHex((cr[0] + cr[3]) * 0.5, (cg[0] + cg[3]) * 0.5, (cb[0] + cb[3]) * 0.5);
      const gB = down
        ? rgbHex((cr[3] + cr[2]) * 0.5, (cg[3] + cg[2]) * 0.5, (cb[3] + cb[2]) * 0.5)
        : rgbHex((cr[1] + cr[2]) * 0.5, (cg[1] + cg[2]) * 0.5, (cb[1] + cb[2]) * 0.5);
      ctx.fillStyle = cellRamp(ctx, down, x0, y0, x2, y2, gA, gB);
      if (flat) ctx.fillRect(x0, y0, x1 - x0, y3 - y0);
      else {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fill();
      }
      return 1;
    }
    ctx.fillStyle = rgbHex(
      (cr[0] + cr[1] + cr[2] + cr[3]) * 0.25,
      (cg[0] + cg[1] + cg[2] + cg[3]) * 0.25,
      (cb[0] + cb[1] + cb[2] + cb[3]) * 0.25,
    );
    if (flat) ctx.fillRect(x0, y0, x1 - x0, y3 - y0);
    else {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fill();
    }
    return 1;
  }
  /*
   * Half a sub-quad of overlap on the far side of each seam. Canvas 2D
   * antialiases every edge it fills, so two quads that share an edge exactly
   * composite to 1 - (1-a)^2 < 1 along it and the seam comes back as a pale
   * hairline — the artefact this whole pass exists to remove, at a twelfth of
   * the pitch. Overlapping instead of abutting is one add.
   */
  const ov = 1 / (kx * 3),
    ow = 1 / (ky * 3);
  for (let b = 0; b < ky; b++) {
    const v0 = b / ky,
      /* the LAST row carries the outward bleed instead of the clamp — that
         clamp was the seam. Interior rows are unchanged: (b+1)/ky + ow is
         already under 1 for every b before the last. */
      v1 = b + 1 < ky ? (b + 1) / ky + ow : 1 + bv,
      vm = (b + 0.5) / ky;
    for (let a = 0; a < kx; a++) {
      const u0 = a / kx,
        u1 = a + 1 < kx ? (a + 1) / kx + ov : 1 + bu,
        um = (a + 0.5) / kx;
      const Am = (1 - um) * (1 - vm),
        Bm = um * (1 - vm),
        Cm = um * vm,
        Dm = (1 - um) * vm;
      ctx.fillStyle = rgbHex(
        Am * cr[0] + Bm * cr[1] + Cm * cr[2] + Dm * cr[3],
        Am * cg[0] + Bm * cg[1] + Cm * cg[2] + Dm * cg[3],
        Am * cb[0] + Bm * cb[1] + Cm * cb[2] + Dm * cb[3],
      );
      if (flat) {
        const X0 = x0 + (x1 - x0) * u0,
          X1 = x0 + (x1 - x0) * u1;
        const Y0 = y0 + (y3 - y0) * v0,
          Y1 = y0 + (y3 - y0) * v1;
        ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
        continue;
      }
      const A00 = (1 - u0) * (1 - v0),
        B00 = u0 * (1 - v0),
        C00 = u0 * v0,
        D00 = (1 - u0) * v0;
      const A10 = (1 - u1) * (1 - v0),
        B10 = u1 * (1 - v0),
        C10 = u1 * v0,
        D10 = (1 - u1) * v0;
      const A11 = (1 - u1) * (1 - v1),
        B11 = u1 * (1 - v1),
        C11 = u1 * v1,
        D11 = (1 - u1) * v1;
      const A01 = (1 - u0) * (1 - v1),
        B01 = u0 * (1 - v1),
        C01 = u0 * v1,
        D01 = (1 - u0) * v1;
      ctx.beginPath();
      ctx.moveTo(
        A00 * x0 + B00 * x1 + C00 * x2 + D00 * x3,
        A00 * y0 + B00 * y1 + C00 * y2 + D00 * y3,
      );
      ctx.lineTo(
        A10 * x0 + B10 * x1 + C10 * x2 + D10 * x3,
        A10 * y0 + B10 * y1 + C10 * y2 + D10 * y3,
      );
      ctx.lineTo(
        A11 * x0 + B11 * x1 + C11 * x2 + D11 * x3,
        A11 * y0 + B11 * y1 + C11 * y2 + D11 * y3,
      );
      ctx.lineTo(
        A01 * x0 + B01 * x1 + C01 * x2 + D01 * x3,
        A01 * y0 + B01 * y1 + C01 * y2 + D01 * y3,
      );
      ctx.closePath();
      ctx.fill();
    }
  }
  return kx * ky;
}

// ── the ground plate ────────────────────────────────────────────────────────

const qx = new Float64Array(4),
  qy = new Float64Array(4),
  qr = new Float64Array(4),
  qg = new Float64Array(4),
  qb = new Float64Array(4);

export interface TerrainDrawResult {
  /** cells visited */
  readonly cells: number;
  /** sub-quads filled — the number `res/floor.py` measures */
  readonly subQuads: number;
}

/**
 * Paint the city's own DEM.
 *
 * Painter's order is far-to-near in `depth()`, which at the 315 deg bearing is
 * a multiple of world y — but it is computed through the projection so a
 * bearing change still means something.
 */
const terrainPlates: GroundPlate[] = [];

export function drawTerrain(
  f: Frame,
  t: TerrainField,
  burnT = 0,
): TerrainDrawResult {
  const base = `#${plateId(t)}|${viewKey(f)}|${burnT}|${t.nodeGen}|`;
  const mv = travelling(base, f);
  const restSettled = base + dialsKey(false, f.dpr);
  const rest = mv || f.moving ? base + dialsKey(true, f.dpr) : restSettled;
  const slot = plateFor(terrainPlates, f, rest, restSettled, mv);
  gprobe("t", f, !!slot && slot.hit, rest, !!slot && plateExact(slot.plate, f));
  if (slot) {
    if (!slot.hit) {
      const r = rasteriseTerrain(plateFrame(f, slot.plate), t, burnT);
      slot.plate.cells = r.cells;
      slot.plate.subQuads = r.subQuads;
      /*
       * THE PAPER IS PART OF THE GROUND, NOT PART OF THE FRAME, and it belongs
       * at the END of the ground rasterisation for the same reason the mock
       * puts it there: there is one ground render and every caller gets the
       * same one. Painting it around the CALL SITES instead satisfied neither
       * side of the burn cross-fade assertion — 11/255 against a tolerance of
       * 8 with one plate grained, 12 with both grained and the direct render
       * not.
       *
       * It tooths the WHOLE plate, not only the cells, so the water and the
       * surround under it come back with the same tooth on them: over a
       * transparent plate pixel the tile composites premultiplied and the blit
       * lays it over whatever is already there, which is exactly what filling
       * the frame at this point in the paint order does.
       */
      const pf = plateFrame(f, slot.plate);
      paintGrain(
        slot.plate.g,
        pf.W,
        pf.H,
        undefined,
        slot.plate.padX / f.dpr,
        slot.plate.padY / f.dpr,
      );
    }
    plateDraw(f, slot.plate);
    return { cells: slot.plate.cells, subQuads: slot.plate.subQuads };
  }
  // no canvas factory: paint straight through, and tooth the frame in place
  const r = rasteriseTerrain(f, t, burnT);
  paintGrain(f.ctx, f.W, f.H);
  return r;
}

function rasteriseTerrain(
  f: Frame,
  t: TerrainField,
  burnT: number,
): TerrainDrawResult {
  const { ctx, W, H } = f;
  const tune = resTune(f.dpr, f.moving);
  const N = t.N;
  let cells = 0,
    subQuads = 0;
  const X0 = t.proj.X0,
    Y0 = t.proj.Y0,
    step = t.cellM;

  // far to near. proj() is monotone in depth(), so ordering by grid j+i is
  // exactly ordering by depth at any axis-aligned bearing, and by depth() at
  // any other.
  const order = terrainOrder(t, f.proj);
  for (let o = 0; o < order.length; o++) {
    const k = order[o];
    const i = (k / N) | 0,
      j = k % N;
    if (i >= N - 1 || j >= N - 1) continue;
    if (!t.maskAt(i, j)) continue;
    const wx = X0 + i * step,
      wy = Y0 + j * step;
    /*
     * THE FAR CORNER IS THE NEIGHBOUR'S CORNER. Taking each corner at its own
     * grid elevation makes neighbours agree exactly, which closes the seams
     * outright — no overdraw, and one projection cheaper per cell than
     * stroking the gap shut.
     */
    const p0 = f.proj.proj(wx, wy, t.elevAt(i, j));
    const p1 = f.proj.proj(wx + step, wy, t.elevAt(i + 1, j));
    const p2 = f.proj.proj(wx + step, wy + step, t.elevAt(i + 1, j + 1));
    const p3 = f.proj.proj(wx, wy + step, t.elevAt(i, j + 1));
    const ax = sx(f, p0),
      ay = sy(f, p0),
      cx2 = sx(f, p2),
      cy2 = sy(f, p2);
    if (
      (ax < -40 && cx2 < -40) ||
      (ax > W + 40 && cx2 > W + 40) ||
      (ay < -60 && cy2 < -60) ||
      (ay > H + 60 && cy2 > H + 60)
    )
      continue;
    cells++;
    qx[0] = ax;
    qy[0] = ay;
    qx[1] = sx(f, p1);
    qy[1] = sy(f, p1);
    qx[2] = cx2;
    qy[2] = cy2;
    qx[3] = sx(f, p3);
    qy[3] = sy(f, p3);
    const n0 = t.node(i, j, burnT),
      n1 = t.node(i + 1, j, burnT),
      n2 = t.node(i + 1, j + 1, burnT),
      n3 = t.node(i, j + 1, burnT);
    qr[0] = t.nodeR(n0);
    qg[0] = t.nodeG(n0);
    qb[0] = t.nodeB(n0);
    qr[1] = t.nodeR(n1);
    qg[1] = t.nodeG(n1);
    qb[1] = t.nodeB(n1);
    qr[2] = t.nodeR(n2);
    qg[2] = t.nodeG(n2);
    qb[2] = t.nodeB(n2);
    qr[3] = t.nodeR(n3);
    qg[3] = t.nodeG(n3);
    qb[3] = t.nodeB(n3);
    /* THE CITY'S OWN DEM TAKES NO BLEED, and that is a decision rather than an
       omission. It does not show the hatch the surround does — it is painted
       over ground of nearly its own value, not over the bay plate — and its
       edge cells front the published shoreline, where half a pixel of outward
       bleed would put land over water that `txuc-3kzm` says is water. */
    subQuads += paintCell(ctx, qx, qy, qr, qg, qb, tune.tgt, tune.kmax, tune.minpx);
  }
  return { cells, subQuads };
}

const orderCache = new WeakMap<TerrainField, { key: string; ord: Int32Array }>();

/**
 * Far-to-near cell order.
 *
 * Cached against the projection's bearing and tilt, NOT against `cam.scale`:
 * **anything continuous in `cam.scale` inside a cache key invalidates the
 * buffer mid-gesture.** The order is a function of the projection alone.
 */
export function terrainOrder(t: TerrainField, p: Projection): Int32Array {
  const key = p.rotDeg + "|" + p.sA + "|" + p.zex;
  const hit = orderCache.get(t);
  if (hit && hit.key === key) return hit.ord;
  const N = t.N;
  const n = N * N;
  const d = new Float32Array(n);
  const ord = new Int32Array(n);
  const X0 = t.proj.X0,
    Y0 = t.proj.Y0,
    step = t.cellM;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const k = i * N + j;
      ord[k] = k;
      d[k] = p.depth(X0 + i * step, Y0 + j * step);
    }
  const a = Array.from(ord);
  a.sort((u, v) => d[v] - d[u]); // far first
  ord.set(a);
  orderCache.set(t, { key, ord });
  return ord;
}

// ── the surround ────────────────────────────────────────────────────────────

/**
 * Marin, the East Bay, the San Mateo peninsula and the islands.
 *
 * **This grid is not in the P1 catalogue.** `manifest.json` ships thirteen
 * chunk kinds and none of them is the surround; `gen_context.py`'s output
 * (US Census TIGERweb hydrography and county coverage, USGS 3DEP elevation —
 * both federal works, both public domain) has no encoder yet. So the surround
 * is drawn through an INTERFACE and nothing here fabricates a backdrop: with
 * no grid supplied, `drawSurround` paints nothing and says so by returning 0.
 * See DRAW.md §"What could not be ported".
 */
export interface SurroundGrid {
  readonly XW: number;
  readonly XH: number;
  /** node world x, length XW+1 */
  readonly mx: Float64Array;
  /** node world y, length XH+1 */
  readonly my: Float64Array;
  /** elevation, metres, at cell (i,j) */
  z(i: number, j: number): number;
  /** the Lambert term at cell (i,j) — see `buildSurroundLam` */
  readonly lam: Float32Array;
  /** shoreline segments, groups of 4 node indices */
  readonly segs: Uint16Array;
  /** far-to-near cell order */
  readonly order: Int32Array;
  /**
   * THE LAND BIT, WHICH THE SHELL HAS ALWAYS SUPPLIED AND NOBODY DECLARED.
   *
   * `data.ts` decodes `base/surround`'s `own`/`land` bitsets and the shell
   * hands `drawSurround` a grid carrying an `isLand(i, j)`. It was reachable
   * only through a cast — `scene.ts` keeps a private `isLandOf()` whose whole
   * body is that cast, and `water.ts`'s shore corridor needs the same bit for
   * the reference's own `wet` test. Optional, because a grid supplied by a
   * test is not obliged to have one, and a caller that has no land bit gets
   * no corridor rather than a corridor built on a guess.
   */
  readonly isLand?: (i: number, j: number) => boolean;
  /**
   * The surround's own published names, if the shell is carrying them.
   *
   * `data.ts` decodes `base/surround`'s seven `labels` into `SurroundData`, and
   * the shell hands `drawSurround` a spread of that record — so the names are
   * ALREADY here at runtime and were simply not declared. Optional, because a
   * grid supplied by a test is not obliged to have any.
   */
  readonly labels?: readonly SurroundName[];
}

/**
 * THE SURROUND HAS THE SAME UNITS BUG THE CITY HAD.
 *
 * Block W found it in `LAM` — "metres of rise per CELL, used as a slope, with
 * the cell's own 53.815 m width never divided out" — fixed it there. The SAME
 * EXPRESSION lit everything that is not San Francisco. **It divided by 1.8,
 * and the surround's cell is 110.01 x 139.15 m. The slope is over-read by 61x
 * across and 77x down.**
 *
 * MEASURED over the 62,496 interior land cells of the surround:
 *
 * ```
 *                    p01     p05     p50     p95    mean
 *   shipped        0.000   0.000   0.081   0.730   0.294
 *   per metre      0.114   0.296   0.717   0.942   0.676
 * ```
 *
 * The median cell of Marin was lit at 0.081 of the value a flat surface
 * returns. WORSE than the city's median 0.321, because the surround's cell is
 * twice as wide, so the same quantum is read as twice the slope.
 *
 * AND THE FALLBACK INVERTS IT. The draw read `XLAM[k] || 0.62`. 30,651 of the
 * 63,352 land cells — 48.4 % — held exactly 0, and only 856 of those are the
 * border ring the loop skips. Every one was then drawn at 0.62, BRIGHTER than
 * a genuinely lit slope at 0.55. A salt-and-pepper generator on a 110 m
 * lattice, which is why the far shore read as a torn paper cut-out.
 *
 * THE FIX IS THE MISSING DIVIDE, and one thing more: **the loop covers the
 * whole grid with clamped neighbours**, so the border ring gets a real Lambert
 * instead of a zero and `|| 0.62` has nothing left to fire on.
 */
export function buildSurroundLam(
  XW: number,
  XH: number,
  z: (i: number, j: number) => number,
  cellW: number,
  cellH: number,
  zex: number,
): Float32Array {
  const L = new Float32Array(XW * XH);
  const cl = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
  const sxm = QF.xlam ? zex / cellW : zex / 1.8;
  const sym = QF.xlam ? zex / cellH : zex / 1.8;
  for (let j = 0; j < XH; j++)
    for (let i = 0; i < XW; i++) {
      const gx =
        ((z(cl(i + 1, XW - 1), j) - z(cl(i - 1, XW - 1), j)) / 2) * sxm;
      const gy =
        ((z(i, cl(j + 1, XH - 1)) - z(i, cl(j - 1, XH - 1))) / 2) * sym;
      const nz = 1 / Math.sqrt(gx * gx + gy * gy + 1),
        nx = -gx * nz,
        ny = -gy * nz;
      L[j * XW + i] = Math.max(
        0,
        Math.min(1, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]),
      );
    }
  return L;
}

/**
 * holds the surround's PAINTED value at the shipped number.
 *
 * The units fix moves the whole distribution, because the shipped hillshade
 * was multiplying the surround by 0.944 on average and a correct one
 * multiplies it by 1.001. `XBASE_K` is SOLVED against a stated target rather
 * than swept: the target is the mean the shipped renderer actually paints.
 *
 * THE TARGET WAS MEASURED WRONG THE FIRST TIME AND IT IS WORTH RECORDING. A
 * probe that dropped the `|| 0.62` fallback from its own model of the shipped
 * path put the shipped mean at 0.8613 and made this look like a 0.02
 * correction. With the fallback in — which is what the page does — the shipped
 * mean is 0.8778, because the fallback was ACCIDENTALLY COMPENSATING. So the
 * units fix on its own moves the surround's value by 0.0025 of luminance,
 * under one 8-bit step, and this is a 0.7 % correction rather than a 5 % one.
 * **The assertion is what caught it.**
 */
export const XBASE_K = 0.9932;

const xn = {
  R: null as Float32Array | null,
  G: null as Float32Array | null,
  B: null as Float32Array | null,
  ST: null as Int32Array | null,
  key: 1,
  w: 0,
};

/** Paint the surround, or nothing at all if P1 has not supplied one. */
/** `g.order` as a membership test, per grid — see `drawSurround` */
const ownSets = new WeakMap<SurroundGrid, Uint8Array>();

/**
 * THE SURROUND'S COASTLINE IS THE PUBLISHED RING, NOT THE CELL EDGE.
 *
 * `part3.html` §4426 sets ONE clip for the whole surround at the published
 * shoreline and draws every cell inside it, rather than a clip per coastal
 * cell. Without it the far shore is the 110.01 x 139.15 m cell lattice: a
 * staircase whose tread is longer than a San Francisco block, on the two edges
 * of the frame the eye reads as the horizon.
 *
 * **The ring sits ON the surface, not above it.** The cell quads take each
 * corner at that corner's own node elevation, so the drawn surface inside a
 * cell is the bilinear interpolation of the four; `proj()` is linear in
 * (x, y, z), so the bilinear interpolation of the four PROJECTED corners is
 * exactly the projection of the bilinearly interpolated surface, and a ring
 * vertex sampled the same way lands exactly on the quad it is cutting. A flat
 * sea-level ring would slice the tops off the Marin headlands wherever the
 * coast is a cliff.
 *
 * What is NOT ported, and it is a real difference rather than an omission:
 * the mock's `CO.reach` and `CO.city` bits (`COAST.xtra` / `COAST.cfix`, one
 * per grid cell) are not in this export — `base/coast` ships the rings and the
 * burn polygon and nothing else. `reach` lets a water cell that touches
 * surround land be painted so the fill can REACH the ring; without it the fill
 * stops at the last cell whose centre is land, and where that cell is more than
 * one cell short of the ring a sliver of plate shows between the two. Measured
 * rather than assumed — see SHELL.md. **REPORTED to P1: `surround` wants
 * `xtra`.**
 */
function surroundZ(g: SurroundGrid, x: number, y: number): number {
  const dx = (g.mx[g.XW] - g.mx[0]) / g.XW,
    dy = (g.my[g.XH] - g.my[0]) / g.XH;
  let u = (x - g.mx[0]) / dx,
    v = (y - g.my[0]) / dy;
  let i = u | 0,
    j = v | 0;
  if (i < 0) i = 0;
  if (j < 0) j = 0;
  if (i > g.XW - 1) i = g.XW - 1;
  if (j > g.XH - 1) j = g.XH - 1;
  let fu = u - i,
    fv = v - j;
  if (fu < 0) fu = 0;
  if (fu > 1) fu = 1;
  if (fv < 0) fv = 0;
  if (fv > 1) fv = 1;
  const i1 = i < g.XW - 1 ? i + 1 : i,
    j1 = j < g.XH - 1 ? j + 1 : j;
  const a = g.z(i, j),
    b = g.z(i1, j),
    c = g.z(i1, j1),
    d = g.z(i, j1);
  return (a + (b - a) * fu) * (1 - fv) + (d + (c - d) * fu) * fv;
}

const surroundPlates: GroundPlate[] = [];

export function drawSurround(
  f: Frame,
  t: TerrainField,
  g: SurroundGrid | null,
  coast?: readonly (readonly (readonly [number, number])[])[] | null,
): number {
  if (!g) return 0;
  /*
   * 226 ms of the 404 ms whole-city rasterisation, MEASURED — see
   * `GROUND_PLATE`. The same plate, on the same terms: 56,330 cells that do
   * not change when the year, the tier or a chunk does, and a key that carries
   * the camera so nothing is ever resampled.
   */
  const base =
    `#${plateId(g)}|${viewKey(f)}|${t.nodeGen}|${xn.key}|` +
    `${coast ? coast.length : -1}|`;
  const mv = travelling(base, f);
  const restSettled = base + dialsKey(false, f.dpr);
  const rest = mv || f.moving ? base + dialsKey(true, f.dpr) : restSettled;
  const slot = plateFor(surroundPlates, f, rest, restSettled, mv);
  gprobe("s", f, !!slot && slot.hit, rest, !!slot && plateExact(slot.plate, f));
  if (slot) {
    if (!slot.hit)
      slot.plate.subQuads = rasteriseSurround(
        plateFrame(f, slot.plate),
        t,
        g,
        coast,
      );
    plateDraw(f, slot.plate);
    return slot.plate.subQuads;
  }
  return rasteriseSurround(f, t, g, coast);
}

function rasteriseSurround(
  f: Frame,
  t: TerrainField,
  g: SurroundGrid,
  coast?: readonly (readonly (readonly [number, number])[])[] | null,
): number {
  const { ctx, W, H } = f;
  /* ONE clip, set once, and every cell drawn inside it. Every ring is closed
     and the interiors nest, so this fills non-zero exactly as the polygon was
     built. `QF.coast` turns it off in one page for a before/after. */
  const clipping = QF.coast && !!coast && coast.length > 0;
  if (clipping && coast) {
    ctx.save();
    ctx.beginPath();
    for (const ring of coast) {
      for (let i = 0; i < ring.length; i++) {
        const x0 = ring[i][0],
          y0 = ring[i][1];
        const p = f.proj.proj(x0, y0, surroundZ(g, x0, y0));
        if (i) ctx.lineTo(sx(f, p), sy(f, p));
        else ctx.moveTo(sx(f, p), sy(f, p));
      }
      ctx.closePath();
    }
    ctx.clip();
  }
  const tune = resTune(f.dpr, f.moving);
  const XNW = g.XW + 1,
    XNH = g.XH + 1;
  if (xn.w !== XNW || !xn.R) {
    xn.R = new Float32Array(XNW * XNH);
    xn.G = new Float32Array(XNW * XNH);
    xn.B = new Float32Array(XNW * XNH);
    xn.ST = new Int32Array(XNW * XNH);
    xn.w = XNW;
    xn.key = 1;
  }
  const NR = xn.R,
    NG = xn.G!,
    NB = xn.B!,
    NST = xn.ST!;
  const hzR = parseInt(HAZE.slice(1, 3), 16),
    hzG = parseInt(HAZE.slice(3, 5), 16),
    hzB = parseInt(HAZE.slice(5, 7), 16);
  const node = (i: number, j: number): number => {
    const k = j * XNW + i;
    if (NST[k] === xn.key) return k;
    const ii = i >= g.XW ? g.XW - 1 : i,
      jj = j >= g.XH ? g.XH - 1 : j;
    const za = g.z(ii, jj),
      lam = g.lam[jj * g.XW + ii];
    const tt = Math.min(1, Math.pow(za / 300, 0.8));
    const R0 = 0xec + (0xcf - 0xec) * tt,
      G0 = 0xe5 + (0xc3 - 0xe5) * tt,
      B0 = 0xd6 + (0xab - 0xd6) * tt;
    /*
     * 0.90 + 0.15 was set while the surround's Lambert was a near-binary mask:
     * flattening the swing was suppressing the bug's own noise. With a
     * modelled surface under it the Marin headlands can be modelled too. 0.20
     * is the CITY's swing — one number for both rasters rather than two.
     */
    const lamK =
      (QF.relief ? reliefK(lam) : 0.9 + 0.15 * lam) * (QF.xlam ? XBASE_K : 1);
    skylitN(R0, G0, B0, lamK, tiltOf(lam), sc3);
    const hz = t.hazeAt(g.mx[i], g.my[j]);
    NR[k] = sc3[0] + (hzR - sc3[0]) * hz;
    NG[k] = sc3[1] + (hzG - sc3[1]) * hz;
    NB[k] = sc3[2] + (hzB - sc3[2]) * hz;
    NST[k] = xn.key;
    return k;
  };

  /* WHICH CELLS ARE PAINTED, so a cell only bleeds into a neighbour that is
     going to be painted over it. `g.order` is the own-cell list; a cell at the
     rim whose neighbour is bay must NOT grow half a pixel into published
     water. Built once per grid and per order, which is once per band. */
  let paintedSet = ownSets.get(g);
  if (!paintedSet || paintedSet.length !== g.XW * g.XH) {
    paintedSet = new Uint8Array(g.XW * g.XH);
    for (let o = 0; o < g.order.length; o++) paintedSet[g.order[o]] = 1;
    ownSets.set(g, paintedSet);
  }
  const painted = paintedSet;
  /* half a device pixel, in CSS px — the amount the controlled reproduction
     measured a 28x seam reduction at, and the smallest amount that can cover
     an antialiased edge at all */
  const bleedPx = 0.5 / Math.max(1, f.dpr);

  let subQuads = 0;
  for (let o = 0; o < g.order.length; o++) {
    const k = g.order[o],
      i = k % g.XW,
      j = (k / g.XW) | 0;
    const i1 = Math.min(g.XW - 1, i + 1),
      j1 = Math.min(g.XH - 1, j + 1);
    const p1 = f.proj.proj(g.mx[i], g.my[j], g.z(i, j));
    const p3 = f.proj.proj(g.mx[i + 1], g.my[j + 1], g.z(i1, j1));
    const x1 = sx(f, p1),
      y1 = sy(f, p1),
      x3 = sx(f, p3),
      y3 = sy(f, p3);
    if (
      (x1 < -40 && x3 < -40) ||
      (x1 > W + 40 && x3 > W + 40) ||
      (y1 < -60 && y3 < -60) ||
      (y1 > H + 60 && y3 > H + 60)
    )
      continue;
    const p2 = f.proj.proj(g.mx[i + 1], g.my[j], g.z(i1, j));
    const p4 = f.proj.proj(g.mx[i], g.my[j + 1], g.z(i, j1));
    qx[0] = x1;
    qy[0] = y1;
    qx[1] = sx(f, p2);
    qy[1] = sy(f, p2);
    qx[2] = x3;
    qy[2] = y3;
    qx[3] = sx(f, p4);
    qy[3] = sy(f, p4);
    const n0 = node(i, j),
      n1 = node(i + 1, j),
      n2 = node(i + 1, j + 1),
      n3 = node(i, j + 1);
    qr[0] = NR[n0];
    qg[0] = NG[n0];
    qb[0] = NB[n0];
    qr[1] = NR[n1];
    qg[1] = NG[n1];
    qb[1] = NB[n1];
    qr[2] = NR[n2];
    qg[2] = NG[n2];
    qb[2] = NB[n2];
    qr[3] = NR[n3];
    qg[3] = NG[n3];
    qb[3] = NB[n3];
    subQuads += paintCell(
      ctx, qx, qy, qr, qg, qb, tune.tgt, tune.kmax, tune.minpx,
      i + 1 < g.XW && painted[k + 1] ? bleedPx : 0,
      j + 1 < g.XH && painted[k + g.XW] ? bleedPx : 0,
    );
  }
  // the surround's own shoreline — deliberately fainter than the city's, so
  // the eye knows which coast is the subject
  ctx.strokeStyle = "rgba(20,18,14,.30)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let s = 0; s < g.segs.length; s += 4) {
    const a = f.proj.proj(g.mx[g.segs[s]], g.my[g.segs[s + 1]], 0.4);
    const b = f.proj.proj(g.mx[g.segs[s + 2]], g.my[g.segs[s + 3]], 0.4);
    const ax = sx(f, a),
      ay = sy(f, a);
    if (ax < -40 || ax > W + 40 || ay < -60 || ay > H + 60) continue;
    ctx.moveTo(ax, ay);
    ctx.lineTo(sx(f, b), sy(f, b));
  }
  ctx.stroke();
  if (clipping) ctx.restore();
  /* the surround's names, with the ground and not with the city — which is
     where `part3.html` paints them, from inside `drawTerrain` and after the
     surround's own coastline */
  if (g.labels && g.labels.length) surroundNames(f, g.labels, (x, y) => surroundZ(g, x, y));
  return subQuads;
}

/**
 * THE GRADIENT IS CACHED, and that is not a detail.
 *
 * `createLinearGradient` per face at block zoom put `drawCity` from 60.3 ms to
 * 74.0 and broke §25's own frame bound. The ends quantise to `WA.gq` css px
 * and the key carries the wall colour, so a row of houses on one block — which
 * is what a block IS — shares one object.
 *
 * The cache hangs off the CONTEXT, because the suite times `drawCity` into a
 * canvas of its own and a gradient belongs to the context that made it.
 */
const gradCaches = new WeakMap<
  CanvasRenderingContext2D,
  Map<string, CanvasGradient>
>();
export function wallGrad(
  g: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  c: string,
): CanvasGradient {
  let m = gradCaches.get(g);
  if (!m) {
    m = new Map();
    gradCaches.set(g, m);
  }
  const q = WA.gq || 3,
    a = Math.round(y0 / q) * q,
    b = Math.round(y1 / q) * q;
  const k = a + "|" + b + "|" + c + "|" + WA.wtop;
  let gr = m.get(k);
  if (gr === undefined) {
    gr = g.createLinearGradient(0, a, 0, b === a ? a + 1 : b);
    gr.addColorStop(0, shade(c, WA.wtop));
    gr.addColorStop(1, shade(c, WA.wbot));
    if (m.size > 6000) m.clear();
    m.set(k, gr);
  }
  return gr;
}
