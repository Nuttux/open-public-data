/**
 * streets.ts — the right-of-way surface, the carriageway, the kerb, the footway.
 *
 * Block P3, re-derived against the mock on parity night (Block U1). Ported
 * from `gen/part3.html` §STREETS AND NAMES and §THE STREET IS A SURFACE, with
 * `street/BLOCK-STREETSCAPE.md`.
 *
 * San Francisco publishes the **positive** space. The brief for this layer
 * guessed the assessor block rings would be the strongest lever — the negative
 * space of the street network — and they are not, because `h8n7-e4ns` Right of
 * Way Polygons is 22,777 polygons of published street area, 22,191 of them
 * placed, 29.09 km2.
 *
 * The set operation is published on both sides and nothing is offset,
 * buffered or widened:
 *
 *     roadway = right of way MINUS every closed kerb ring that meets it
 *     footway = the rest of the right of way
 *
 * Measured: roadway 21.44 km2, footway 7.66 km2 of 29.09 km2, 1,961.6 km of
 * drawn kerb. **The independent check**: the published Sidewalk Widths file
 * (`4g86-grxu`, a 2014 AECOM study) gives a width for 13,811 of 16,174
 * centrelines; length x width x sides over those is 8.98 km2. Two files, 14 %
 * apart, neither used to build the other. And ROW 29.09 + assessor blocks
 * 93.04 = 122.1 km2 against San Francisco's published land area of 121.4.
 *
 * 1,806 kerb lines that do not close into a ring are **not used**: the
 * difference needs a closed ring, an open polyline cannot cut a polygon
 * without a rule for how to close it, and any such rule is invented.
 */

import type { Chunk } from "./data";
import { type Frame, TerrainField, LOOK } from "./terrain";

// ── the projection constant ─────────────────────────────────────────────────

/**
 * At ROT 315 the projection is axis-aligned: world metres reach the screen at
 * `1.2247 * cam.scale` across and `0.7071 * cam.scale` up, so **a width at an
 * unknown bearing projects at the geometric mean, 0.9306.**
 */
export const ST_KPROJ = Math.sqrt(1.2247 * 0.7071);

// ── the tier gates, and the two that were wrong ─────────────────────────────

/**
 * EXTENT — the right of way as its published AREA in one tone: real width,
 * real corners, real intersections. No kerb and no footway, because at 2 px
 * the footway band is a third of a pixel.
 *
 * **The extent tier was opening at 1 px of published width.** The city's
 * median right of way is 1.32 px at whole-city zoom, so 11,917 of them
 * promoted there — the exact thing the brief forbids — for **126 ms** of
 * frame. Whole city now draws zero rights of way and costs 2.5 ms, which is
 * the cull loop and noise.
 *
 * The gate is now 2 px, and it is the same 2 px at which the centreline's own
 * fade begins, so the line and the area are **complementary**: they sum to one
 * over the octave 2 px to 4 px, and **there is no zoom at which a street is
 * half-drawn twice or not drawn at all.**
 */
export const ST_EXT_PX = 2.0;
/** …and the top of that octave, where the area carries the street alone. */
export const ST_EXT_PX1 = 4.0;

/**
 * SURFACE — roadway and footway as separate tones with the published kerb
 * between them, gated on the FOOTWAY BAND's own projected width.
 *
 * **The surface tier was opening at half a pixel of footway band.** At
 * district zoom it built a roadway path and a kerb path for most of the city
 * and laid them down at 8 % alpha. Raised to 1 px — the same argument as the
 * extent gate, applied to the narrower dimension — which took the district
 * frame from **+211 ms to +56 ms**.
 */
export const ST_SRF_PX = 1.0;
/** …and the top of ITS octave: no footway under one pixel, all of it at two. */
export const ST_SRF_PX1 = 2.0;

/*
 * LOWERED TO 0.2 / 0.5 ON 2026-08-24 AND RESTORED THE SAME DAY. The
 * measurement behind the change was right; the conclusion drawn from it was
 * not, and the whole of it is one grep away in the reference:
 *
 *     gen/part3.html:6376   const ST_SRF_PX = 1.0;
 *     gen/part3.html:6542   let sa = fw[i]*0.1*kp - ST_SRF_PX;
 *                           if(sa<0)sa=0; if(sa>1)sa=1;
 *     gen/part3.html:6543   if(sa>0&&sa<0.02)sa=0;
 *
 * `sa = fwM*kp - 1.0` clamped to [0,1] IS `ramp(fwM*kp, 1.0, 2.0)`. THIS PAIR
 * IS THE MOCK'S OWN PAIR. Lowering it does not close a gap with the reference,
 * it opens one — and the mock is exactly as bare as production at district and
 * block zoom, because it runs the same gate on the same widths.
 *
 * WHAT THE CITY'S FOOTWAYS ACTUALLY MEASURE, on the real fit (cam.base
 * 0.046665988641253695 at the 1200x678 canonical stage) against the manifest's
 * own percentiles (fw_p10 1.44 / fw_p50 3.16 / fw_p90 4.59 m):
 *
 *     whole city  step 0  scale 0.0467   p50 0.137 px   p90 0.199 px
 *     district    step 1  scale 0.1353   p50 0.398 px   p90 0.578 px
 *     block       step 2  scale 0.3360   p50 0.988 px   p90 1.435 px
 *     street      step 3  scale 2.0000   p50 5.881 px   p90 8.543 px
 *
 * The WIDEST TENTH of the city's footways is 0.58 px at district. There is no
 * setting of this constant that draws a footway there, because there is no
 * footway there to draw — only a wash the width of a fraction of a cell.
 *
 * And at 0.2/0.5 the octave is 0.3 px wide instead of 1.0, which disarms the
 * line below it: `if (sa > 0 && sa < 0.02) sa = 0` — "a pass that cannot be
 * seen is not built" — is calibrated to a 1.0-wide octave, and on a 0.3-wide
 * one nothing ever lands in that window. `sa` leaves zero and is immediately
 * 0.66 at the median. That is a roadway path, a kerb path and a fill for
 * nearly every right of way on stage, painting sub-pixel translucency.
 *
 * THE COMPLAINT THAT PROMPTED THE CHANGE IS STILL REAL AND IS NOT HERE. At
 * whole-city, district and block zoom the CENTRELINE is the street — and
 * `scene.paintStreets` calls `drawCentrelines` with no `lines` and a
 * hardcoded `band: 0`, so it returns on its first line and all 4,895 class
 * 0-4 centrelines plus the 846 unimplied are decoded by nobody. See
 * DATA-TRUTH.md 12.2 and 18.4, and DATA.md 15.7 for the eight lines.
 */

