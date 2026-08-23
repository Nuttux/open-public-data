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
};

/** `QF` in the mock — the quality-fix switches, each naming a bug that was fixed. */
export const QF = {
  xlam: 1, // the surround hillshade reads a slope, not a rise per cell
  shore: 1, // the shore corridor closes its corners; XHOLE is the disagreement
  water: 1, // the bay recedes with the same haze the land recedes with
  warm: 1, // two illuminants instead of one scalar
  relief: 1, // the surround's Lambert swing, re-derived now that XLAM is real
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
  shoal: 1, // the shallows are one interpolated plate, not 13,409 quads
  tgt: 1.5, // the largest value step, of 255, a sub-quad seam may carry
  minpx: 2.4, // css px: the MOTION floor. Settled, see RS.minpxDev.
  kmax: 64,
  wallpx: 11, // css px of wall height above which the wall carries its grade
  wtop: 1.055, // the wall at the top, as a value of its own colour
  wbot: 0.855, // ...and at the bottom, where the street is
  iq: "low" as ImageSmoothingQuality, // bilinear. "high" is a multi-pass resample and this is an UPSCALE
  gq: 3, // css px the wall gradient's ends quantise to, for the cache key
  hazecap: 0.42, // how far the far shore may wash toward the paper
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

/** ground, low to high; the park row; the canopy end of the tint ramp */
export const WG0 = "#d9d3bf",
  WG1 = "#c8bda1";
export const WPK0 = "#b9c79a",
  WPK1 = "#9fb283";
export const WCN0 = "#a9bd8c",
  WCN1 = "#7d9a63";

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
  return skylit(base, 0.86 + 0.2 * lam, tiltOf(lam));
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
  return skylitN(R, G, B, 0.86 + 0.2 * lam, tiltOf(lam), o);
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

export interface TerrainOptions {
  /** terrain exaggeration at the band the field is built for; `ZEX_BY_STEP` */
  readonly zex?: number;
  /** self-shadow: how many metres of overshoot saturate the penumbra */
  readonly terrs?: number;
  /** self-shadow on/off and its strength */
  readonly shadow?: { readonly on: boolean; readonly k: number };
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

  /** the diffuse term, per node */
  readonly lam: Float32Array;
  /** the self-shadow term, per node, 0 = lit */
  readonly tsh: Float32Array;

  /** per-cell park fraction and burn flag, filled by `parks`/`coast` */
  readonly cellPark: Uint8Array;
  readonly cellBurn: Uint8Array;
  /** per-cell canopy fraction, 0..255; `base/canopy-tint` */
  canopyFrac: Uint8Array | null = null;

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
    this.shadowK = opts.shadow?.k ?? 1;
    const N = this.N;
    this.cellPark = new Uint8Array(N * N);
    this.cellBurn = new Uint8Array(N * N);
    this.tnR = new Float32Array(N * N);
    this.tnG = new Float32Array(N * N);
    this.tnB = new Float32Array(N * N);
    this.tnST = new Int32Array(N * N);
    this.lam = this.buildLam();
    this.tsh = this.buildTsh(opts.terrs ?? 6);
  }

  maskAt(i: number, j: number): number {
    const k = i * this.N + j;
    return (this.maskBits[k >> 3] >> (7 - (k & 7))) & 1;
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
          Math.min(1, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]),
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
    const hl = Math.hypot(SUN[0], SUN[1]) || 1;
    const ux = SUN[0] / hl,
      uy = SUN[1] / hl;
    const cell = this.cellM;
    const tanE = SUN[2] / hl;
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

  /** the diffuse term with the hill's own shadow taken out of it */
  lamSh(k: number): number {
    return this.shadowOn ? this.lam[k] * (1 - this.shadowK * this.tsh[k]) : this.lam[k];
  }

  /** drop the node colour cache — a burn phase, a canopy change, a dial move */
  invalidateNodes(): void {
    this.tnKey++;
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
    terrainRGB(
      this.elevAt(i, j),
      this.lamSh(li * N + lj),
      n ? np / n : 0,
      n ? burnT * (nb / n) : 0,
      n ? nc / n : 0,
      sc3,
    );
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

// ── one cell, painted as the piece of surface it is ─────────────────────────

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
export function drawTerrain(
  f: Frame,
  t: TerrainField,
  burnT = 0,
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

export function drawSurround(
  f: Frame,
  t: TerrainField,
  g: SurroundGrid | null,
): number {
  if (!g) return 0;
  const { ctx, W, H } = f;
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
      (QF.relief ? 0.86 + 0.2 * lam : 0.9 + 0.15 * lam) * (QF.xlam ? XBASE_K : 1);
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
  const k = a + "|" + b + "|" + c;
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