export const ST_ALPHA = 0.8;

/** a paved carriageway */
export const ST_C_ROAD = "#b3aca1";
/** graded earth, before the Board orders paving */
export const ST_C_RAW = "#c6b696";
/** footway */
export const ST_C_FOOT = "#e0d8c8";
/** the published kerb line */
export const ST_C_KERB = "#8b8375";

function hexMix(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16),
    B = parseInt(b.slice(1), 16);
  const m = (s: number): number =>
    Math.round((((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t));
  return (
    "#" + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)
  );
}

/**
 * THE EXTENT TIER'S SINGLE TONE IS NOT THE FOOTWAY.
 *
 * It is the area-weighted mix of the two tones it cannot yet resolve —
 * **73.7 % roadway, 26.3 % footway, off this file's own km2** (21.436 and
 * 7.655 of 29.091, `manifest.streets.stats`). The port painted the whole right
 * of way `ST_C_FOOT` instead, which is the pale web over the Sunset in the
 * parity-night before crop: #e0d8c8 where the mock has #bdb6ab.
 */
export const ST_C_MIX = hexMix(ST_C_ROAD, ST_C_FOOT, 0.263);

/**
 * one lineWidth per class, so the whole class is ONE path and ONE stroke.
 *
 * The first cut stroked per centreline: 2,528 `stroke()` calls at district
 * zoom, measured at 7.4 ms of a 16 ms frame. `ctx.stroke()` is the dearest
 * call in this renderer (~3 us, ten times a fill of the same quad) and the
 * pixels are identical either way — it is not the same number of calls.
 */
export const ST_W: readonly number[] = [1.5, 1.5, 1.0, 1.0, 0.7, 0.7, 0.7];

/** the highest class drawn as a line, per zoom band */
export const ST_CLS_MAX: readonly number[] = [2, 3, 4];

/* ── THE STREETS NO BLOCK IMPLIES ────────────────────────────────────────
 *
 * `gen_geo2.py` ships classcode 0-4 and drops 5-6, and its reason is a good
 * one: *"the gap between two real blocks already IS the street."* On the
 * ordinary San Francisco grid that is true — the space between two assessor
 * blocks reads as a street without a line being drawn in it.
 *
 * **It is false wherever there are no blocks.** The Hunters Point Naval
 * Shipyard is ONE assessor block of 2.934 km2, so no gap between blocks stands
 * for anything, and the streets were simply absent under buildings that were
 * drawn. `strt/street-unimplied` is the 846 published centrelines — 131.6 km,
 * every one carrying a published street name — that no published block EDGE
 * comes within 30 m of along at least a quarter of its length. Presidio 478,
 * Bayview Hunters Point 113, Treasure Island 110, Golden Gate Park 85.
 *
 * They arrive as another `CentrelineCell` and are told apart by their CLASS:
 * `G.streets` is 0-4 by construction and this chunk is 5, 6 or 7 only, which
 * `verify_city_chunks.py` asserts on both sides. So one ceiling admits exactly
 * this chunk and nothing else.
 *
 * `cls` 7 is **no published class**. 3psu-pn9h publishes 0-6; 780 rows publish
 * none, and the pipeline used to read those as class 5 — the one class it
 * drops. `ST_W` already clamps, so 7 takes the 0.7 px hairline with no change.
 */
export const ST_CLS_UNIMPLIED_MIN = 5;
export const ST_CLS_UNIMPLIED_MAX = 7;

/**
 * The band from which they draw. **1, so they arrive at exactly the moment
 * classes 3 and 4 already do** (`Z_LINES_2` = 1.70) rather than introducing a
 * zoom step of its own: 131.6 km of line appearing at a boundary nothing else
 * moves at would read as a bug. The tier's own fetch gate is `minZ` 1.75, so
 * they cannot draw below it in any case.
 */
export const UNIMPLIED_FROM_BAND = 1;

/**
 * **741 of the 846 carry no year at all** — neither a vote in the Board's
 * Journal nor a dated building on their frontage — and `yr = 0` means *drawn
 * in every year*, which is the same rule the 125,234 undated street trees are
 * drawn under.
 *
 * That is the honest contract and it has a failure mode the copy cannot fix on
 * its own: a reader who scrubs to 1906 sees the Presidio's full modern road
 * network laid over a burned city with nothing to say those lines are not a
 * 1906 fact. So an undated line is drawn at this alpha and a dated one at
 * full — an HONEST GLOBAL TREATMENT, declared as one, applied identically to
 * every undated line and measuring nothing about any of them.
 *
 * It is one constant because the choice is one decision: 1 draws them exactly
 * like dated lines, 0 hides them entirely, and neither is this file's to make.
 */
export const ST_UNDATED_ALPHA = 0.45;

/**
 * THE STAIRS.
 *
 * The 2.2 m band and the tick every 0.9 m are an **honest global treatment,
 * declared as one** — every stair in the city gets the same two numbers and
 * neither is a measurement of that stair. `aw7j-9354` publishes the RUN of 268
 * stairs and no width.
 */
export const ST_STAIR_BAND_M = 2.2;
export const ST_STAIR_TICK_M = 0.9;

/**
 * A CENTRELINE FADES ONLY WHERE A SURFACE HAS ARRIVED TO REPLACE IT.
 *
 * The first version faded every class on the pixel rule alone, and the suite
 * caught it:
 *
 *     FAIL 26c 1906 is not the 2018 street map — (0, 0)
 *
 * Pulling on that found a second, worse thing no test was asking about.
 * **534 centrelines have no published right of way.** `geo-data.js` ships
 * 4,895 centrelines (3psu-pn9h classes 0-4); the right-of-way file apportions
 * an area to 4,361 of them. The other 534 are exactly what the line exists for
 * — *the park roads, the Great Highway, Sloat, the freeways* — and under a
 * blanket fade they would have had **neither a line nor a surface** and would
 * have vanished at block zoom.
 *
 * So the rule is stated properly and the coverage bitmask is published data:
 * one point-in-polygon per centreline, its own midpoint against the
 * right-of-way polygons — two published files, nothing interpolated.
 *
 * 26b and 26c were **not loosened**. They count both layers, which leaves the
 * wording alone and makes 26c strictly harder, because it is measured over
 * 22,191 rights of way instead of 4,895 centrelines.
 */
export function centrelineFade(medianW: number, camScale: number): number {
  return Math.min(1, Math.max(0, 2 - medianW * ST_KPROJ * camScale));
}

/**
 * The two gates, as continuous ramps on the FEATURE's own projected size —
 * never on the camera. Keyed on the feature, promotion is staggered across the
 * frame by the city's own widths and **no frame is a different picture from
 * the one before it.**
 *
 * **The ramp is LINEAR over its own octave, and that is the mock's own
 * arithmetic** (`ea = (wpx - ST_EXT_PX) / (ST_EXT_PX1 - ST_EXT_PX)`), not a
 * taste. The line and the area have to SUM TO ONE over 2 px to 4 px and the
 * line's fade is linear; a smoothstep on one half of a partition of unity
 * breaks the sum, and the port had one. At the district camera the difference
 * is a factor of 1.6 on the largest layer in the frame: at the city's median
 * 2.63 px the linear weight is 0.316 and the smoothed one 0.2.
 */
function ramp(px: number, lo: number, hi: number): number {
  const t = (px - lo) / (hi - lo);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** the extent tier's weight for one feature of published width `wM` metres */
export function extentW(wM: number, camScale: number): number {
  return ramp(wM * ST_KPROJ * camScale, ST_EXT_PX, ST_EXT_PX1);
}

/** the surface tier's weight for one feature of published footway band `fwM` */
export function surfaceW(fwM: number, camScale: number): number {
  return ramp(fwM * ST_KPROJ * camScale, ST_SRF_PX, ST_SRF_PX1);
}

// ── the decoded network ─────────────────────────────────────────────────────

export interface StreetCell {
  readonly fid: Uint32Array;
  readonly kind: Uint8Array;
  readonly cls: Uint8Array;
  readonly cnn: Uint32Array;
  /** right-of-way width, DECIMETRES (`w[i] * 0.1` is metres) */
  readonly w: Uint16Array;
  /**
   * footway band, DECIMETRES — the same quantum as `w`, and the port divided
   * it by 100. Measured on the shipped chunks: raw p50 **30**, against
   * `manifest.streets.stats.fw_p50` of **3.16 m**.
   *
   * Ten times too narrow shut the tier at three of the four presets: the
   * WIDEST band in the city (31.8 m) computed 0.14 px at whole city, 0.40 at
   * district and 0.99 at block, so no right of way anywhere in the frame had
   * a carriageway or a kerb. At the fourth preset that one outlier cleared
   * 1 px at 5.92 — and because the port also took the frame's MAXIMUM weight
   * rather than each feature's own, one 31.8 m band then painted every
   * carriageway in the frame at full alpha. The two faults hid each other.
   */
  readonly fw: Uint16Array;
  /** the year the Board accepted or ordered it; 0 = undated */
  readonly yr: Uint16Array;
  /** the year it was improved (paved); 0 = undated */
  readonly imp: Uint16Array;
  /** the year it was kerbed; 0 = undated */
  readonly krb: Uint16Array;
  /** RINGS PER FEATURE. `rwLen` is per RING, not per feature. */
  readonly rwN: Uint8Array;
  readonly rwLen: Uint16Array;
  readonly rwX: Float32Array;
  readonly rwY: Float32Array;
  /** rings per feature: 0 on 108 rights of way, 2 on 69, 3 on 3 */
  readonly rdN: Uint8Array;
  readonly rdLen: Uint16Array;
  readonly rdX: Float32Array;
  readonly rdY: Float32Array;
  /** one bit per roadway vertex: is this edge a kerb, or the outer ROW edge? */
  readonly rdKerb: Uint8Array;
}

function fieldsOf(c: Chunk): StreetCell {
  const f = c.fields;
  return f as unknown as StreetCell;
}

/**
 * One bit per roadway vertex says whether that edge is a kerb or the outer
 * edge of the right of way — **so the kerb is drawn only where a kerb was
 * published, and the far edge of the right of way is not drawn as one.**
 * 1,961.6 km of the former, 1,768.9 km of the latter.
 */
export function isKerbEdge(cell: StreetCell, vertex: number): boolean {
  return ((cell.rdKerb[vertex >> 3] >> (vertex & 7)) & 1) === 1;
}

// ── the year ────────────────────────────────────────────────────────────────

/**
 * THE PERIOD ACCUMULATOR IS DIFFERENT FROM `time/`'s ON PURPOSE.
 *
 * `time/` keeps the earliest claim of *any* kind and discards the rest; this
 * keeps the earliest year of *each* kind, because a street the Board ordered
 * graded in 1908, paved in 1917 and curbed in 1921 is **three different
 * surfaces** and the record dates all three.
 *
 * 4,099 centrelines carry at least one dated claim: accept 2,051, improve
 * 1,897, open 928, curb 438, pave 355, sewer 254, grade 24. So 1,944 rights of
 * way are drawn unpaved before the Board orders them paved or accepts them,
 * and 1,974 drawn without a kerb before the Board orders one.
 */
export interface StreetPeriod {
  readonly exists: boolean;
  readonly paved: boolean;
  readonly kerbed: boolean;
}

export function periodOf(
  cell: StreetCell,
  i: number,
  year: number | undefined,
): StreetPeriod {
  if (year === undefined) return { exists: true, paved: true, kerbed: true };
  const yr = cell.yr[i],
    imp = cell.imp[i],
    krb = cell.krb[i];
  // An undated feature is drawn in every year and the count is on the page —
  // only 2,051 of 22,191 carry a year the Board voted, and pretending the rest
  // did not exist would be a claim the record does not make.
  return {
    exists: yr === 0 || year >= yr,
    paved: imp === 0 ? yr === 0 || year >= yr : year >= imp,
    kerbed: krb === 0 ? yr === 0 || year >= yr : year >= krb,
  };
}

// ── the pre-projection, because the mock has one ────────────────────────────

/**
 * `proj()` is LINEAR in world (x, y), so the plane coordinate of a right-of-way
 * vertex depends on the BEARING, the TILT and ZEX and on nothing the camera
 * does. The mock builds `SFPX/SFPY/SDPX/SDPY/SBOX` once in `buildSurfProj()`
 * and rebuilds them from `setRot()` and nothing else; here the same thing is a
 * `WeakMap` from the cell's own field object, so a chunk the cache evicts
 * takes its projection with it.
 *
 * **The key has to carry the terrain field as well as the three projection
 * numbers.** A plane coordinate has `z * zex` inside it, `zex` moves with the
 * band (`ZEX_BY_STEP` = 3.3 / 2.6 / 2.0) and `TerrainField` is rebuilt per
 * band too — so a cache keyed on the bearing alone would draw the district's
 * streets at the whole city's exaggeration.
 *
 * 259,699 vertices citywide, 5.1 per right of way and 6.6 per roadway: the
 * whole city is about 2 MB of cache, and only cells the camera has asked for
 * are ever built.
 */
interface SurfaceGeom {
  readonly key: string;
  readonly terrain: TerrainField | null;
  /** feature -> first ring, `n + 1` entries */
  readonly rwFo: Int32Array;
  /** ring -> first vertex, `rings + 1` entries */
  readonly rwOff: Int32Array;
  readonly rwPX: Float32Array;
  readonly rwPY: Float32Array;
  readonly rdFo: Int32Array;
  readonly rdOff: Int32Array;
  readonly rdPX: Float32Array;
  readonly rdPY: Float32Array;
  /** four numbers a feature: the plane box of its right of way */
  readonly box: Float32Array;
}

const GEOM = new WeakMap<StreetCell, SurfaceGeom>();

/**
 * THE RING INDEX, WHICH THE PORT DID NOT HAVE.
 *
 * `rwN[i]` is how many RINGS feature `i` owns and `rwLen[r]` is how many
 * vertices ring `r` owns; the port read `rwLen[i]` as the vertex count of
 * feature `i`. Measured on the shipped chunks: `rwN` is 2 on 2 features and
 * `rdN` is 0 on 108, 2 on 69 and 3 on 3 — and **one mismatch desynchronises
 * every feature after it in that cell**, so the roadway path of most cells was
 * built out of some other feature's vertices.
 */
function ringIndex(
  n: number,
  ringN: Uint8Array,
  ringLen: Uint16Array,
): { fo: Int32Array; off: Int32Array } {
  const fo = new Int32Array(n + 1);
  let r = 0;
  for (let i = 0; i < n; i++) {
    fo[i] = r;
    r += ringN[i];
  }
  fo[n] = r;
  const off = new Int32Array(r + 1);
  let v = 0;
  for (let k = 0; k < r; k++) {
    off[k] = v;
    v += ringLen[k];
  }
  off[r] = v;
  return { fo, off };
}

/**
 * THE VERTEX HEIGHT IS THE TERRAIN'S, NOT ZERO.
 *
 * The port put every right-of-way vertex through `proj(x, y, 0.4)` — sea level
 * plus 40 cm — while the mock uses `elevDrawn(x, y) + 0.8` and lets ZEX lift
 * it. At the district band ZEX is 2.6 and the scale 0.135, so a 30 m Sunset
 * street was drawn **10.5 px** off the blocks it runs between and Mt Davidson's
 * streets **98 px** off theirs. The 0.8 m is the mock's own lift, and it is
 * there so the surface wins the z-fight with the ground it is painted on.
 */
function buildGeom(
  f: Frame,
  cell: StreetCell,
  t: TerrainField | null,
): SurfaceGeom {
  const p = f.proj;
  const key = `${p.rotDeg}|${p.sA}|${p.zex}`;
  const hit = GEOM.get(cell);
  if (hit && hit.key === key && hit.terrain === t) return hit;

  const n = cell.cls.length;
  const { ax, ay, bx, by } = p.coeffs();
  const zex = p.zex;
  const plane = (
    X: Float32Array,
    Y: Float32Array,
  ): [Float32Array, Float32Array] => {
    const m = X.length;
    const px = new Float32Array(m),
      py = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const x = X[i],
        y = Y[i];
      const z = t ? t.elevM(x, y) + 0.8 : 0.4;
      px[i] = ax * x + ay * y;
      py[i] = bx * x + by * y + z * zex;
    }
    return [px, py];
  };
  const rw = ringIndex(n, cell.rwN, cell.rwLen);
  const rd = ringIndex(n, cell.rdN, cell.rdLen);
  const [rwPX, rwPY] = plane(cell.rwX, cell.rwY);
  const [rdPX, rdPY] = plane(cell.rdX, cell.rdY);

  const box = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (let r = rw.fo[i]; r < rw.fo[i + 1]; r++)
      for (let v = rw.off[r]; v < rw.off[r + 1]; v++) {
        const X = rwPX[v],
          Y = rwPY[v];
        if (X < x0) x0 = X;
        if (X > x1) x1 = X;
        if (Y < y0) y0 = Y;
        if (Y > y1) y1 = Y;
      }
    box[i * 4] = x0;
    box[i * 4 + 1] = x1;
    box[i * 4 + 2] = y0;
    box[i * 4 + 3] = y1;
  }
  const g: SurfaceGeom = {
    key,
    terrain: t,
    rwFo: rw.fo,
    rwOff: rw.off,
    rwPX,
    rwPY,
    rdFo: rd.fo,
    rdOff: rd.off,
    rdPX,
    rdPY,
    box,
  };
  GEOM.set(cell, g);
  return g;
}

// ── the draw ────────────────────────────────────────────────────────────────

export interface StreetDrawResult {
  /** centrelines stroked */
  readonly lines: number;
  /** right-of-way areas filled */
  readonly surfaces: number;
  /** features culled before entering a path */
  readonly held: number;
}

/**
 * THE CENTRELINE LAYER, WHOLE — AND THE CHUNK IT IS WAITING FOR.
 *
 * `3psu-pn9h` ships 4,895 centrelines of classes 0-4 and **no chunk in
 * `public/data/us/sf/city` carries their geometry.** `manifest.kinds.strt`
 * carries `rwX/rwY` (the right-of-way RING) and `rdX/rdY` (the roadway ring);
 * a ring is not a centreline, and stroking the far edge of a right of way
 * draws a property line, which the reference never does. That is why the
 * whole-city frame has no street network where the mock has a city of lines:
 * `ST_CLS_MAX[0] = 2`, so at the whole-city preset the reference strokes
 * classes 0-2 at **full alpha** — `centrelineFade(21.0, 0.0467)` clamps to 1 —
 * and this build strokes nothing at all.
 *
 * **This function is now the reference's `drawStreets` in full**, and the only
 * thing missing is `lines`. Hand it a `CentrelineCell[]` and the layer is on;
 * hand it none and it returns 0 exactly as before. Every clause below is
 * `part3.html` L6271-6330's:
 *
 * - **the class gate is the band's**, `ST_CLS_MAX[cam.step]`;
 * - **two passes a class**, `_cp` from 0 to `2*mx+1`, the low bit choosing the
 *   pass: pass 0 is the centrelines a published right of way covers and it
 *   FADES as that right of way becomes a surface; pass 1 is the **534
 *   centrelines with no published right of way** — the park roads, the Great
 *   Highway, Sloat, the freeways — which never fade, *"so a park road does not
 *   vanish at the zoom where the avenues become surfaces"*;
 * - **the fade is per class, on that class's own median published width**,
 *   `centrelineFade(medianW[cls], cam.scale)`, so *"a class stops being a line
 *   exactly when its own median member has finished becoming a surface"*;
 * - **one `lineWidth` and one `stroke()` per class**, never per feature — the
 *   reference measured 2,528 `stroke()` calls at 7.4 ms of a 16 ms frame;
 * - **the year gate is `y0 && y0 > yNow`**, so an undated centreline is drawn
 *   in every year. Only 2,051 of the 4,895 carry a date the Board voted, and
 *   the standing decision — *"this layer is the 2025 street map at every
 *   year"* — is stated in the reference and carried here rather than quietly
 *   improved;
 * - **the elevation is sampled once per vertex**, `elevM + 0.8`, because the
 *   reference measured 14,432 `elevM` calls per pass per frame for a number
 *   that cannot change;
 * - **and the pen lifts off-screen** (`±80 px`) instead of drawing a chord
 *   across the frame.
 *
 * THE CHUNK, stated so the encode is a small job and not a design one. One
 * `strt-line` kind, tier `strt`, `minZ` **0** — not 1.75, because the layer's
 * whole job is the wide shot — tiled on the same 1024 m grid as `strt`:
 *
 *     fid   u32   the centreline's own id
 *     cls   u8    3psu-pn9h classcode rank, 0-4, the same ranks ST_W indexes
 *     cnn   u32   so a line can be joined to the right of way it belongs to
 *     yr    u16   the year the Board voted it, 0 = undated (2,051 non-zero)
 *     cov   1 bit per feature: does a published right of way cover this line?
 *     n     u8    vertices
 *     len   u16   per feature
 *     x,y   f32   ABSOLUTE world metres, the same choice `strt` states and for
 *                 the same reason — a cell has to be independently decodable
 *
 * `cov` already exists on the wire in `base/street-misc` (`covn` = 4,895, one
 * bit per right of way) and is decoded by nobody; if the line chunk carries
 * its own copy the two must be asserted equal rather than assumed to be.
 */
export interface CentrelineCell {
  readonly cls: Uint8Array;
  /** the year the Board voted it; 0 = undated, and an undated line is drawn */
  readonly yr: Uint16Array;
  /** vertices per feature */
  readonly len: Uint16Array;
  /** world metres, absolute, packed feature after feature */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** one bit per feature: a published right of way covers this line */
  readonly cov?: Uint8Array;
}

/** the reference's own ink for the whole layer — `part3.html` L6283 */
export const ST_LINE_INK = "rgba(58,44,20,.20)";

/** world metres the line is lifted off the DEM before it is projected — L6249 */
export const ST_LINE_LIFT_M = 0.8;

/**
 * THE BRIDGE, AND HOW TO REMOVE IT.
 *
 * `drawStreetSurface` needs the terrain under every vertex and its caller did
 * not hand it one. `scene.paintStreets` passes `{ year, terrain: t }` now —
 * §15.6 landed it — so this assignment is dead weight kept only until the
 * centreline layer has data and this function is doing its own work again.
 */
let bridged: TerrainField | null = null;

export function drawCentrelines(
  f: Frame,
  _cells: readonly StreetCell[],
  t: TerrainField,
  opts: {
    /** per-class median published width, metres, read off the shipped widths at load */
    readonly medianW: readonly number[];
    /** true where a published right of way has arrived to replace this line */
    readonly covered: (cell: StreetCell, i: number) => boolean;
    readonly band: number;
    readonly ink?: string;
    /** the published centrelines, once a chunk carries them */
    readonly lines?: readonly CentrelineCell[];
    readonly year?: number;
  },
): number {
  bridged = t;
  const lines = opts.lines;
  if (!lines || !lines.length) return 0;
  const { ctx, cam, W, H } = f;
  const mx = ST_CLS_MAX[Math.min(opts.band, ST_CLS_MAX.length - 1)];
  const yNow = opts.year === undefined ? 9999 : Math.floor(opts.year);
  const cf = f.proj.coeffs();
  const zex = f.proj.zex;
  const k = cam.scale,
    W2 = W / 2,
    H2 = H / 2;
  const sga = ctx.globalAlpha;
  let drawn = 0;
  ctx.save();
  ctx.strokeStyle = opts.ink ?? ST_LINE_INK;
  for (let cp = 0; cp <= mx * 2 + 1; cp++) {
    const cls = cp >> 1,
      pass = cp & 1;
    // pass 0 fades as the right of way becomes a surface; pass 1 never does
    const la = opts.medianW[cls] > 0 ? centrelineFade(opts.medianW[cls], k) : 1;
    const a = pass ? 1 : la;
    if (a <= 0.004) continue;
    ctx.globalAlpha = sga * a;
    ctx.lineWidth = ST_W[Math.min(cls, ST_W.length - 1)];
    ctx.beginPath();
    let any = false;
    for (const c of lines) {
      const nF = c.cls.length;
      let o = 0;
      for (let i = 0; i < nF; i++) {
        const n = c.len[i];
        const base = o;
        o += n;
        if (c.cls[i] !== cls) continue;
        if (c.cov) {
          const covered = ((c.cov[i >> 3] >> (i & 7)) & 1) === 1;
          if (covered === (pass === 1)) continue;
        } else if (pass) continue;
        const y0 = c.yr[i];
        if (y0 && y0 > yNow) continue;
        let pen = false;
        for (let v = 0; v < n; v++) {
          const wx = c.x[base + v],
            wy = c.y[base + v];
          const pz = (t.elevM(wx, wy) + ST_LINE_LIFT_M) * zex;
          const X = (cf.ax * wx + cf.ay * wy - cam.cx) * k + W2;
          const Y = H2 - (cf.bx * wx + cf.by * wy + pz - cam.cy) * k;
          if (X < -80 || X > W + 80 || Y < -80 || Y > H + 80) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(X, Y);
          else ctx.moveTo(X, Y);
          pen = true;
          any = true;
        }
        drawn++;
      }
    }
    if (any) {
      /* ── THE ARTERIAL BED — `LOOK.artbed` ─────────────────────────────
         Rank 0 and 1 are the streets a reader finds the city by, and they
         were one hairline like every alley. The same path is stroked once
         more, pale and three times wider, UNDER the ink — the boulevard's
         own bed on the paper. One extra stroke per class per raster. */
      if (LOOK.artbed && cls <= 1) {
        const ink: string | CanvasGradient | CanvasPattern = ctx.strokeStyle, lw = ctx.lineWidth;
        ctx.strokeStyle = "rgba(252,248,238,0.62)";
        ctx.lineWidth = lw * (cls === 0 ? 3.6 : 2.8);
        ctx.stroke();
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw;
      }
      ctx.stroke();
    }
  }

  /* ── the streets no block implies ─────────────────────────────────────
   * Their own loop rather than a wider ceiling on the one above, for two
   * reasons that are both about not disturbing what already works: the loop
   * above is keyed on `cov`, and every one of these has `cov` 0 by
   * construction (there is no published right of way polygon for a Navy yard
   * or a park road, which is half of why no block implies them); and they
   * split on a second axis the loop above has no notion of — dated against
   * undated. Two paths per class, so the whole layer is at most six strokes.
   */
  if (opts.band >= UNIMPLIED_FROM_BAND) {
    for (let cls = ST_CLS_UNIMPLIED_MIN; cls <= ST_CLS_UNIMPLIED_MAX; cls++) {
      ctx.lineWidth = ST_W[Math.min(cls, ST_W.length - 1)];
      for (let undated = 0; undated < 2; undated++) {
        const a = undated ? ST_UNDATED_ALPHA : 1;
        if (a <= 0.004) continue;
        ctx.globalAlpha = sga * a;
        ctx.beginPath();
        let any = false;
        for (const c of lines) {
          const nF = c.cls.length;
          let o = 0;
          for (let i = 0; i < nF; i++) {
            const n = c.len[i];
            const base = o;
            o += n;
            if (c.cls[i] !== cls) continue;
            const y0 = c.yr[i];
            if ((y0 === 0) !== (undated === 1)) continue;
            if (y0 && y0 > yNow) continue;
            let pen = false;
            for (let v = 0; v < n; v++) {
              const wx = c.x[base + v],
                wy = c.y[base + v];
              const pz = (t.elevM(wx, wy) + ST_LINE_LIFT_M) * zex;
              const X = (cf.ax * wx + cf.ay * wy - cam.cx) * k + W2;
              const Y = H2 - (cf.bx * wx + cf.by * wy + pz - cam.cy) * k;
              if (X < -80 || X > W + 80 || Y < -80 || Y > H + 80) {
                pen = false;
                continue;
              }
              if (pen) ctx.lineTo(X, Y);
              else ctx.moveTo(X, Y);
              pen = true;
              any = true;
            }
            drawn++;
          }
        }
        if (any) ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = sga;
  ctx.restore();
  return drawn;
}

/**
 * The published right of way, as a surface.
 *
 * Both gates are **per feature**, so promotion is staggered across the frame
 * by the city's own widths and no frame is a different picture from the one
 * before it. Neither weight is a threshold: the ramp is an ALPHA.
 *
 * **16 ramp buckets x paved x kerbed.** A bucket is one `Path2D` and one fill,
 * so the whole city's ground is at most 64 fills however many rights of way
 * are on screen, and `ea`/`sa` stay continuous per feature and are quantised
 * only into the bucket that carries their colour. The port took the MAXIMUM
 * weight over the frame and applied it to every feature, which at the district
 * camera painted the city's median right of way at 1.0 where its own published
 * width earns 0.316 — the whole layer 3.2x too opaque.
 */
export function drawStreetSurface(
  f: Frame,
  cells: readonly StreetCell[],
  opts: {
    readonly year?: number;
    readonly skip?: (cnn: number) => boolean;
    /** the band's terrain field; see `bridged` */
    readonly terrain?: TerrainField | null;
  },
): StreetDrawResult {
  const { ctx, cam, W, H } = f;
  const k = cam.scale,
    W2 = W / 2,
    H2 = H / 2;
  const kp = ST_KPROJ * k;
  let surfaces = 0,
    held = 0;
  const t = opts.terrain ?? bridged;

  // 16 buckets x (paved, kerbed). The right of way and the carriageway share
  // the key, so a feature's two paths always carry the same tone decision.
  const NB = 16;
  const rowP = new Array<Path2D | undefined>(NB * 4);
  const roadP = new Array<Path2D | undefined>(NB * 4);
  const kerbP = new Array<Path2D | undefined>(4);
  const mg = 64;
  let any = false;

  for (const cell of cells) {
    const n = cell.cls.length;
    const g = buildGeom(f, cell, t);
    for (let i = 0; i < n; i++) {
      // cull before the path: the clip region an off-screen feature would add
      // is what the fill after it has to rasterise
      const X0 = (g.box[i * 4] - cam.cx) * k + W2;
      if (X0 > W + mg) continue;
      const X1 = (g.box[i * 4 + 1] - cam.cx) * k + W2;
      if (X1 < -mg) continue;
      const Y1 = H2 - (g.box[i * 4 + 2] - cam.cy) * k;
      if (Y1 < -mg) continue;
      const Y0 = H2 - (g.box[i * 4 + 3] - cam.cy) * k;
      if (Y0 > H + mg) continue;

      if (opts.skip && opts.skip(cell.cnn[i])) {
        held++;
        continue;
      }
      // THE CLOCK. A right of way is not drawn before the year the Board is
      // recorded accepting the street it carries. 0 means the record is
      // silent, and a silent street is drawn from the first year the map
      // draws.
      const per = periodOf(cell, i, opts.year);
      if (!per.exists) {
        held++;
        continue;
      }

      const ea = ramp(cell.w[i] * 0.1 * kp, ST_EXT_PX, ST_EXT_PX1);
      if (ea <= 0.004) continue;
      let sa = ramp(cell.fw[i] * 0.1 * kp, ST_SRF_PX, ST_SRF_PX1);
      if (sa > 0 && sa < 0.02) sa = 0; // a pass that cannot be seen is not built

      // AN UNKERBED STREET IS ONE TONE WALL TO WALL, because there is no kerb
      // to divide the roadway from the footway. 1,974 of them stand unkerbed
      // before the Board orders one.
      const eff = per.kerbed ? sa : 0;
      const q =
        eff > 0 ? 8 + Math.min(7, (eff * 8) | 0) : Math.min(7, (ea * 8) | 0);
      const key = q * 4 + (per.paved ? 0 : 2) + (per.kerbed ? 0 : 1);

      let P = rowP[key];
      if (!P) P = rowP[key] = new Path2D();
      for (let r = g.rwFo[i]; r < g.rwFo[i + 1]; r++) {
        const a = g.rwOff[r],
          b = g.rwOff[r + 1];
        if (b - a < 3) continue;
        P.moveTo((g.rwPX[a] - cam.cx) * k + W2, H2 - (g.rwPY[a] - cam.cy) * k);
        for (let v = a + 1; v < b; v++)
          P.lineTo((g.rwPX[v] - cam.cx) * k + W2, H2 - (g.rwPY[v] - cam.cy) * k);
        P.closePath();
      }
      surfaces++;
      any = true;

      if (eff > 0) {
        let Z = roadP[key];
        if (!Z) Z = roadP[key] = new Path2D();
        const kbk = Math.min(3, (eff * 4) | 0);
        let K = kerbP[kbk];
        if (!K) K = kerbP[kbk] = new Path2D();
        for (let r = g.rdFo[i]; r < g.rdFo[i + 1]; r++) {
          const a = g.rdOff[r],
            b = g.rdOff[r + 1];
          if (b - a < 3) continue;
          let px = (g.rdPX[a] - cam.cx) * k + W2,
            py = H2 - (g.rdPY[a] - cam.cy) * k;
          Z.moveTo(px, py);
          for (let v = a + 1; v < b; v++)
            Z.lineTo(
              (g.rdPX[v] - cam.cx) * k + W2,
              H2 - (g.rdPY[v] - cam.cy) * k,
            );
          Z.closePath();
          // THE KERB. One bit per roadway vertex says whether the edge leaving
          // it is a published kerb ring or the outer edge of the right of way.
          // Only the first is stroked, and it is stroked as RUNS, so a kerb
          // that turns forty corners is one subpath and not forty.
          let open = false;
          for (let v = a; v < b; v++) {
            const nx = v + 1 < b ? v + 1 : a;
            const qx = (g.rdPX[nx] - cam.cx) * k + W2,
              qy = H2 - (g.rdPY[nx] - cam.cy) * k;
            if (isKerbEdge(cell, v)) {
              if (!open) {
                K.moveTo(px, py);
                open = true;
              }
              K.lineTo(qx, qy);
            } else open = false;
            px = qx;
            py = qy;
          }
        }
      }
    }
  }

  if (!any) return { lines: 0, surfaces, held };

  const save = ctx.globalAlpha;
  // THE RIGHT OF WAY. `evenodd` was a defect and not a style: the file
  // publishes SEGMENT areas and INTERSECTION areas, 14,397 and 7,794, and they
  // overlap at every corner — so one accumulated path filled evenodd cancelled
  // every junction in the city to a hole. The mock fills nonzero.
  for (let key = 0; key < NB * 4; key++) {
    const P = rowP[key];
    if (!P) continue;
    const q = key >> 2,
      paved = !(key & 2),
      kerbed = !(key & 1);
    const sa = q >= 8 ? (q - 8 + 0.5) / 8 : 0;
    const ea = q >= 8 ? 1 : (q + 0.5) / 8;
    ctx.fillStyle = kerbed
      ? hexMix(ST_C_MIX, ST_C_FOOT, sa)
      : paved
        ? ST_C_ROAD
        : ST_C_RAW;
    ctx.globalAlpha = ST_ALPHA * ea;
    ctx.fill(P);
  }
  // the carriageway inside it
  for (let key = 0; key < NB * 4; key++) {
    const Z = roadP[key];
    if (!Z) continue;
    const q = key >> 2,
      paved = !(key & 2);
    ctx.fillStyle = paved ? ST_C_ROAD : ST_C_RAW;
    ctx.globalAlpha = ST_ALPHA * ((q - 8 + 0.5) / 8);
    ctx.fill(Z);
  }
  ctx.strokeStyle = ST_C_KERB;
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  for (let b = 0; b < 4; b++) {
    const K = kerbP[b];
    if (!K) continue;
    ctx.lineWidth = Math.min(1.6, 0.7 + 0.9 * ((b + 0.5) / 4));
    ctx.globalAlpha = 0.62 * ((b + 0.5) / 4);
    ctx.stroke(K);
  }
  ctx.globalAlpha = save;
  return { lines: 0, surfaces, held };
}

/**
 * `setStreetSurfaceSkip` in the mock, and it ships EMPTY.
 *
 * The Bay Bridge's own alignment is IN the 2025 right-of-way file, so it is
 * drawn across open water in 1906, and shot 8's subject — the bridge arriving
 * in 1936 — is a line that firms up rather than a line that appears. Nothing
 * here decides anything: the hook exists, `gen/` ships it empty and the
 * explorer never sets it.
 */
export function makeSkip(cnns: Iterable<number> | null): (c: number) => boolean {
  if (!cnns) return () => false;
  const s = new Set(cnns);
  return (c: number) => s.has(c);
}

export { fieldsOf as streetCellOf };

// ── `base/street-misc`, which shipped for five blocks and drew nothing ───────

/**
 * The published islands, medians and stair runs.
 *
 * `base/street-misc` has carried **1,120 ISLANDS rings out of `emxt-b6yg` and
 * 268 published stair runs out of `aw7j-9354`** since Block B4, and `CityData`
 * has decoded them since B6. Nothing has ever drawn either. `part3.html`
 * L6608-6672 draws both, at the end of the street surface and before the
 * centrelines, and both clauses below are that code's.
 *
 * **THE ISLANDS ARE FOOTWAY, because that is what a refuge is.** They carry no
 * width of their own to tier on, so the reference gates the whole layer on the
 * FRAME's median footway band instead — and the `3.16` at L6612 is not a
 * chosen number: it is `manifest.streets.stats.fw_p50`, the city's own median
 * published footway, and it is passed in rather than written here for exactly
 * the reason FOCUS.md gives about the other seven.
 *
 * **THE STAIRS ARE AN HONEST GLOBAL TREATMENT AND ARE DECLARED AS ONE.**
 * `aw7j-9354` publishes the RUN of each stair and neither a width nor a tread
 * count, so every stair in San Francisco is drawn `ST_STAIR_BAND_M` wide with a
 * tick every `ST_STAIR_TICK_M`, and **neither number is a measurement of that
 * stair.** They are drawn only where the tick is more than two pixels from the
 * next one, so nothing is implied that cannot be seen.
 *
 * THE ONE CALL SITE, which is `scene.paintStreets` and not this file:
 *
 * ```ts
 * const misc = this.data.streetMisc();
 * if (misc) drawStreetMisc(f, misc, t, { fwMedianM: stats.stats.fw_p50 });
 * ```
 *
 * after `drawStreetSurface` and before the return. `streetMisc()` is null until
 * the `strt` tier lands at z = 1.75, which is below both gates anyway, so the
 * wide shot is unchanged by construction.
 */
export interface StreetMiscGeom {
  readonly islandLen: Uint16Array;
  readonly islandX: Float32Array;
  readonly islandY: Float32Array;
  readonly stairLen: Uint16Array;
  readonly stairX: Float32Array;
  readonly stairY: Float32Array;
}

export interface StreetMiscResult {
  /** island rings filled */
  readonly islands: number;
  /** stair runs stroked */
  readonly stairs: number;
  /** ticks laid across those runs */
  readonly treads: number;
}

export function drawStreetMisc(
  f: Frame,
  misc: StreetMiscGeom,
  t: TerrainField,
  opts: {
    /** `manifest.streets.stats.fw_p50` — the city's own median footway band */
    readonly fwMedianM: number;
    readonly kerb?: boolean;
  },
): StreetMiscResult {
  const { ctx, cam, W, H } = f;
  const k = cam.scale,
    W2 = W / 2,
    H2 = H / 2;
  const kp = ST_KPROJ * k;
  const cf = f.proj.coeffs();
  const zex = f.proj.zex;
  const mg = 64;
  const save = ctx.globalAlpha;
  let islands = 0,
    stairs = 0,
    treads = 0;

  const px = (wx: number, wy: number): [number, number] => {
    const pz = (t.elevM(wx, wy) + ST_LINE_LIFT_M) * zex;
    return [
      (cf.ax * wx + cf.ay * wy - cam.cx) * k + W2,
      H2 - (cf.bx * wx + cf.by * wy + pz - cam.cy) * k,
    ];
  };

  // THE ISLANDS AND MEDIANS — the same gate the footway pass uses, reached by a
  // different route because a refuge publishes no width of its own.
  if (misc.islandLen.length && opts.fwMedianM * kp >= ST_SRF_PX + 0.5) {
    const P = new Path2D();
    let v = 0,
      any = false;
    for (let r = 0; r < misc.islandLen.length; r++) {
      const nv = misc.islandLen[r];
      let open = false;
      for (let i = 0; i < nv; i++) {
        const [X, Y] = px(misc.islandX[v + i], misc.islandY[v + i]);
        // the reference abandons the whole ring when its FIRST vertex is off
        // screen; a ring is a small closed thing, so that is the cull
        if (X < -mg || X > W + mg || Y < -mg || Y > H + mg) {
          if (i === 0) break;
          continue;
        }
        if (!open) {
          P.moveTo(X, Y);
          open = true;
        } else P.lineTo(X, Y);
      }
      if (open) {
        P.closePath();
        islands++;
        any = true;
      }
      v += nv;
    }
    if (any) {
      ctx.fillStyle = ST_C_FOOT;
      ctx.globalAlpha = ST_ALPHA;
      ctx.fill(P);
      if (opts.kerb !== false) {
        ctx.strokeStyle = ST_C_KERB;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        ctx.stroke(P);
      }
    }
  }

  // THE STAIRS. Only where a tread is more than two pixels from the next.
  if (misc.stairLen.length && ST_STAIR_TICK_M * kp > 2.0) {
    const wpx = ST_STAIR_BAND_M * kp;
    const P = new Path2D(),
      T = new Path2D();
    let v = 0,
      any = false;
    for (let r = 0; r < misc.stairLen.length; r++) {
      const nv = misc.stairLen[r];
      let prev: [number, number] | null = null;
      let open = false;
      for (let i = 0; i < nv; i++) {
        const p = px(misc.stairX[v + i], misc.stairY[v + i]);
        if (p[0] < -mg || p[0] > W + mg || p[1] < -mg || p[1] > H + mg) {
          // THE PEN LIFTS OFF SCREEN rather than drawing a chord across the
          // frame — the same clause `drawCentrelines` states.
          open = false;
          prev = null;
          continue;
        }
        if (!open) {
          P.moveTo(p[0], p[1]);
          open = true;
          any = true;
          stairs++;
        } else P.lineTo(p[0], p[1]);
        if (prev) {
          const dx = p[0] - prev[0],
            dy = p[1] - prev[1];
          const L = Math.hypot(dx, dy);
          if (L > 0.5) {
            const ux = dx / L,
              uy = dy / L,
              stp = ST_STAIR_TICK_M * kp;
            for (let s = stp; s < L; s += stp) {
              const mx = prev[0] + ux * s,
                my = prev[1] + uy * s;
              T.moveTo(mx - (uy * wpx) / 2, my + (ux * wpx) / 2);
              T.lineTo(mx + (uy * wpx) / 2, my - (ux * wpx) / 2);
              treads++;
            }
          }
        }
        prev = p;
      }
      v += nv;
    }
    if (any) {
      ctx.globalAlpha = ST_ALPHA;
      ctx.strokeStyle = ST_C_FOOT;
      ctx.lineWidth = wpx;
      ctx.lineCap = "butt";
      ctx.stroke(P);
      ctx.strokeStyle = ST_C_KERB;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.stroke(T);
    }
  }

  ctx.globalAlpha = save;
  return { islands, stairs, treads };
}
