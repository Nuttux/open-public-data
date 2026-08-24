/**
 * THE SCENE — one paint of the city, composed out of the nine landed draw
 * modules.
 *
 * Block P4. This file owns nothing the draw modules own: it decodes the base
 * chunks into the tables those modules ask for, holds the caches that are keyed
 * on the LOD band, and calls them in the one order `DRAW.md` fixes —
 *
 *     terrain → water → streets → trees → buildings → {facades, roofs}
 *              → landmarks → labels
 *
 * — which is import order, which is paint order, and which no module here may
 * reorder.
 *
 * ── WHAT IS NEW CODE HERE AND WHAT IS A CALL ─────────────────────────────
 * Everything below is a call into `lib/city/` **except the footprint prism
 * pass** (`drawFootprints`). `buildings.ts` ships the massing tier's own draw
 * and every rule the footprint tier needs — `tierW`, `drawnAsBuilding`,
 * `colourLUT`, `inkFor`, the gates — but no `drawCity`: the mock's 597-line
 * `drawCity()` was not ported, and `DRAW.md` §5's module table does not list
 * one. So the loop is written here, against those rules, and it is a
 * SIMPLIFICATION of the mock's rather than a transcription of it. What it does
 * not carry is stated in SHELL.md §"What is not wired".
 *
 * ── NOTHING IS FABRICATED ────────────────────────────────────────────────
 * Every geometry, height, year, use class and roof colour on this canvas comes
 * out of a chunk. Where a field is missing the feature is not drawn, never
 * guessed: a chunk that has not arrived yet reads as *less city*, which is what
 * progressive loading is supposed to look like.
 */

import {
  Projection,
  screenToPlane,
  ZEX_BY_STEP,
  type ViewCamera,
} from "@/lib/city/projection";
import {
  bandOf,
  type CityExtent,
} from "@/lib/city/camera";
import {
  CityData,
  type Chunk,
  type CityView,
  type HeroData,
  type FormTable,
  type LandmarkTable,
  type SurroundData,
  type SurroundCoast,
} from "@/lib/city/data";
import {
  TerrainField,
  buildSurroundLam,
  drawSurround,
  drawTerrain,
  wallGrad,
  zOf,
  shade,
  skylitN,
  HAZE,
  WA,
  type Frame,
  type SurroundGrid,
  type TerrainProj,
} from "@/lib/city/terrain";
import {
  bayPlate,
  buildDepthPlate,
  buildShoal,
  buildShoalHoles,
  decodeCoast,
  depthColour,
  depthM,
  depthRamp,
  drawShoreline,
  drawWater,
  inPoly,
  shoalCellAlpha,
  shoalNodeAlpha,
  type DepthTile,
  type Ring,
  type WaterMeta,
} from "@/lib/city/water";
import {
  drawCentrelines,
  drawStreetMisc,
  drawStreetSurface,
  ST_EXT_PX,
  ST_KPROJ,
  type StreetCell,
} from "@/lib/city/streets";
import {
  buildSpriteSheet,
  decodeParks,
  drawParkRings,
  drawVeg,
  drawWaterBodies,
  VZ_C0,
  VZ_T0,
  assertTreeGrid,
  type CanopyCells,
  type ParkRing,
  type SpriteSheet,
  type TreeCell,
  type TreeGrid,
} from "@/lib/city/trees";
import {
  addContactShadow,
  AO,
  AO_ALPHA,
  areaRect,
  BLOCK_INSET_M,
  blockRing,
  bucketFloor,
  buildURND,
  colourLUT,
  coverageAlpha,
  COVER_GAIN,
  drawMassing,
  drawnAsBuilding,
  extremeQuad,
  fillContactShadow,
  edgeInk,
  edgeWidth,
  inkFor,
  LOD_Z0,
  massAt,
  massingOf,
  massLUT,
  planeQuartile,
  shadowOffset,
  streamOrder,
  tierW,
  tintIndex,
  EDGE_SHADE,
  HZL,
  NF1,
  NEAR_PX,
  QUAD_PX,
  QUAD_SCALE,
  RECT_SCALE,
  SHADOW_MIN_PX,
  STROKE_MIN_PX_A,
  STROKE_MIN_PX_B,
  WALL_MIN_PX,
  type BlockGeometry,
  type ColourTables,
  type Massing,
} from "@/lib/city/buildings";
import {
  faceWeights,
  faceGroupAlpha,
  faceGroupPath,
  faEra,
  faRamp,
  FA_RAMP,
  flushFaces,
  newFaceGroups,
  storeysOf,
  faceTakesOpenings,
  FA_CORN_M,
  FA_SHOP_FASCIA,
  FA_SHOP_SILL,
  FA_SHOP_TOE,
  GND_AS_ABOVE,
  GND_ENTRANCE,
  GND_SHOP,
  GND_VEHICLE,
  ROLE_BACK,
  ROLE_FRONT,
  doorBay,
  faGlassy,
  FA_CORN_T,
  FA_FOOT_CAP,
  FA_FOOT_M,
  FA_MIN_DH_PX,
  footGrad,
  footWeight,
} from "@/lib/city/facades";
import {
  bandOfHeight,
  drawHip,
  drawStep,
  drawTray,
  drawsStoreyLines,
  roofFineLUT,
  roofHeight,
  roofStep,
  trayW,
  STOREY_INK_V,
  STOREY_W_PX,
  type Quartiles,
} from "@/lib/city/roofs";
import {
  drawBridge,
  drawHero,
  heroMaterials,
  type HeroMaterials,
} from "@/lib/city/landmarks";
import {
  buildHoodAnchors,
  drawHoodNames,
  LabelGrid,
  placeNames,
  StreetNamePass,
  type HoodAnchor,
  type PlaceLabel,
} from "@/lib/city/labels";
import { riseOf, risePhase } from "@/lib/city/film";
import { SCRUB_MAX } from "@/lib/city/time";
import {
  ERA_MEASURED,
  isPitched,
  PAINT_C0,
  UMAT_ROOF,
  UMAT_WALL,
  USE_MASK,
  FLAG_NOYEAR,
  WAM,
  heightBand,
  legendTones,
  roofEraTable,
  roofPalette,
  storeyBand,
  wallPalette,
  yearBand,
  YR_N,
} from "./palette";

// ═══ decoded tables ════════════════════════════════════════════════════════

/**
 * One `bldg` chunk, replayed.
 *
 * The stream is a Hilbert-ordered delta chain with an escape list, and this is
 * `part3.html`'s decoder: a running cumulative sum over the whole `vx`/`vy`
 * stream, with `esc[i]` extra steps consumed before building `i`'s own run.
 * `verify_city_chunks.py` compares all 885,776 vertices of all 166,166
 * buildings against this walk, so the arithmetic is proved, not assumed.
 */
export interface BldTable {
  readonly n: number;
  readonly gid: Uint32Array;
  /** vertex offset per building, length n+1 */
  readonly off: Uint32Array;
  readonly vxw: Float32Array;
  readonly vyw: Float32Array;
  /** the vertex mean — part3's `UX`/`UY`, and the hero anchor */
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly h: Uint8Array;
  readonly hf: Uint8Array;
  readonly yr: Uint8Array;
  readonly u: Uint8Array;
  readonly st: Uint8Array;
  readonly paintIdx: Uint8Array;
  readonly paintFlag: Uint8Array;
  /** roof / wall palette index, resolved once from the published columns */
  readonly ri: Uint8Array;
  readonly wi: Uint8Array;
  /**
   * WHERE THIS BUILDING'S PUBLISHED HEIGHT STANDS INSIDE ITS OWN BAND, 0..3
   * — `part3.html`'s `RSH`, off `manifest.buildings.hq`. See `paintFootprints`
   * for what it was costing to leave it unread.
   */
  readonly rsh: Uint8Array;
}

const BLDG_Q = 1.0; // BLDG.q — the published 1 m vertex quantiser

/**
 * `paintFlag` IS NOT A COVERAGE FLAG, and reading it as one inverted the
 * measured roof colour off 98.4 % of the city.
 *
 * The column is `PAINT.flagBits` — three independent SAMPLE-QUALITY bits,
 * shipped verbatim as `manifest.buildings.paintFlagBits` so this file does
 * not have to hard-code them:
 *
 *     1  canopy    the footprint is over half tree canopy in the imagery
 *     2  shadow    over half deep shadow
 *     4  nosample  nothing came back; `paintIdx` holds the city median
 *
 * 163,480 of 166,166 carry NONE of the three — a zero means the sample was
 * CLEAN. So `if (paintFlag[i])` selected exactly the 2,686 roofs whose sample
 * is the *least* trustworthy and threw the other 163,480 measurements away,
 * which is why 98.4 % of roofs fell back to `UMAT_ROOF` and four of its
 * sixteen materials are terracotta.
 *
 * `part3.html` §7256 assigns `URI[i] = PAINT_C0 + PIDX[i]` for every building
 * with no test at all — it loads `PFLG` and never consults it. This file
 * differs from the mock in one respect and one only: the 124 footprints whose
 * `nosample` bit is set keep the legend, because for those `paintIdx` is the
 * city median rather than a measurement of that roof, and this project does
 * not paint an unmeasured building in a measured colour. 124 of 166,166 is
 * 0.07 % and it is below the threshold of anything visible; the reason to do
 * it is that it keeps the field load-bearing and honest.
 */
const PAINT_NOSAMPLE_DEFAULT = 4;

function decodeBld(
  chunk: Chunk,
  year0: number,
  tone: ToneContext,
  noSampleBit: number,
): BldTable {
  const f = chunk.fields;
  const gid = f.gid as Uint32Array;
  const cnt = f.cnt as Uint8Array;
  const vx = f.vx as Int8Array;
  const vy = f.vy as Int8Array;
  const xi = f.xi as Uint32Array;
  const xn = f.xn as Uint16Array;
  const n = cnt.length;

  const esc = new Uint32Array(n);
  for (let k = 0; k < xi.length; k++) esc[xi[k]] += xn[k];

  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const nv = off[n];
  const vxw = new Float32Array(nv);
  const vyw = new Float32Array(nv);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);

  let ax = 0;
  let ay = 0;
  let p = 0; // position in the delta stream
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < esc[i]; e++) {
      ax += vx[p];
      ay += vy[p];
      p++;
    }
    let sxAcc = 0;
    let syAcc = 0;
    const o = off[i];
    for (let k = 0; k < cnt[i]; k++) {
      ax += vx[p];
      ay += vy[p];
      p++;
      const wx = ax * BLDG_Q;
      const wy = ay * BLDG_Q;
      vxw[o + k] = wx;
      vyw[o + k] = wy;
      sxAcc += wx;
      syAcc += wy;
    }
    cx[i] = cnt[i] ? sxAcc / cnt[i] : 0;
    cy[i] = cnt[i] ? syAcc / cnt[i] : 0;
  }

  const h = f.h as Uint8Array;
  const hf = f.hf as Uint8Array;
  const yr = f.yr as Uint8Array;
  const u = f.u as Uint8Array;
  const st = f.st as Uint8Array;
  const paintIdx = f.paintIdx as Uint8Array;
  const paintFlag = f.paintFlag as Uint8Array;

  const ri = new Uint8Array(n);
  const wi = new Uint8Array(n);
  /* THE ROOF'S VALUE INSIDE ITS OWN BAND. `part3.html` L1113 builds this off
     `UH[i]` — the PUBLISHED byte, not the byte plus `roofs.ts`'s 0.25 m
     residual — so it is built off the byte here too. The residual is +-0.375 m
     against quartiles that sit 0.42 m apart in band 0, so reading the
     corrected height would move a step on the buildings nearest a boundary and
     the two builds would disagree on a value nobody could point at. */
  const rsh = new Uint8Array(n);
  const hq = tone.hq;
  const hasHq = hq.length > 0;
  for (let i = 0; i < n; i++) {
    if (hasHq) rsh[i] = roofStep(h[i], hq);
    const use = u[i] & USE_MASK;
    const noyr = (u[i] & FLAG_NOYEAR) !== 0;
    const wl = UMAT_WALL[use];
    const rl = UMAT_ROOF[use];
    if (wl && rl) {
      const hb = heightBand(h[i]);
      const y = year0 + yr[i];
      const ab = noyr ? Math.min(4, hb) : yearBand(y);
      const sb = storeyBand(st[i]);
      wi[i] = WAM(wl[ab * 3 + sb]);
      ri[i] = WAM(rl[hb * 2 + (noyr ? (hb > 1 ? 1 : 0) : y < 1925 ? 0 : 1)]);
    } else {
      // the honest bucket — no roll row, so the locale legend and nothing else
      const r = Math.hypot(cx[i] - tone.dtx, cy[i] - tone.dty) / tone.maxR;
      const side =
        (cx[i] - tone.fx) * tone.mvy - (cy[i] - tone.fy) * tone.mvx < 0 ? 0 : 1;
      /* THE NOISE IS INDEXED BY THE PUBLISHED BUILDING, NOT BY THE ROW.
         `URND[i]` in the mock is keyed on the global footprint index; `i` here
         is the position inside THIS CHUNK, so every chunk restarted the
         sequence at zero and the locale legend handed out a different tone
         from the reference on every footprint whose parcel joins no roll row.
         MEASURED against the running mock over the 15,261 footprints of
         `base/solo`: 3,053 of them — 20.0 % — carried a different wall
         material, and they are the buildings the legend exists for. */
      const t = legendTones(r, side, tone.rnd(gid[i]));
      wi[i] = t.wall;
      ri[i] = t.roof;
    }
    /* THE ROOF IS MEASURED, AND IT REPLACES THE LEGEND FOR EVERY BUILDING
       THE IMAGERY RETURNED A SAMPLE FOR — 166,042 of 166,166, 99.9 %. Only
       the `nosample` bit withholds it. See PAINT_NOSAMPLE_DEFAULT above for
       what the other two bits are and what the gate that used to be here
       cost. Placed after the tone loop, before the published-class override
       below, which is part3.html's own order. */
    if ((paintFlag[i] & noSampleBit) === 0) ri[i] = PAINT_C0 + paintIdx[i];
  }
  return { n, gid, off, vxw, vyw, cx, cy, h, hf, yr, u, st, paintIdx, paintFlag, ri, wi, rsh };
}

/** the three named points the locale legend is measured against */
interface ToneContext {
  dtx: number;
  dty: number;
  fx: number;
  fy: number;
  mvx: number;
  mvy: number;
  maxR: number;
  /** `manifest.buildings.hq` — the published height quartiles, per band */
  hq: Quartiles;
  rnd: (i: number) => number;
}

export interface BlockTable extends BlockGeometry {
  readonly area: Float32Array;
  readonly hood: Uint8Array;
  readonly hoodNames: readonly string[];
  readonly ids: readonly string[];
  /**
   * THE BLOCK'S MEASURED ROOF COLOUR — an index into the same 32-entry palette
   * the buildings use, or `BIDX_NONE` where no sampled building stands on the
   * block. Shipped by P1 at P4b's request; see `blockRoofIdx`.
   */
  readonly bidx: Uint8Array;
}

/** `paint/blocks.py`'s `NOBLOCK`: park, water or right of way — 361 of 5,404 */
const BIDX_NONE = 255;

/** the hit-test grid's cell, in metres — see `blockHashOf` for why 160 */
const HIT_CELL_M = 160;

/**
 * THE RIGHT-OF-WAY SNAP'S TWO BOUNDS — see the call site in `pick`.
 *
 * `PICK_SNAP_M` is the load-bearing one: 10.5 m is half of San Francisco's
 * standard 68.6 ft right of way, so the snap reaches the centre line of an
 * ordinary street and no further. `PICK_SNAP_PX` is a guard, not a dial — at
 * 18 CSS px the world bound governs at all four of the page's stops (10.5 m is
 * 18.2 px at the street stop's scale and 0.6 px at the whole-city stop), and
 * it is there so a zoom deeper than the four stops offer cannot turn a
 * fixed world distance into a snap the reader can see happening.
 */
const PICK_SNAP_PX = 18;
const PICK_SNAP_M = 10.5;

/** plane units per world metre at this bearing: `proj()` is
 *  `(xr − yr)·CA` and |(cR−sR, cR+sR)|/√2 is 1, so one world metre is `CA`
 *  of plane, and one plane unit is `cam.scale` screen pixels. */
const PLANE_PER_M = Math.cos(Math.PI / 6);

/** squared distance from a point to a segment — the snap's own measurement */
function segDist2(
  x: number, y: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + t * dx - x;
  const py = ay + t * dy - y;
  return px * px + py * py;
}

/** the hit test's uniform grid over the 5,404 published block rings */
interface BlockHash {
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly nx: number;
  readonly ny: number;
  /** CSR offsets, length nx·ny+1 */
  readonly start: Uint32Array;
  readonly items: Int32Array;
  readonly bx0: Float32Array;
  readonly by0: Float32Array;
  readonly bx1: Float32Array;
  readonly by1: Float32Array;
}

/** the footprint grid's cell, in metres — the median footprint is ~12 m */
const FOOT_CELL_M = 40;

/** the hit test's uniform grid over the footprints the frame is drawing */
interface FootHash {
  readonly key: string;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly nx: number;
  readonly ny: number;
  readonly start: Uint32Array;
  readonly items: Int32Array;
  readonly tables: readonly BldTable[];
  readonly tbl: Int32Array;
  readonly idx: Int32Array;
  readonly bx0: Float32Array;
  readonly by0: Float32Array;
  readonly bx1: Float32Array;
  readonly by1: Float32Array;
  /** the roof, in the march's units — see `footSolid` */
  readonly topZ: Float32Array;
  /** the block whose ring contains this footprint's centroid, or −1 */
  readonly blk: Int32Array;
  readonly max: number;
}

/**
 * The footprint the march has just entered, resolved to its block.
 *
 * −1 no footprint here · −2 a footprint the assessor puts on no block.
 */
function footUnder(h: FootHash, x: number, y: number, z: number): number {
  const ii = Math.floor((x - h.x0) / h.cell);
  const jj = Math.floor((y - h.y0) / h.cell);
  if (ii < 0 || jj < 0 || ii >= h.nx || jj >= h.ny) return -1;
  const c = jj * h.nx + ii;
  for (let k = h.start[c]; k < h.start[c + 1]; k++) {
    const i = h.items[k];
    if (h.topZ[i] < z) continue;
    if (x < h.bx0[i] || x > h.bx1[i] || y < h.by0[i] || y > h.by1[i]) continue;
    const tb = h.tables[h.tbl[i]];
    if (!ringHitBld(tb, h.idx[i], x, y)) continue;
    return h.blk[i] >= 0 ? h.blk[i] : -2;
  }
  return -1;
}

/** `ringHit`, against a decoded footprint's own vertex run */
function ringHitBld(tb: BldTable, i: number, x: number, y: number): boolean {
  const o = tb.off[i];
  const m = tb.off[i + 1] - o;
  if (m < 3) return false;
  let inside = false;
  for (let a = 0, b = m - 1; a < m; b = a++) {
    const xi = tb.vxw[o + a];
    const yi = tb.vyw[o + a];
    const xj = tb.vxw[o + b];
    const yj = tb.vyw[o + b];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/**
 * Point in a block's published ring, read straight off the typed arrays.
 *
 * `water.ts`'s `inPoly` takes `[number, number][]`, which meant the old hit
 * test allocated one array of pairs per candidate block per click. The march
 * runs this per step, so the allocation is the cost. Same crossing rule,
 * no garbage.
 */
function ringHit(g: BlockGeometry, i: number, x: number, y: number): boolean {
  const o = g.off[i];
  const m = g.off[i + 1] - o;
  if (m < 3) return false;
  let inside = false;
  for (let a = 0, b = m - 1; a < m; b = a++) {
    const xi = g.rx[o + a];
    const yi = g.ry[o + a];
    const xj = g.rx[o + b];
    const yj = g.ry[o + b];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function decodeBlocks(
  chunk: Chunk,
  hoodNames: readonly string[],
  ids: readonly string[],
): BlockTable {
  const f = chunk.fields;
  const cnt = f.cnt as Uint16Array;
  const sc = f.sc as Uint8Array;
  const ox = f.ox as Float32Array;
  const oy = f.oy as Float32Array;
  const dvx = f.vx as Int16Array;
  const dvy = f.vy as Int16Array;
  const z = f.z as Uint16Array;
  const a = f.a as Float32Array;
  const hood = f.hood as Uint8Array;
  const bidx = (f.bidx as Uint8Array | undefined) ?? new Uint8Array(0);
  const n = cnt.length;

  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const nv = off[n];
  const rx = new Float32Array(nv);
  const ry = new Float32Array(nv);
  const inx = new Float32Array(nv);
  const iny = new Float32Array(nv);
  const maxInset = new Float32Array(n);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = off[i];
    const m = cnt[i];
    /* THE QUANTUM IS `(1 << sc) / 10`, and it MULTIPLIES.
       part3.html §84. `sc` is a per-block power-of-two exponent and the deltas
       are in tenths of that unit, so a vertex is `ox + vx * 2^sc / 10`. Read
       as `1 / (1 << sc)` — which is what "a power-of-two quantiser" sounds
       like — the rings come out hundreds of times too large and the frame
       fills with pale diagonal slabs the size of the whole bay. Measured, on
       the third screenshot of this file. */
    const q = (1 << sc[i]) / 10;
    let mnx = 1e18, mny = 1e18, mxx = -1e18, mxy = -1e18;
    let sxAcc = 0, syAcc = 0;
    for (let k = 0; k < m; k++) {
      const x = ox[i] + dvx[o + k] * q;
      const y = oy[i] + dvy[o + k] * q;
      rx[o + k] = x;
      ry[o + k] = y;
      sxAcc += x;
      syAcc += y;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (y < mny) mny = y;
      if (y > mxy) mxy = y;
    }
    cx[i] = m ? sxAcc / m : ox[i];
    cy[i] = m ? syAcc / m : oy[i];

    /* The largest inset this ring can take without turning inside out.
       0.30 of the bounding box was the mock's first cut and it folded six
       blocks — every one a 100–230 m² sliver: a traffic island, a median
       strip, a wedge left between two streets. Area over perimeter is the
       ring's own inradius, which is the quantity that actually bounds an
       offset, and it holds for all 5,404. */
    let per = 0;
    let ar = 0;
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      per += Math.hypot(rx[o + k1] - rx[o + k], ry[o + k1] - ry[o + k]);
      ar += rx[o + k] * ry[o + k1] - rx[o + k1] * ry[o + k];
    }
    ar = Math.abs(ar) / 2;
    maxInset[i] = Math.max(
      0.05,
      Math.min(0.3 * Math.min(mxx - mnx, mxy - mny), (0.75 * ar) / (per || 1)),
    );

    /* Per-vertex INWARD offset, one unit of inset. On a rectangle that is a
       constant; on the Presidio's 388-vertex boundary it is not, so it is the
       angle bisector of the two adjacent edges' inward normals, scaled by
       1/sin(half-angle) and clamped at 3× — past that a spike folds through
       itself. CCW ring → the inward normal of edge (ex,ey) is (−ey, ex). */
    for (let k = 0; k < m; k++) {
      const kp = (k + m - 1) % m;
      const k1 = (k + 1) % m;
      const e0x = rx[o + k] - rx[o + kp];
      const e0y = ry[o + k] - ry[o + kp];
      const e1x = rx[o + k1] - rx[o + k];
      const e1y = ry[o + k1] - ry[o + k];
      const l0 = Math.hypot(e0x, e0y) || 1;
      const l1 = Math.hypot(e1x, e1y) || 1;
      const n0x = -e0y / l0, n0y = e0x / l0;
      const n1x = -e1y / l1, n1y = e1x / l1;
      let bx = n0x + n1x;
      let by = n0y + n1y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-6) {
        inx[o + k] = n1x;
        iny[o + k] = n1y;
        continue;
      }
      bx /= bl;
      by /= bl;
      const sgn = Math.min(3, 1 / Math.max(0.33, bx * n0x + by * n0y));
      inx[o + k] = bx * sgn;
      iny[o + k] = by * sgn;
    }
  }
  return {
    n, off, rx, ry, inx, iny, maxInset, cx, cy, z, area: a, hood, hoodNames, ids,
    /* A chunk written before P1 shipped `bidx` has none, and the tone falls
       back to the published height band for every block rather than throwing.
       Nothing here fills the gap with a value. */
    bidx: bidx.length === n ? bidx : new Uint8Array(n).fill(BIDX_NONE),
  };
}

// ═══ the scene ═════════════════════════════════════════════════════════════

/**
 * ABLATION SWITCHES, in the spirit of `terrain.ts`'s own `LOOK`: "kept because
 * every one of them names a decision somebody argued for, and turning one off
 * is how the next person tells whether it is still earning its place."
 *
 * Driven from `?layers=` on the route, so a screenshot can isolate one pass.
 * Every one defaults ON and nothing reads them but `paint`.
 */
export interface SceneLayers {
  surround: boolean;
  terrain: boolean;
  water: boolean;
  shore: boolean;
  parks: boolean;
  streets: boolean;
  veg: boolean;
  massing: boolean;
  buildings: boolean;
  /** the eleven authored heroes, drawn inside the footprint stream */
  heroes: boolean;
  bridge: boolean;
  labels: boolean;
}

export const ALL_LAYERS: SceneLayers = {
  surround: true, terrain: true, water: true, shore: true, parks: true,
  streets: true, veg: true, massing: true, buildings: true, heroes: true,
  bridge: true, labels: true,
};

/** `?layers=-water,-veg` turns two off; `?layers=terrain` turns everything
 *  else off. Unknown names are ignored rather than silently changing a layer. */
export function parseLayers(spec: string | null): SceneLayers {
  if (!spec) return { ...ALL_LAYERS };
  const names = spec.split(",").map((s) => s.trim()).filter(Boolean);
  const subtractive = names.every((n) => n.startsWith("-"));
  const out: SceneLayers = subtractive
    ? { ...ALL_LAYERS }
    : (Object.fromEntries(
        Object.keys(ALL_LAYERS).map((k) => [k, false]),
      ) as unknown as SceneLayers);
  for (const n of names) {
    const off = n.startsWith("-");
    const k = (off ? n.slice(1) : n) as keyof SceneLayers;
    if (k in out) out[k] = !off;
  }
  return out;
}

export interface SceneStats {
  cells: number;
  massed: number;
  buildings: number;
  streets: number;
  trees: number;
  labels: number;
  /** the LOD ladder's own weight this frame */
  wB: number;
}

const emptyStats = (): SceneStats => ({
  cells: 0, massed: 0, buildings: 0, streets: 0, trees: 0, labels: 0, wB: 0,
});

/** one frame's heroes, in the order their own depth buckets flush */
interface HeroQueue {
  readonly n: number;
  readonly flushD: Float64Array;
  readonly items: readonly { hero: HeroData; zg: number }[];
  /** the shipped building indices, so the prism is not drawn inside the hero */
  readonly gids: ReadonlySet<number>;
  readonly mat: readonly (readonly string[])[];
  readonly mats: HeroMaterials;
}

interface BandCache {
  terrain: TerrainField;
  surround: SurroundGrid | null;
  /** the key those two were built for */
  key: string;
}

export class CityScene {
  readonly data: CityData;
  readonly proj: Projection;

  private bands = new Map<number, BandCache>();
  private blocks: BlockTable | null = null;
  private massing: Massing | null = null;
  private urnd: Float32Array | null = null;
  private veg: TreeGrid | null = null;
  private surroundCoast: SurroundCoast | null = null;
  private coastAsked = false;
  private solo: BldTable | null = null;
  private soloFace: Chunk | null = null;
  private bldCache = new Map<string, BldTable>();
  private coast: Ring[] = [];
  private burn: Ring[] = [];
  private parks: ParkRing[] = [];
  private waterBodies: ParkRing[] = [];
  private surroundData: SurroundData | null = null;
  private landmarkTable: LandmarkTable | null = null;
  private form: FormTable | null = null;
  private places: PlaceLabel[] = [];
  private sprite: SpriteSheet | null = null;
  private tone: ToneContext | null = null;
  /** `manifest.buildings.paintFlagBits.nosample` — see PAINT_NOSAMPLE_DEFAULT */
  private paintNoSample = PAINT_NOSAMPLE_DEFAULT;
  private depthPlate: HTMLCanvasElement | OffscreenCanvas | null = null;
  /** `meta.mul` once the refined `water1` tiles are in the plate */
  private depthTexels: number | null = null;
  private shoalPlate: HTMLCanvasElement | null = null;
  private blockOrder: Int32Array = new Int32Array(0);
  private massRowYear = -1;
  private massRow: ReturnType<typeof massAt> | null = null;
  private labelGrid: LabelGrid | null = null;
  private hoodAnchors: HoodAnchor[] | null = null;
  /** the city's depth range, computed once — `hazeIdx` */
  private depthRange: [number, number] | null = null;
  private roofLut: ColourTables | null = null;
  private roofLutKey = "";
  /**
   * `roofF` AGAIN, FOUR VALUE STEPS WIDE — `part3.html`'s `CL_ROOFN`.
   * Rebuilt only when `roofLut` is, which is keyed on a fade quantised to a
   * 64th, so a zoom is a cache hit on all but a few frames.
   */
  private roofNF: string[] | null = null;
  /**
   * THE ROOF COVERING TIMELINE, RESOLVED FOR THE YEAR ON THE RAIL.
   * `palette.ts` §THE ROOF COVERING TIMELINE has the rule and the refusals.
   * 7 x 256 bytes, rebuilt only when the displayed year changes.
   */
  private eraRoof: Uint8Array | null = null;
  private eraRoofYear = Number.NaN;
  private blockRoof: Uint8Array | null = null;
  private blockWall: Uint8Array | null = null;
  private aoCv: OffscreenCanvas | null = null;
  private heroMats: HeroMaterials | null = null;
  /** the hit test's uniform grid over the block rings — geometry only, so it
   *  outlives a band drop */
  private blockHash: BlockHash | null = null;
  /** each block's built top in the march's units, keyed on band + year */
  private blockSolidCache: { key: string; top: Float32Array; max: number } | null =
    null;
  /** the same, for the footprints the block and street stops actually draw */
  private footHash: FootHash | null = null;

  constructor(data: CityData, proj: Projection) {
    this.data = data;
    this.proj = proj;
  }

  /**
   * Can anything be painted yet?
   *
   * The ground, and nothing more. This is deliberately the LOWEST bar in the
   * file: the base tier arrives as twelve separate chunks and the map is
   * supposed to be usable before all twelve have landed. A chunk that is not
   * here yet reads as *less city*, never as a blank frame.
   */
  get ready(): boolean {
    return this.data.has("base/terrain");
  }

  /**
   * A COUNTER THE RENDERER'S CONTENT KEY CAN SEE.
   *
   * Dropping the band caches is not enough on its own: a settled camera is
   * shown through a pre-painted buffer, and `contentKey` is what decides
   * whether that buffer still stands for what the scene would draw. The key
   * carried the step, the year, the data version and the dissolve weight — and
   * nothing at all for *the scene rebuilt its own caches*. So the coast clip
   * landed, the bands were dropped, and the frame on screen went on being the
   * one painted before it, for as long as the reader did not touch anything.
   */
  sceneVersion = 0;

  /** the DEM-derived caches depend on chunks that arrive later; drop them */
  invalidateBands(): void {
    this.bands.clear();
    this.depthPlate = null;
    this.shoalPlate = null;
    this.sceneVersion++;
  }

  get blockTable(): BlockTable | null {
    return this.blocks;
  }

  get landmarks(): LandmarkTable | null {
    return this.landmarkTable;
  }

  /**
   * Build every table that can be built from what is currently held. Cheap and
   * idempotent: called after every chunk lands, and does nothing for a table it
   * has already built.
   */
  build(): void {
    const d = this.data;
    const m = d.manifest;

    /* THE SECOND SOLID AND THE THIRD. Sync and cheap — `base/form` is 7 KB of
       base tier and carries no prose — so it is resolved here rather than
       awaited like the landmark table. Null until the chunk lands, and null
       means every building draws the one prism it drew before, which is what
       stood there. */
    if (!this.form) this.form = d.form();

    /* THE COAST CLIP FETCHES ITSELF, ONCE, THE FIRST TIME THE SURROUND IS
       HELD. It is a sidecar and not a chunk, so `loadBase` does not know about
       it; and it is not on the first-paint path, because a surround with no
       clip is what this map has always drawn. Kicked off from here rather than
       from the shell so the route does not have to know either. */
    if (!this.coastAsked && d.has("base/surround")) {
      this.coastAsked = true;
      void this.loadCoastClip().catch(() => {
        /* a missing sidecar reads as the cell staircase, which is what was
           there before it existed — never as a broken frame */
      });
    }

    if (!this.tone) {
      /* the flag's own key, published beside it. A manifest that predates the
         key keeps the transcribed default rather than dropping the column. */
      const fb = (m.buildings as { paintFlagBits?: { nosample?: number } })
        .paintFlagBits;
      if (typeof fb?.nosample === "number") this.paintNoSample = fb.nosample;
      const p = m.proj as unknown as TerrainProj;
      const dt = p.downtown;
      const fe = p.ferry;
      const ka = p.castro;
      let mvx = ka[0] - fe[0];
      let mvy = ka[1] - fe[1];
      const L = Math.hypot(mvx, mvy) || 1;
      mvx /= L;
      mvy /= L;
      // the same xorshift the mock seeds with the 1906 date, so the tie-break
      // inside a family is reproducible rather than random
      const rnd = buildURND(1 << 18);
      /* `maxR` IS PUBLISHED AND WAS TYPED IN. `assignBldTones()` normalises
         each footprint's distance from downtown by the LARGEST such distance
         in the city, and a client holding a few chunks cannot compute that —
         so the encoder measures it over all 166,166 published centroids and
         ships it. The port had 12000, which is 0.09 % out and appears nowhere
         in the source; the measured figure is 11,988.916 m. */
      const mr = (m.buildings as { maxR?: number }).maxR;
      /* THE PUBLISHED HEIGHT QUARTILES, PER BAND — `manifest.buildings.hq`,
         twelve numbers derived from the same `hgt_mediancm` column the bands
         are cut from. A manifest without them yields an empty table and
         `roofStep` then returns 0 for every building, which is exactly the
         single-flat-tone this port had before. */
      const hq = ((m.buildings as { hq?: number[][] }).hq ?? []) as unknown as Quartiles;
      this.tone = {
        dtx: dt[0], dty: dt[1], fx: fe[0], fy: fe[1], mvx, mvy,
        maxR: typeof mr === "number" && mr > 0 ? mr : 12000,
        hq,
        rnd: (i) => rnd[i & ((1 << 18) - 1)],
      };
    }

    const blocksChunk = d.get("base/blocks");
    if (!this.blocks && blocksChunk) {
      const entry = m.chunks.find((c) => c.k === "base/blocks");
      const hoods = ((entry?.hoodNames ?? []) as string[]) ?? [];
      this.blocks = decodeBlocks(blocksChunk, hoods, []);
      const order = new Int32Array(this.blocks.n);
      for (let i = 0; i < order.length; i++) order[i] = i;
      const bl = this.blocks;
      const dep = (i: number): number => this.proj.depth(bl.cx[i], bl.cy[i]);
      this.blockOrder = Int32Array.from(
        Array.from(order).sort((a, b) => dep(a) - dep(b)),
      );
    }

    const massChunk = d.get("base/massing");
    if (!this.massing && massChunk) {
      const entry = m.chunks.find((c) => c.k === "base/massing");
      const year0 = (entry?.year0 as number) ?? 1849;
      this.massing = massingOf(massChunk, year0);
      this.urnd = buildURND((m.buildings as { n: number }).n);
    }

    const soloChunk = d.get("base/solo");
    if (!this.solo && soloChunk && this.tone) {
      this.solo = decodeBld(soloChunk, 1849, this.tone, this.paintNoSample);
    }
    if (!this.soloFace) this.soloFace = d.get("base/solo-face") ?? null;

    const coastChunk = d.get("base/coast");
    if (!this.coast.length && coastChunk) {
      const c = decodeCoast(coastChunk);
      this.coast = c.coast;
      this.burn = c.burn;
    }

    const parksChunk = d.get("base/parks");
    if (!this.parks.length && parksChunk) {
      const p = decodeParks(parksChunk);
      this.parks = p.parks;
      this.waterBodies = p.water;
    }

    if (!this.surroundData) this.surroundData = d.surround();

    if (!this.sprite && typeof document !== "undefined") {
      this.sprite = buildSpriteSheet((w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      });
    }
  }

  /**
   * Build the terrain field and the surround grid for ALL THREE bands, once,
   * off the critical path.
   *
   * A band cache costs a `TerrainField` (67,600 nodes of Lambert and
   * self-shadow), `buildSurroundLam` (116,480 cells) and a 56,330-element
   * depth sort. Built lazily, the FIRST frame of a zoom that crosses a band
   * pays all of it — and a zoom crosses two of them. MEASURED before this
   * existed: a wheel zoom from whole city to the ceiling ran at **9.8 rAF/s**,
   * against 112 at block zoom where every band was already warm.
   *
   * There are exactly three (`ZEX_BY_STEP` is three long), so this is bounded.
   */
  warmBands(): void {
    for (let step = 0; step < 3; step++) this.bandFor(step);
  }

  /** the landmark table needs a fetch of its own for the prose beside it */
  async loadLandmarks(): Promise<void> {
    if (this.landmarkTable) return;
    this.landmarkTable = await this.data.landmarks();
  }

  /**
   * The surround's own coastline — the ring the whole surround pass is cut at.
   *
   * Fetched beside the landmarks and NOT awaited by the first paint: with no
   * coast the surround draws exactly what it drew before, its own 110 x 139 m
   * cell staircase, and the clip arrives as a correction rather than as a
   * blank frame. The band caches hold the order the reach cells go in, so this
   * drops them.
   */
  async loadCoastClip(): Promise<void> {
    if (this.surroundCoast) return;
    this.surroundCoast = await this.data.surroundCoast();
    if (this.surroundCoast) this.invalidateBands();
  }

  /** the place names, from `base/marks.json` */
  setPlaces(p: PlaceLabel[]): void {
    this.places = p;
    // the film's shortened list is derived from this one
    this.filmPlaces = null;
    this.filmPlacesFor = -1;
  }

  /** The DEM walk `fitCity` needs. Every third node inside the coast mask. */
  extent(): CityExtent | null {
    const band = this.bandFor(0);
    if (!band) return null;
    const t = band.terrain;
    const maxBuilt = 260; // metres — the tallest published derived top
    return {
      maxBuiltHeightM: maxBuilt,
      forEachGroundSample(visit) {
        const N = t.N;
        for (let i = 0; i < N; i += 3)
          for (let j = 0; j < N; j += 3) {
            if (!t.maskAt(i, j)) continue;
            const x = t.proj.X0 + i * t.cellM;
            const y = t.proj.Y0 + j * t.cellM;
            visit(x, y, t.elevAt(i, j));
          }
      },
    };
  }

  /** The terrain field and the surround grid for one LOD band, built once. */
  private bandFor(step: number): BandCache | null {
    const held = this.bands.get(step);
    const key = `${this.proj.rotDeg}|${this.proj.sA}`;
    if (held && held.key === key) return held;
    const chunk = this.data.get("base/terrain");
    if (!chunk) return null;
    const p = this.data.manifest.proj as unknown as TerrainProj;
    /* ONE LADDER, NOT TWO. This was a literal `[3.3, 2.6, 2.0]` sitting beside
       `projection.ts`'s `ZEX_BY_STEP`, and the two were free to disagree — which
       is the shape of the bug that was actually shipped: the ground was built
       from this copy while `proj.zex` never left 3.3, so the city was drawn at
       an exaggeration its own ground was not. `renderer.ts` now puts the band on
       the projection every frame; this reads the same table it does. */
    const zex = ZEX_BY_STEP[step] ?? ZEX_BY_STEP[0];
    const t = new TerrainField(chunk, p, { zex });
    /* the city's own ground stops at the published land, not at the county
       line — see `TerrainField.coastFix`. Null until the sidecar lands, and
       the band caches are dropped when it does. */
    t.coastFix = this.surroundCoast?.cityOffshoreBits ?? null;

    // the ground tint is a measurement, and it is on the first-paint path
    const tint = this.data.get("base/canopy-tint");
    if (tint) t.canopyFrac = tint.fields.demFrac as Uint8Array;

    // park fraction and the burn flag, per DEM cell
    if (this.parks.length) markCells(t, this.parks, t.cellPark);
    if (this.burn.length) markCells(t, this.burn, t.cellBurn);

    let sg: SurroundGrid | null = null;
    const s = this.surroundData;
    if (s) {
      // §11: `lam` is terrain.ts's and `order` is the projection's, so the
      // composition is the caller's and it is four lines.
      const lam = buildSurroundLam(s.XW, s.XH, s.z, s.cellW, s.cellH, zex);
      /* THE REACH CELLS GO IN THE ORDER, NOT INTO A SECOND PASS. They are
         water cells by the hydrography's own bit and they are painted only
         because the clip guarantees that all they can cover is published land
         a neighbouring cell could not reach. Without a coast to clip at they
         are not added at all — see `surroundOrder`. */
      const cc = this.surroundCoast;
      const order = s.surroundOrder(
        (x, y) => this.proj.depth(x, y),
        cc ? (i, j) => cc.reach(i, j) : null,
      );
      sg = { ...s, lam, order };
    }
    const cache: BandCache = { terrain: t, surround: sg, key };
    this.bands.set(step, cache);
    return cache;
  }

  /** the `bldg` table for a held chunk, decoded once */
  /**
   * THE GROUND, for anything outside this file that needs to stand on it.
   *
   * Band 0's `TerrainField`, which is the one the camera's own fit is measured
   * against. The film asks for it once per keyframe and once per street vertex,
   * never in a frame loop.
   */
  elevAt(x: number, y: number): number {
    const b = this.bandFor(0);
    return b ? b.terrain.elevM(x, y) : 0;
  }

  /**
   * ONE PUBLISHED FOOTPRINT, BY ITS GLOBAL INDEX.
   *
   * The film raises exactly two of these and both indices are published joins
   * made elsewhere: City Hall's out of the landmark register's own parcel, the
   * 1917 Main Library's out of the 1914 Journal's corner description resolved to
   * APN 0353001. Neither is computed here.
   *
   * Returns null while the cell holding it has not arrived, which is what
   * progressive loading looks like — the film's `hide` then does nothing either,
   * so the fabric simply draws what it has and nothing is claimed twice.
   */
  footprintOf(gid: number): {
    vx: Float32Array; vy: Float32Array; n: number; h: number; cx: number; cy: number;
  } | null {
    const tables: BldTable[] = [];
    if (this.solo) tables.push(this.solo);
    for (const t of this.bldCache.values()) tables.push(t);
    for (const tb of tables) {
      for (let i = 0; i < tb.n; i++) {
        if (tb.gid[i] !== gid) continue;
        const o = tb.off[i];
        const n = tb.off[i + 1] - o;
        return {
          vx: tb.vxw.subarray(o, o + n),
          vy: tb.vyw.subarray(o, o + n),
          n,
          h: roofHeight(tb.h[i], tb.hf[i]),
          cx: tb.cx[i],
          cy: tb.cy[i],
        };
      }
    }
    return null;
  }

  /**
   * THE CITY'S OWN DEPTH RANGE, off the published assessor blocks.
   *
   * `part3.html` takes it over all 166,166 building centroids inside
   * `buildBldOrder()`; this client holds only the chunks the camera has asked
   * for, so it is taken over `base/blocks` — 5,404 centroids, always loaded,
   * covering the same built extent. Computed once: the bearing is fixed at
   * 315° and `depth()` is linear in world x and y, so nothing about the camera
   * moves it.
   */
  private cityDepthRange(): [number, number] {
    if (this.depthRange) return this.depthRange;
    const bl = this.blocks;
    if (!bl || bl.n === 0) return [0, 1];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < bl.n; i++) {
      const d = this.proj.depth(bl.cx[i], bl.cy[i]);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    this.depthRange = [lo, hi];
    return this.depthRange;
  }

  private bldFor(chunk: Chunk): BldTable | null {
    const hit = this.bldCache.get(chunk.key);
    if (hit) return hit;
    if (!this.tone) return null;
    const t = decodeBld(chunk, 1849, this.tone, this.paintNoSample);
    if (this.bldCache.size > 200) this.bldCache.clear();
    this.bldCache.set(chunk.key, t);
    return t;
  }

  /**
   * THE HIT TEST. Which assessor block is under this canvas pixel?
   *
   * The pixel is a line in z (`projection.ts` §THE PIXEL IS A LINE), so this
   * marches z downward from above the drawn surface and takes the first
   * crossing — `HIT_STEP_M`'s own rule, at `marchStepZ()`, so the step is a
   * WORLD distance and stays one at every tilt and every band.
   *
   * ── THE MARCH USED TO BE AGAINST THE TERRAIN ONLY, AND THAT IS THE BUG ──
   * BUGS.md §1. **The city is not the terrain.** A block stands on the ground
   * as a solid, and a reader who clicks a roof is clicking a surface that is
   * `h · ZEXB` up the screen from the ground under it. Marched against the
   * DEM alone, the pixel resolved to the ground *behind* the building — at
   * band 2 the line runs 3.37 world metres per unit z and a metre of built
   * height is 0.8 of a unit, so a 15 m storefront threw the answer **40 m
   * up-street**, and a block is ~100 m with a ~25 m street beside it. Measured
   * over every 8th pixel of the stage, 14,432 samples a camera, only 38.0 % of
   * the street frame answered at all; the live islands in
   * `out-b5/b5-pickmap-street.png` are block-shaped and slid down-left off the
   * blocks they belong to, which is that displacement drawn.
   *
   * So the march now crosses the SOLID first and the ground second, in that
   * order, because the solid stands above the ground and therefore crosses
   * first along a line walked from the camera outward. The solid it crosses is
   * the massing tier's own prism — the block's published ring, extruded to
   * `massRow.hgt[b]` over the elevation at its centroid, which is exactly what
   * `drawMassing` paints and, at the footprint zooms, the mean of what
   * `paintFootprints` paints on top of it. Nothing is invented: both terms are
   * published columns and the third is `ZEXB`, which the projection already
   * states to the reader.
   *
   * The blocks are behind a uniform-grid hash (`blockHash`) so the added test
   * is a bucket lookup per step rather than 5,404 bbox rejections; the whole
   * 14,432-sample sweep costs about the same as it did before.
   */
  pick(px: number, py: number, cam: ViewCamera, W: number, H: number): number {
    const step = bandOf(zOf(cam));
    const band = this.bandFor(step);
    const bl = this.blocks;
    if (!band || !bl) return -1;
    const t = band.terrain;
    const plane = screenToPlane(px, py, W, H, cam);
    const dz = this.proj.marchStepZ();
    const hx = this.blockHashOf(bl);
    const solid = this.blockSolid(bl, t, step);
    const foot = this.footSolid(bl, t, step, this.viewQuad(cam, W, H));
    let hitX = 0;
    let hitY = 0;
    let found = false;
    const top = Math.max(solid.max, foot ? foot.max : -Infinity);
    const z0 = Math.max(320, Math.ceil(top + dz));
    for (let z = z0; z >= -20; z -= dz) {
      const w = this.proj.invAt(plane[0], plane[1], z);
      const wx = w[0];
      const wy = w[1];
      if (foot && z <= foot.max) {
        const b = footUnder(foot, wx, wy, z);
        /* −2 is "a footprint stands here and the assessor puts it on NO block".
           It occludes. Measured both ways over 14,432 samples: letting the ray
           pass through such a footprint buys 1.8 points at the street stop
           (47.0 → 48.8 %) and buys them by answering with a block that is
           somewhere else — the ray travels ~1.1 km of world distance across
           the march, so what it finds behind an off-block building is up to a
           kilometre up-street from the pointer. That is BUGS §1's second
           complaint, the pin and the record disagreeing, re-introduced to
           flatter the first. 92 % of `base/solo` is off-block by construction
           (13,813 of 15,261 measured, median 49.8 m from the nearest ring),
           and for those the true answer is that there is no assessor block. */
        if (b === -2) return -1;
        if (b >= 0) return b;
      }
      if (z <= solid.max) {
        const b = this.blockUnder(hx, bl, wx, wy, solid.top, z);
        if (b >= 0) return b;
      }
      if (t.elevM(wx, wy) >= z) {
        hitX = wx;
        hitY = wy;
        found = true;
        break;
      }
    }
    if (!found) return -1;
    const b = this.blockUnder(hx, bl, hitX, hitY, null, 0);
    if (b >= 0) return b;
    /* ── THE RIGHT OF WAY, AND THE ONE SNAP THIS FILE ALLOWS ───────────
       BUGS §1's second candidate. The assessor's rings do not tile the city:
       they stop at the property line, and between them is the right of way —
       measured, the published rings are 93.0 km2 against San Francisco's
       121.5 km2 of land, and at the street stop only 38 % of the visible
       GROUND is inside one. A reader who clicks the roadway has clicked
       something the block table has no polygon for, and answering nothing is
       not what they meant: the panel's own second line is *"another 378
       decisions run along the streets this block fronts"*, so the block a
       street fronts is a meaningful answer to a click on that street.
       The snap is bounded twice, and both bounds matter:
         · `PICK_SNAP_PX` in SCREEN pixels, so it is a pointer tolerance and
           never grows when the reader zooms out;
         · `PICK_SNAP_M` in WORLD metres — half of San Francisco's standard
           68.6 ft right of way — so at the whole-city stop, where one pixel is
           tens of metres, it collapses to nothing rather than dragging the
           bay onto the nearest block.
       Nothing is invented: the answer is a published ring, the distance to it
       is measured, and outside the bound the pick still returns −1. */
    const kx = Math.max(1e-9, cam.scale * PLANE_PER_M);
    const tol = Math.min(PICK_SNAP_M, PICK_SNAP_PX / kx);
    return this.nearestRing(hx, bl, hitX, hitY, tol);
  }

  /** the block whose ring edge is nearest this world point, within `tol` metres */
  private nearestRing(
    hx: BlockHash,
    bl: BlockTable,
    x: number,
    y: number,
    tol: number,
  ): number {
    if (!(tol > 0)) return -1;
    const i0 = Math.floor((x - tol - hx.x0) / hx.cell);
    const i1 = Math.floor((x + tol - hx.x0) / hx.cell);
    const j0 = Math.floor((y - tol - hx.y0) / hx.cell);
    const j1 = Math.floor((y + tol - hx.y0) / hx.cell);
    let best = tol * tol;
    let bi = -1;
    const seen = new Set<number>();
    for (let j = j0; j <= j1; j++) {
      if (j < 0 || j >= hx.ny) continue;
      for (let ii = i0; ii <= i1; ii++) {
        if (ii < 0 || ii >= hx.nx) continue;
        const c = j * hx.nx + ii;
        for (let k = hx.start[c]; k < hx.start[c + 1]; k++) {
          const i = hx.items[k];
          if (seen.has(i)) continue;
          seen.add(i);
          if (
            x < hx.bx0[i] - tol || x > hx.bx1[i] + tol ||
            y < hx.by0[i] - tol || y > hx.by1[i] + tol
          ) continue;
          const o = bl.off[i];
          const m = bl.off[i + 1] - o;
          if (m < 3) continue;
          for (let a = 0, b = m - 1; a < m; b = a++) {
            const d = segDist2(
              x, y,
              bl.rx[o + b], bl.ry[o + b],
              bl.rx[o + a], bl.ry[o + a],
            );
            if (d < best) {
              best = d;
              bi = i;
            }
          }
        }
      }
    }
    return bi;
  }

  /**
   * THE FOOTPRINTS, AS SOLIDS THE HIT TEST CAN MARCH.
   *
   * The block prism above is exactly what `drawMassing` paints, and at the
   * whole-city and district stops that IS the drawn city. At the block and
   * street stops it is not: `paintFootprints` draws one prism per published
   * footprint over it, and those are the surfaces the reader's pointer is on.
   * They are also much taller than the block plate under them — **the block's
   * `th` is an area-weighted mean over its NON-solo members, and everything
   * 20 m or over at its derived top is a solo, so the largest `th` in the
   * whole city is 19 m and the mean is 7.4** (measured, all 5,404 blocks,
   * 2025). Marching the plate alone therefore corrects a 15 m storefront by
   * 7 m and leaves two thirds of the displacement standing, which is what the
   * first cut of this fix measured: 38.0 % → 47.4 % at the street stop, with
   * whole blocks still answering nothing.
   *
   * So this builds the same tables `paintFootprints` draws from — `base/solo`
   * plus whatever `bldg` chunks the view yields — and files every footprint
   * under its own bbox with:
   *
   *   · `topZ`, the roof in the march's units: `elevM(cx, cy) + roofHeight(h,
   *     hf) · ZEXB / ZEX`, which is `projb`'s own arithmetic;
   *   · `blk`, the block whose published ring contains the footprint's
   *     CENTROID — containment and nothing else, the same rule `build_lod.py`
   *     joins by, so a pier or a Presidio barracks is not filed onto whichever
   *     block happens to be nearest. Those come back −1 and are kept in the
   *     march as OCCLUDERS: a click on one answers "nothing there", which is
   *     true, rather than the block behind it, which is not.
   *
   * No vertex is copied — the ring test reads the decoded table in place.
   *
   * ONE HONEST APPROXIMATION, STATED: the year gate is not applied. The march
   * crosses every footprint in the tables, including buildings the roll dates
   * after the year on the rail. What it returns is a BLOCK, and the assessor's
   * block ring is published for every year on the rail, so the answer is not
   * wrong — it is only reachable through a solid that is not painted yet. The
   * alternative is to thread the year through `pick()`, which is `CityMap`'s
   * signature and not mine to change.
   */
  private footSolid(
    bl: BlockTable,
    t: TerrainField,
    step: number,
    view: CityView,
  ): FootHash | null {
    const tables: BldTable[] = [];
    const keys: string[] = [];
    if (this.solo) {
      tables.push(this.solo);
      keys.push("base/solo");
    }
    if (view.z >= LOD_Z0) {
      for (const c of this.data.visible("bldg", view)) {
        if (c.key === "base/solo") continue;
        const b = this.bldFor(c);
        if (b) {
          tables.push(b);
          keys.push(c.key);
        }
      }
    }
    if (!tables.length) return null;
    const key = `${step}|${this.sceneVersion}|${keys.join(",")}`;
    const hit = this.footHash;
    if (hit && hit.key === key) return hit;

    const kh = this.proj.zexb / Math.max(1e-6, this.proj.zex);
    const hx = this.blockHashOf(bl);
    let cap = 0;
    for (const tb of tables) cap += tb.n;
    const tbl = new Int32Array(cap);
    const idx = new Int32Array(cap);
    const bx0 = new Float32Array(cap);
    const by0 = new Float32Array(cap);
    const bx1 = new Float32Array(cap);
    const by1 = new Float32Array(cap);
    const topZ = new Float32Array(cap);
    const blk = new Int32Array(cap);
    let n = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let max = -Infinity;
    for (let ti = 0; ti < tables.length; ti++) {
      const tb = tables[ti];
      for (let i = 0; i < tb.n; i++) {
        const o = tb.off[i];
        const m = tb.off[i + 1] - o;
        if (m < 3) continue;
        let ax = Infinity;
        let ay = Infinity;
        let bxx = -Infinity;
        let byy = -Infinity;
        for (let k = 0; k < m; k++) {
          const x = tb.vxw[o + k];
          const y = tb.vyw[o + k];
          if (x < ax) ax = x;
          if (x > bxx) bxx = x;
          if (y < ay) ay = y;
          if (y > byy) byy = y;
        }
        const zt =
          t.elevM(tb.cx[i], tb.cy[i]) + roofHeight(tb.h[i], tb.hf[i]) * kh;
        tbl[n] = ti;
        idx[n] = i;
        bx0[n] = ax;
        by0[n] = ay;
        bx1[n] = bxx;
        by1[n] = byy;
        topZ[n] = zt;
        blk[n] = this.blockUnder(hx, bl, tb.cx[i], tb.cy[i], null, 0);
        if (ax < x0) x0 = ax;
        if (ay < y0) y0 = ay;
        if (bxx > x1) x1 = bxx;
        if (byy > y1) y1 = byy;
        if (zt > max) max = zt;
        n++;
      }
    }
    if (!n || !(x1 > x0) || !(y1 > y0)) return null;

    const cell = FOOT_CELL_M;
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1);
    const ny = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
    const cellOf = (v: number, lo: number, nn: number): number =>
      Math.max(0, Math.min(nn - 1, Math.floor((v - lo) / cell)));
    const start = new Uint32Array(nx * ny + 1);
    for (let i = 0; i < n; i++) {
      const i0 = cellOf(bx0[i], x0, nx);
      const i1 = cellOf(bx1[i], x0, nx);
      const j0 = cellOf(by0[i], y0, ny);
      const j1 = cellOf(by1[i], y0, ny);
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) start[j * nx + ii + 1]++;
    }
    for (let k = 0; k < nx * ny; k++) start[k + 1] += start[k];
    const items = new Int32Array(start[nx * ny]);
    const cur = Uint32Array.from(start.subarray(0, nx * ny));
    for (let i = 0; i < n; i++) {
      const i0 = cellOf(bx0[i], x0, nx);
      const i1 = cellOf(bx1[i], x0, nx);
      const j0 = cellOf(by0[i], y0, ny);
      const j1 = cellOf(by1[i], y0, ny);
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) items[cur[j * nx + ii]++] = i;
    }
    this.footHash = {
      key, cell, x0, y0, nx, ny, start, items,
      tables, tbl, idx, bx0, by0, bx1, by1, topZ, blk, max,
    };
    return this.footHash;
  }

  /**
   * THE BLOCK RINGS, IN A UNIFORM GRID.
   *
   * The hit test asks "which ring contains this world point?" once per march
   * step instead of once per click, so the linear sweep it used to do — 5,404
   * centroid rejections and then a `[number, number][]` allocated per
   * candidate — is no longer affordable. This is the standard CSR bucket
   * build: every block is filed under the cells its bounding box covers, and
   * its bbox is kept so the ring test is reached only by the few that can
   * possibly contain the point.
   *
   * `HIT_CELL_M` is 160 because the median assessor block is about 100 m and
   * the median ring has 4 vertices: at 160 m most blocks file into one or two
   * cells, and the Presidio — one ring, 6.1 km2, 388 vertices — files into a
   * few hundred, which is what its bbox is worth.
   */
  private blockHashOf(bl: BlockTable): BlockHash {
    if (this.blockHash) return this.blockHash;
    const n = bl.n;
    const bx0 = new Float32Array(n);
    const by0 = new Float32Array(n);
    const bx1 = new Float32Array(n);
    const by1 = new Float32Array(n);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = bl.off[i];
      const m = bl.off[i + 1] - o;
      let ax = Infinity;
      let ay = Infinity;
      let bxx = -Infinity;
      let byy = -Infinity;
      for (let k = 0; k < m; k++) {
        const x = bl.rx[o + k];
        const y = bl.ry[o + k];
        if (x < ax) ax = x;
        if (x > bxx) bxx = x;
        if (y < ay) ay = y;
        if (y > byy) byy = y;
      }
      if (m < 3) {
        ax = ay = 1;
        bxx = byy = -1; // empty box: never a candidate
      }
      bx0[i] = ax;
      by0[i] = ay;
      bx1[i] = bxx;
      by1[i] = byy;
      if (m >= 3) {
        if (ax < x0) x0 = ax;
        if (ay < y0) y0 = ay;
        if (bxx > x1) x1 = bxx;
        if (byy > y1) y1 = byy;
      }
    }
    if (!(x1 > x0) || !(y1 > y0)) {
      x0 = 0;
      y0 = 0;
      x1 = 1;
      y1 = 1;
    }
    const cell = HIT_CELL_M;
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1);
    const ny = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
    const cellOf = (v: number, lo: number, nn: number): number =>
      Math.max(0, Math.min(nn - 1, Math.floor((v - lo) / cell)));
    const counts = new Uint32Array(nx * ny + 1);
    for (let i = 0; i < n; i++) {
      if (!(bx1[i] >= bx0[i])) continue;
      const i0 = cellOf(bx0[i], x0, nx);
      const i1 = cellOf(bx1[i], x0, nx);
      const j0 = cellOf(by0[i], y0, ny);
      const j1 = cellOf(by1[i], y0, ny);
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) counts[j * nx + ii + 1]++;
    }
    for (let k = 0; k < nx * ny; k++) counts[k + 1] += counts[k];
    const items = new Int32Array(counts[nx * ny]);
    const cur = Uint32Array.from(counts.subarray(0, nx * ny));
    for (let i = 0; i < n; i++) {
      if (!(bx1[i] >= bx0[i])) continue;
      const i0 = cellOf(bx0[i], x0, nx);
      const i1 = cellOf(bx1[i], x0, nx);
      const j0 = cellOf(by0[i], y0, ny);
      const j1 = cellOf(by1[i], y0, ny);
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) items[cur[j * nx + ii]++] = i;
    }
    this.blockHash = {
      cell, x0, y0, nx, ny, start: counts, items, bx0, by0, bx1, by1,
    };
    return this.blockHash;
  }

  /**
   * The block whose ring contains this world point, or −1.
   *
   * With `top` supplied this is the SOLID test: the point must be inside the
   * ring *and* the ray's z must have descended to or below the block's built
   * top, so the answer is the first prism the line enters. With `top` null it
   * is the plain ground containment the old hit test ended on.
   */
  private blockUnder(
    hx: BlockHash,
    bl: BlockTable,
    x: number,
    y: number,
    top: Float32Array | null,
    z: number,
  ): number {
    const ii = Math.floor((x - hx.x0) / hx.cell);
    const jj = Math.floor((y - hx.y0) / hx.cell);
    if (ii < 0 || jj < 0 || ii >= hx.nx || jj >= hx.ny) return -1;
    const c = jj * hx.nx + ii;
    for (let k = hx.start[c]; k < hx.start[c + 1]; k++) {
      const i = hx.items[k];
      if (x < hx.bx0[i] || x > hx.bx1[i] || y < hx.by0[i] || y > hx.by1[i])
        continue;
      if (top && top[i] < z) continue;
      if (ringHit(bl, i, x, y)) return i;
    }
    return -1;
  }

  /**
   * EACH BLOCK'S BUILT TOP, IN THE MARCH'S OWN UNITS.
   *
   * `projb` puts ground elevation on `ZEX` and built height on `ZEXB` — two
   * different art dials, and the only function that carries both. `invAt`,
   * which the march inverts through, knows `ZEX` only. So a block's roof sits
   * at an EQUIVALENT z of `zg + h · ZEXB / ZEX`, and that ratio is a function
   * of the band (0.485 at the whole-city ZEX of 3.3, 0.8 at the block ZEX of
   * 2.0). Getting it wrong by using `h` directly would over-correct the very
   * displacement this is here to remove.
   *
   * The ground term is the elevation at the block's CENTROID, not at the
   * sampled point, because that is the `zg` `drawMassing` extrudes from — the
   * hit test and the paint have to agree about where the solid is.
   */
  private blockSolid(
    bl: BlockTable,
    t: TerrainField,
    step: number,
  ): { top: Float32Array; max: number } {
    const key = `${step}|${this.massRowYear}|${this.sceneVersion}`;
    const hit = this.blockSolidCache;
    if (hit && hit.key === key && hit.top.length === bl.n) return hit;
    const row = this.massRow;
    const kh = this.proj.zexb / Math.max(1e-6, this.proj.zex);
    const top = new Float32Array(bl.n);
    let max = -Infinity;
    for (let b = 0; b < bl.n; b++) {
      const zg = t.elevM(bl.cx[b], bl.cy[b]);
      const h = row ? row.hgt[b] : 0;
      const v = zg + h * kh;
      top[b] = v;
      if (v > max) max = v;
    }
    if (!(max > -Infinity)) max = 0;
    this.blockSolidCache = { key, top, max };
    return this.blockSolidCache;
  }

  /** the world point under a canvas pixel, at ground level — for the readout */
  groundAt(
    px: number, py: number, cam: ViewCamera, W: number, H: number,
  ): [number, number] | null {
    const band = this.bandFor(bandOf(zOf(cam)));
    if (!band) return null;
    const plane = screenToPlane(px, py, W, H, cam);
    const dz = this.proj.marchStepZ();
    for (let z = 320; z >= -20; z -= dz) {
      const w = this.proj.invAt(plane[0], plane[1], z);
      if (band.terrain.elevM(w[0], w[1]) >= z) return [w[0], w[1]];
    }
    return null;
  }

  /* ── THE RUNGS `view.z` IS COMPARED AGAINST, OUT OF THE MANIFEST ───────
     `data.ts` selects a tier with `if (view.z < c.minZ) continue`, and every
     `minZ` the encoder writes is a rung of the named ladder: 1.55, 2.9, 3.0,
     4.0. Read once; the manifest does not change under a mounted page. */
  private rungs: readonly number[] | null = null;

  private tierRungs(): readonly number[] {
    if (!this.rungs) {
      const seen = new Set<number>();
      for (const t of Object.values(this.data.manifest.tiers))
        if (t.minZ > 0) seen.add(t.minZ);
      this.rungs = [...seen].sort((a, b) => a - b);
    }
    return this.rungs;
  }

  /**
   * A VIEW AT A RUNG MUST BE ABLE TO SHOW THAT RUNG'S TIER.
   *
   * `z` is a QUOTIENT, `cam.scale / cam.base`, and a quotient of two doubles
   * does not have to reproduce the rung exactly even when the camera is
   * arithmetically on it. MEASURED, at the district preset with the parity
   * harness driving: `0.13533136705963567 / 0.046665988641253695` =
   * **2.899999999999999**, one ulp under 2.9 — so `view.z < 2.9` held, the
   * `strt` tier (`minZ` 2.9, 125 chunks, 22,191 rights of way) was never
   * requested and never yielded, and the street layer drew **nothing at all
   * six district cameras**. Not a missing feature and not a slow tier: a
   * strict comparison against a rung, decided in the sixteenth digit.
   *
   * So the number handed to the data layer is snapped when it is within a few
   * ulp of a rung. Eight ulp of 2.9 is 1.4e-14; no gesture, no wheel and no
   * preset can express a zoom that close to a rung and mean a different one,
   * and nothing further away is touched.
   *
   * ONLY THE SELECTOR IS SNAPPED. `paint()` reads its own `zOf(cam)` raw and
   * keeps it raw — every ramp the drawing hangs off (`tierW`, the canopy fade,
   * the street's own per-feature extent) is a continuous curve of the camera,
   * and `CAMERA.md` finding 5 is that a floor on a DRAWN quantity is a step in
   * the first derivative and the cause of every float and lurch bug this
   * project has had. Quantise the key, never the value. This is a key.
   */
  private tierZ(z: number): number {
    for (const r of this.tierRungs())
      if (Math.abs(z - r) <= r * 8 * Number.EPSILON) return r;
    return z;
  }

  /** the world-space view quad — the four inverse-projected screen corners */
  viewQuad(cam: ViewCamera, W: number, H: number): CityView {
    const z = this.tierZ(zOf(cam));
    const corners: [number, number][] = [];
    for (const [px, py] of [[0, 0], [W, 0], [W, H], [0, H]] as const) {
      const pl = screenToPlane(px, py, W, H, cam);
      const w = this.proj.invAt(pl[0], pl[1], 0);
      corners.push([w[0], w[1]]);
    }
    // the diamond is convex but the corner order above is screen order, which
    // survives the inverse because the map is affine
    return { z, quad: corners };
  }

  // ── the paint ────────────────────────────────────────────────────────────

  layers: SceneLayers = { ...ALL_LAYERS };

  /* ── WHAT THE FILM OWNS, AND ONLY WHILE IT IS RUNNING ─────────────────
     Two fields, both null/false in the explorer, so nothing below changes for
     a reader who never presses play.

     `filmHide` is the set of `gid`s the FABRIC must not draw because the film
     is raising them itself. `filmRunning` is whether the year is MOVING, which
     is the difference between "everything built by this year is simply there"
     and "this year's cohort is arriving now" — the fractional year drives the
     arrival wave only in the second case. */
  filmHide: ReadonlySet<number> | null = null;
  filmRunning = false;

  /* The accepted streets, painted UNDER the fabric and OVER the ground. That
     order is the record's own: the Board accepts a street, and the assessor
     dates the houses on it later. It is a pass and not a layer, so it goes here
     rather than into `SceneLayers` — nothing but the film ever sets it. */
  filmUnderlay: ((f: Frame) => void) | null = null;

  /**
   * THE 1906 BURNED DISTRICT, as published rings.
   *
   * `ff3a-iqhv`, seven rings, 130 vertices on the main one. The scene already
   * flags the DEM cells inside them, which is how the ground knows; the film
   * strokes the boundary itself, because in shot 1 the line is the only thing
   * that moves and it has to be painted at viewport size rather than into a
   * cached layer.
   */
  burnRings(): readonly Ring[] {
    return this.burn;
  }

  /**
   * ── THE FILM IS NOT A GAZETTEER ──────────────────────────────────────
   *
   * MEASURED on the mock's first frame at 1440x900: **thirty-one labels, of
   * which nineteen were street names**, competing with a red hairline that is
   * the entire subject of the shot. A street atlas is the right answer for an
   * explorer, where the reader is looking things up, and the wrong one for a
   * film, where they are being shown one thing.
   *
   * Some names have to stay, for a reason a screenshot settles: without them
   * the wide frame is an abstract shape, and one recognisable name beside
   * another is what makes it San Francisco. So the film keeps the LARGEST
   * places and caps them.
   *
   * WHICH ones is not a choice. The mock ordered neighbourhoods by how many
   * assessor blocks each holds; there is no neighbourhood label layer here, so
   * the order is each place's own published span — `marks/build_marks.py`'s
   * `s`, the extent of the footprint or registry polygon it resolves to. Both
   * are data-derived and give the same order every run. `labels.ts`'s ink
   * budget, collision grid and year gate all still apply on top; this only
   * shortens the list they are given.
   */
  filmPlaceCap: number | null = null;

  private filmPlaces: PlaceLabel[] | null = null;
  private filmPlacesFor = -1;

  private placesForFrame(): readonly PlaceLabel[] {
    const cap = this.filmPlaceCap;
    if (cap === null) return this.places;
    if (this.filmPlaces && this.filmPlacesFor === cap) return this.filmPlaces;
    this.filmPlaces = [...this.places]
      .sort((a, b) => b.spanM - a.spanM || a.name.localeCompare(b.name))
      .slice(0, cap);
    this.filmPlacesFor = cap;
    return this.filmPlaces;
  }

  paint(f: Frame, opts: { year?: number } = {}): SceneStats {
    const L = this.layers;
    const st = emptyStats();
    const cam = f.cam as ViewCamera & { step?: number };
    const z = zOf(cam);
    const step = typeof cam.step === "number" ? cam.step : bandOf(z);
    const band = this.bandFor(step);
    if (!band) return st;
    const t = band.terrain;
    const view = this.viewQuad(cam, f.W, f.H);

    /* 1 ── THE WATER GOES DOWN FIRST, AND THE LAND IS PAINTED OVER IT.
       This is `drawTerrain`'s own order in part3.html §5312: bay plate, depth
       plate, `drawContext` (the surround), then the city's DEM cells, and its
       comment says why — "every pixel of the plate that reaches the land is
       painted [over]". Both plates are grids laid under one affine and neither
       carries a land test of its own, so the ONLY thing that keeps the bay out
       of the Sunset is the land being painted after it. Drawing the water last
       — which is what "terrain → water" import order looks like if you read it
       as paint order — puts the Pacific over the whole peninsula. Measured, on
       the second screenshot of this file. */
    if (L.water) this.paintWaterBed(f, band);

    // 2 ── the surround, then the city's own ground, both over the plates
    if (L.surround) drawSurround(f, t, band.surround, this.surroundCoast?.rings ?? null);
    if (L.terrain) {
      const tr = drawTerrain(f, t, 0);
      st.cells = tr.cells;
    }

    /* 3 ── the published shoreline over whatever the raster did. THE SHOAL IS
       NO LONGER HERE: it is a wash and the depth plate under it is a
       measurement, so it goes between the bay and the depth in step 1, which
       is the reference's order. Blitting it at this point put it over the
       depth AND over the land. */
    if (L.shore && this.coast.length) drawShoreline(f, t, this.coast);

    // 3 ── the parks and the published water bodies
    if (L.parks && this.parks.length) drawParkRings(f, t, this.parks);
    if (L.parks && this.waterBodies.length) drawWaterBodies(f, t, this.waterBodies);

    // 4 ── the streets
    if (L.streets) st.streets = this.paintStreets(f, t, view, opts.year, step);

    // 4b ── the streets the Board voted, on the year it voted them
    if (this.filmUnderlay) this.filmUnderlay(f);

    // 5 ── the vegetation
    if (L.veg && z >= VZ_C0) st.trees = this.paintVeg(f, t, view, z);

    // 6 ── the buildings: the massing tier, then the footprints over it
    const wB = tierW(z);
    st.wB = wB;
    /* 5b ── THE AMBIENT OCCLUSION UNDER THE CITY. See `buildings.ts` §AO and
       DRAW.md §32: the whole of BUGS §23's district gap is this pass, which the
       reference has and this build did not. It goes HERE, before the buildings,
       because this renderer has one combined slot and the reference's
       `destination-over` needs a transparent city layer it has not got — the
       picture is the same, reached from the other side. */
    if (L.buildings && AO.on) this.paintAO(f, t, view, z, step, wB, opts.year);
    if (L.massing) st.massed = this.paintMassing(f, t, step, wB, opts.year);
    if (L.buildings) st.buildings = this.paintFootprints(f, t, view, z, step, wB, opts.year);

    // 7 ── the landmarks the record points the whole map at
    const lm = this.landmarkTable;
    /* THE TERRAIN GOES IN because the approach piers are gated on it: the
       published ring stops where San Francisco stops, and its southern end is
       over LAND — the DEM puts the ground at 29.4 m under the last vertex
       against a deck at 67.1 — so `drawBridge` draws a pier only where the
       page's own DEM says there is ground under the deck, and nothing out over
       the channel where the record says it hangs from the cables. */
    if (L.bridge && lm?.bridge) {
      drawBridge(f, lm.bridge, opts.year, (x, y) => t.elevM(x, y));
    }

    // 8 ── the names, last, over everything, on one ink budget
    if (L.labels) {
      this.labelGrid = new LabelGrid(f.W, f.H);
      /* ── THE ORDER IS THE PRIORITY, AND THE HOODS SIT IN THE MIDDLE ──
         `part3.html`'s label pass is `placeNames(lane 0)` → the arterials →
         `hoods()` → the rest of the streets → `placeNames(lane 1)`, and the
         reason it states is specificity: *a landmark name names one building,
         a neighbourhood name names a district, and a reader can find Market
         Street by looking at the picture and cannot find City Hall.* So the
         designated landmarks get first refusal, the DISTRICT CAPITALS come
         next, and the un-designated places take what is left.
         Placing every place first put GOLDEN GATE PARK, INNER SUNSET and WEST
         OF TWIN PEAKS out of the district frame — their boxes were taken by
         the small lowercase place labels that stand in the same fields. The
         split is done here, by lane, rather than inside `placeNames`: each
         call uses only the budget of the lane it is handed, so the per-class
         ink allowance is unchanged. */
      const pl = this.places.length ? this.placesForFrame() : [];
      if (pl.length) {
        const des = pl.filter((q) => q.cls === "designated");
        if (des.length) {
          st.labels += placeNames(f, des, this.labelGrid, (x, y) => t.elevM(x, y)).placed;
        }
      }
      /* ── AND THE STREETS HAD NO NAMES ON THEM, AT ANY ZOOM ─────────────
         `base/street-labels` and `strt/street-labels-2` ship **2,786 named
         stretches**, `data.ts` decodes them into one table, `labels.ts` ships
         `StreetNamePass` with its own ink budget, its own spine rule and its
         own collision handling, and the suite asserts all of it — and NOTHING
         IN `src/components` EVER CONSTRUCTED THE PASS. Production wrote zero
         street names at every camera, by construction. Measured against the
         mock: whole city 10 / 0, district 30 / 0, block 37 / 0.

         THE ORDER IS NOT COSMETIC AND IT IS THE WHOLE OF THE FIX. The pass is
         three sub-passes interleaved into the label pass at the three points
         `part3.html` puts them — the seven spine stretches BEFORE the
         neighbourhood capitals, the rest of rank 0 AFTER them, the local
         streets after the un-designated places. Run instead as one block at
         the end, into the grid the finished frame leaves behind, the
         whole-city camera places 4 names and loses GEARY BLVD and 3RD ST; run
         here it places 9. Same code, same data, same budget — a different
         position in the pass list.

         The three layers share ONE collision grid on purpose (§9's *"the same
         NUMBER and not the same POOL"*), so a street name cannot be written
         over a place name and neither layer has to know the other exists. */
      const nameTbl = this.data.streetLabels();
      const sn = nameTbl
        ? new StreetNamePass(f, nameTbl, this.labelGrid, (x, y) => t.elevM(x, y))
        : null;
      sn?.draw("spine");
      /* ── THE DISTRICT CAPITALS, WHICH HAVE BEEN ON THE WIRE ALL ALONG ──
         `base/blocks` carries a `hood` byte per assessor block and the
         manifest carries 41 `hoodNames`; `decodeBlocks` has decoded both into
         `BlockTable` since P2 and nothing read them. They are the LARGEST TYPE
         IN THE MOCK'S DISTRICT FRAME — eight names on B3 — and production
         wrote none of them, which is a large part of why that frame reads as a
         texture and the mock's reads as a map.
         The anchor is DERIVED and not typed in: the area-weighted centroid of
         the blocks carrying the name, so twenty-two small downtown blocks do
         not out-vote four large ones. Built once, because it is a function of
         the chunk and not of the camera.
         THE COLLISION GRID IS DELIBERATELY THE ONE THE PLACE NAMES JUST USED.
         That is §9's *"the same NUMBER and not the same POOL"*: two label
         layers on one ink budget, so a hood name cannot be written over a
         place name and neither layer has to know about the other. */
      if (this.blocks) {
        if (!this.hoodAnchors) this.hoodAnchors = buildHoodAnchors(this.blocks);
        st.labels += drawHoodNames(
          f, this.hoodAnchors, this.labelGrid, (x, y) => t.elevM(x, y),
        );
      }
      sn?.draw("arterials");
      // and the un-designated places last, into whatever the two above left
      const rest = pl.filter((q) => q.cls !== "designated");
      if (rest.length) {
        st.labels += placeNames(f, rest, this.labelGrid, (x, y) => t.elevM(x, y)).placed;
      }
      sn?.draw("local");
      st.labels += sn?.placed ?? 0;
    }
    return st;
  }

  /** the bay's aerial gradient and the published bathymetry, under everything */
  private paintWaterBed(f: Frame, band: BandCache): void {
    const sg = band.surround;
    const bay = bayPlate(
      f, makeCanvas,
      (this.data.manifest.proj as unknown as TerrainProj).downtown,
    );
    if (sg) this.ensurePlates(sg);
    /* ── BAY, THEN SHOAL, THEN DEPTH — the reference's own order ────────
       `drawTerrain` in part3.html lays the bay gradient, then the shore band,
       then the published bathymetry, and it states the reason at the call: the
       depth goes "OVER the shore band — which is untouched, and is a distance
       from land and says so." That is the project's hierarchy expressed as a
       paint order: **the published field ends up on top of the declared one.**
       Production had the shoal blitted at step 3, after the surround and after
       the DEM, so a declared wash sat over a published measurement — and the
       previous agent's fix inside `drawWater` measured no change at all,
       because `paintWaterBed` never passes `shoal` and the real blit was
       somewhere else entirely. It is here now, between the two, where the
       reference puts it. */
    drawWater(f, {
      bay: bay as (CanvasImageSource & { width: number; height: number }) | undefined,
      shoal: this.shoalPlate ?? undefined,
      depth: this.depthPlate ?? undefined,
      surround: sg,
      shoalTexels: 1,
      depthTexels: this.depthTexels ?? 1,
    });
  }

  /**
   * The two grid plates. Built once — they are a picture of a published field
   * over a fixed grid, so nothing about them depends on the camera, and
   * rebuilding one per frame would be the whole bay resampled for nothing.
   */
  private ensurePlates(sg: SurroundGrid): void {
    if (this.depthPlate && this.shoalPlate) return;
    const wc = this.data.get("base/water0");
    const meta = this.data.manifest.water as unknown as WaterMeta | undefined;
    const XW = sg.XW;
    const XH = sg.XH;
    const XNW = XW + 1;
    const XNH = XH + 1;

    if (!this.depthPlate && wc && meta) {
      const dep = wc.fields.dep as Uint8Array;
      if (dep.length === XNW * XNH) {
        const ramp = depthRamp(meta.qs);
        const cv = makeCanvas(XNW, XNH);
        const g = cv.getContext("2d");
        if (g) {
          const img = g.createImageData(XNW, XNH);
          for (let k = 0; k < XNW * XNH; k++) {
            const v = dep[k];
            const o = k * 4;
            if (v === 0) {
              img.data[o + 3] = 0; // all land: the source dropped it, so do we
              continue;
            }
            const c = depthColour(depthM(v, meta.dmax), ramp);
            img.data[o] = c[0];
            img.data[o + 1] = c[1];
            img.data[o + 2] = c[2];
            img.data[o + 3] = 255;
          }
          g.putImageData(img, 0, 0);
          this.depthPlate = cv;
        }
      }
      /* ── AND THE FOUR-TIMES PLATE, WHERE ITS TILES HAVE LANDED ──────────
         The coarse field above is 417 x 281 nodes. `water1` ships the same
         measurement at 1665 x 1121 — an EXACT refinement, 416 x 4 + 1 and
         280 x 4 + 1, so every fourth texel of the fine plate is a node of the
         coarse one and the two swap under the same blit with no seam.
         `water.ts` ships `buildDepthPlate` and writes this call out in its own
         doc; nothing called it. Its tier `minZ` is 3.0, so the two wide
         cameras never fetch it and keep the coarse plate — which is a manifest
         decision (+34 % on the first paint) and not one for this file. A tile
         position with no chunk is DRY LAND, not a hole: nine of the 35 are
         dropped by the encoder for that reason and stay transparent. */
      const tiles = this.data.manifest.chunks
        .filter((c) => c.kind === "water" && c.tier === "water1")
        .map((c) => ({ e: c as unknown as DepthTile["e"], f: this.data.get(c.k) }))
        .filter((x): x is DepthTile => !!x.f);
      if (tiles.length) {
        const fine = buildDepthPlate(meta, tiles, makeCanvas);
        if (fine) {
          this.depthPlate = fine;
          this.depthTexels = meta.mul;
        }
      }
    }

    if (!this.shoalPlate) {
      /* ── `sg.z(i, j) > 0` IS NOT A LAND TEST — DRAW.md §16.3 ────────────
         The shallows plate's BFS asks "is this 110 m node land?" and the
         predicate used to answer it with "and does it stand above sea level".
         **Every made-land parcel in the city reads 0 m on that grid** —
         Treasure Island, the Marina fill, Mission Bay, the Embarcadero
         seawall — so the BFS called them water and the plate went down opaque
         across them. Under the city's own cells it never showed; once the
         shore corridor re-blitted the plate over them, Treasure Island came
         back the colour of the sea with its own label on it (BUGS §6's
         sibling). A land BIT is the land test. An elevation of zero is a
         measurement of flat ground, not evidence of water. */
      const sh = buildShoal(XW, XH, (i, j) => isLandOf(sg, i, j));
      const hole = buildShoalHoles(
        XW, XH,
        (i, j) => [
          sg.mx[i] + (sg.mx[1] - sg.mx[0]) / 2,
          sg.my[j] + (sg.my[1] - sg.my[0]) / 2,
        ],
        sh.dist,
        this.coast,
        (x, y) => {
          const b = this.bandFor(0);
          return b ? b.terrain.elevM(x, y) <= 0 : false;
        },
      );
      const cell = shoalCellAlpha(XW, XH, { ...sh, hole });
      const node = shoalNodeAlpha(XW, XH, cell);
      const cv = makeCanvas(XNW, XNH);
      const g = cv.getContext("2d");
      if (g) {
        const img = g.createImageData(XNW, XNH);
        // BAY_SHOAL, as an alpha over whatever the depth plate left
        for (let k = 0; k < XNW * XNH; k++) {
          const o = k * 4;
          img.data[o] = 0xc6;
          img.data[o + 1] = 0xdc;
          img.data[o + 2] = 0xe3;
          img.data[o + 3] = Math.round(Math.max(0, Math.min(1, node[k])) * 255);
        }
        g.putImageData(img, 0, 0);
        this.shoalPlate = cv;
      }
    }
  }

  /**
   * IS ANY PUBLISHED RIGHT OF WAY WIDE ENOUGH TO BE A SURFACE YET?
   *
   * THIS GATE USED TO BE `z >= VZ_T0`, AND `VZ_T0` IS A TREE. It is
   * `trees.ts`'s threshold for promoting a canopy blob to individual trees —
   * 2.9, which is also `ZSTEPS[1]`, which is why nobody noticed. A layer that
   * asks another layer's constant whether it should draw is not gated, it is
   * coincident: measured (`.parity/GAPS.md` §2), `scene.streets` read **0 at
   * all six district cameras and all four whole-city cameras** while the mock
   * drew the whole carriageway grid at district — Sunset Blvd, a divided
   * boulevard in the mock, was not drawn at all.
   *
   * The street layer's own rule is published and it is metric, not banded:
   * `streets.ts` opens the EXTENT tier when a right of way projects **2 px**
   * wide (`ST_EXT_PX`, argued there against the city's median of 1.32 px at
   * whole-city zoom), and at ROT 315 a width at an unknown bearing projects at
   * `ST_KPROJ`. So the layer is worth dispatching exactly when the city's
   * ninetieth-percentile right of way — `w_p90`, out of the encoder's own
   * manifest, 25.7 m; the same number and the same test the mock uses — clears
   * that gate. Nothing here is chosen: both constants and the width are read.
   *
   * Below it every feature would fail `extentW` one at a time and the layer
   * would draw nothing for the cost of the whole cull loop. Above it the
   * per-feature ramp in `drawStreetSurface` decides, continuously, which is
   * where that decision belongs.
   */
  private streetsResolve(scale: number): boolean {
    const m = this.data.manifest.streets as unknown as
      { stats?: { w_p90?: number } } | undefined;
    const wM = m?.stats?.w_p90;
    return typeof wM === "number" && wM > 0 && wM * ST_KPROJ * scale > ST_EXT_PX;
  }

  private paintStreets(
    f: Frame,
    t: TerrainField,
    view: CityView,
    year: number | undefined,
    band: number,
  ): number {
    const stats = this.data.manifest.streets as unknown as {
      stats: { w_p50: number; fw_p50: number };
    };
    const medianW = [
      stats.stats.w_p50, stats.stats.w_p50, stats.stats.w_p50,
      stats.stats.w_p50, stats.stats.w_p50, stats.stats.w_p50, stats.stats.w_p50,
    ];
    /* ── NOT ONE CENTRELINE WAS DRAWN ANYWHERE IN SAN FRANCISCO ────────
       `drawCentrelines` returns on its first line when it is handed no
       `lines`, and this call site passed none — and reached it only after an
       early `if (!cells.length) return 0` on the SURFACE cells, which do not
       exist below z = 1.75. So the layer was dead at every zoom: 4,895
       published centrelines decoded by `data.streetLines()`, which had no
       caller outside its own tests, over a map that was already writing
       PRESIDIO BLVD and MASON ST as labels with no line under either.

       THE CENTRELINE LAYER STANDS ON ITS OWN and is ordered before the
       surface, not gated on it: at the whole-city frame there are no surface
       cells at all, and the line is the only thing that says a street is
       there. `covered: () => true` is right for the same reason it always
       was — a right of way and its centreline ship in the same chunk — and
       `band` is the camera's own, not 0.

       Measured before it was turned on (`.parity/g1lines.py`), ink as a share
       of the stage: whole city 1.194 %, district 2.093 %, block 1.308 %, at
       `ST_LINE_INK` alpha 0.20. See DRAW.md §26. */
    const lines = this.data.streetLines();
    if (lines.length) {
      drawCentrelines(f, EMPTY_CELLS, t, {
        medianW, covered: () => true, band, lines, year,
      });
    }
    /* ── AND THE SURFACE'S GATE IS THE SURFACE'S, AFTER THE LINES ──────
       `streetsResolve` is the RIGHT OF WAY's own published rule — the layer is
       worth dispatching when the city's `w_p90` clears `ST_EXT_PX`. It has
       nothing to say about a centreline, which is a stroke of fixed pixel
       width and is legible at every zoom this map has. Gating the lines on it
       is the fault this method's own doc comment names two paragraphs up:
       *"a layer that asks another layer's constant whether it should draw is
       not gated, it is coincident."* At the whole-city camera
       25.7 x ST_KPROJ x 0.0467 = 1.47 px against a 2 px gate, so the surface
       correctly declines — and the lines, which are 1.194 % of that stage,
       were declining with it.

       The cull loop stays BEHIND the gate, which is what the gate is for:
       below it every feature fails `extentW` one at a time and the layer draws
       nothing for the cost of walking all of them. */
    if (!this.streetsResolve(f.cam.scale)) return 0;
    const cells: StreetCell[] = [];
    for (const c of this.data.visible("strt", view)) {
      cells.push(c.fields as unknown as StreetCell);
    }
    if (!cells.length) return 0;
    const r = drawStreetSurface(f, cells, { year, terrain: t });
    /* ── 1,120 TRAFFIC ISLANDS AND 268 PUBLIC STAIRS, DECODED AND UNDRAWN ──
       `base/street-misc` is on the wire, `data.streetMisc()` decodes it and
       `streets.ts` ships `drawStreetMisc` with the call site written out in
       its own doc comment. Nothing called it. The stairs are San Francisco's
       own signature — a street that becomes a flight of steps because the hill
       is too steep for a roadway — and the islands are what makes a boulevard
       read as a boulevard. `streetMisc()` is null until the chunk lands, so
       this is a no-op on the first paint rather than a gate. */
    const misc = this.data.streetMisc();
    if (misc) drawStreetMisc(f, misc, t, { fwMedianM: stats.stats.fw_p50 });
    return r.surfaces;
  }

  /**
   * THE VEGETATION GRID IS READ OFF THE CATALOGUE, NOT OFF A CONSTANT.
   *
   * `cellKey = row * gw + col`, and `gw` moved in the encoder on 2026-08-23
   * while the renderer's copy of it did not. Every tree and every canopy blob
   * in the city was decoded on the old width for a day and placed in the
   * Pacific. Reading the encoder's own number is the only version of this that
   * cannot drift; `assertTreeGrid` throws if the 130 entries disagree.
   */
  private vegGrid(): TreeGrid {
    if (!this.veg) {
      this.veg = assertTreeGrid(
        this.data.manifest.chunks.filter(
          (c) => c.kind === "tree" || c.kind === "canopy",
        ) as unknown as Readonly<Record<string, unknown>>[],
      );
    }
    return this.veg;
  }

  private paintVeg(f: Frame, t: TerrainField, view: CityView, z: number): number {
    const trees: TreeCell[] = [];
    const canopy: CanopyCells[] = [];
    if (z >= VZ_T0) {
      for (const c of this.data.visible("tree", view))
        trees.push(c.fields as unknown as TreeCell);
    }
    for (const c of this.data.visible("canopy", view))
      canopy.push(c.fields as unknown as CanopyCells);
    if (!trees.length && !canopy.length) return 0;
    const r = drawVeg(f, t, this.sprite, trees, canopy, z, this.vegGrid());
    return r.trees + r.blobs;
  }

  /**
   * THE CITY'S OWN SILHOUETTE, BLURRED, OFFSET DOWN THE KEY LIGHT, AND LAID
   * UNDER THE CITY.
   *
   * `buildings.ts` §AO carries every constant and the one architectural
   * deviation. What this adds is the silhouette the reference gets for free
   * from a layer it has already drawn: the roof rings of the visible set and
   * the massing blocks under them, accumulated into ONE `Path2D` and filled
   * once into a half-resolution buffer.
   *
   * ONE PATH AND ONE FILL, and the reason is not speed alone: the tint is
   * applied with `source-in` over the whole buffer, so what matters is the
   * union of the silhouettes and not their count — and a union costs nothing
   * extra in a single nonzero fill, which is the same argument
   * `addContactShadow` already makes about overlapping shadows.
   *
   * THE MASSING BLOCKS ARE IN IT. Below `LOD_Z1` most of the city is drawn as
   * block massing and not as footprints, and an occlusion under a city that is
   * half absent from its own mask is a different picture at every zoom the
   * dissolve covers. The mask is what will be DRAWN, both tiers, which is what
   * the reference's `cityL` holds.
   */
  private paintAO(
    f: Frame,
    t: TerrainField,
    view: CityView,
    z: number,
    step: number,
    wB: number,
    year: number | undefined,
  ): void {
    if (AO_ALPHA <= 0.001) return;
    const { ctx, W, H } = f;
    const ss = AO.SS;
    const bw = Math.max(1, Math.ceil(W * f.dpr * ss));
    const bh = Math.max(1, Math.ceil(H * f.dpr * ss));
    let buf = this.aoCv;
    if (!buf || buf.width !== bw || buf.height !== bh) {
      buf = new OffscreenCanvas(bw, bh);
      this.aoCv = buf;
    }
    const g = (buf as OffscreenCanvas).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bw, bh);
    g.setTransform(f.dpr * ss, 0, 0, f.dpr * ss, 0, 0);

    const p = new Path2D();
    let any = false;
    const cf = f.proj.coeffs();
    const zexb = f.proj.zexb;
    const sc = f.cam.scale;
    const ccx = f.cam.cx, ccy = f.cam.cy, W2 = W / 2, H2 = H / 2;
    const ring = (
      xs: ArrayLike<number>, ys: ArrayLike<number>, o: number, n: number,
      zg: number, hM: number,
    ): void => {
      for (let k = 0; k < n; k++) {
        const wx = xs[o + k], wy = ys[o + k];
        const px = cf.ax * wx + cf.ay * wy;
        const py = cf.bx * wx + cf.by * wy + zg * f.proj.zex + hM * zexb;
        const X = (px - ccx) * sc + W2;
        const Y = H2 - (py - ccy) * sc;
        if (k) p.lineTo(X, Y); else p.moveTo(X, Y);
      }
      p.closePath();
      any = true;
    };

    // the footprint tier, exactly the set `paintFootprints` will draw
    const mg = this.massing, urnd = this.urnd;
    if (mg && urnd && z >= 1.55) {
      const iy = year === undefined ? SCRUB_MAX : Math.floor(year);
      const clock = year !== undefined;
      const kx = cf.ax ? Math.hypot(cf.ax, cf.ay) * sc : 0;
      const tables: BldTable[] = [];
      if (this.solo) tables.push(this.solo);
      for (const c of this.data.visible("bldg", view)) {
        if (c.key === "base/solo") continue;
        const b = this.bldFor(c);
        if (b) tables.push(b);
      }
      for (const tb of tables) {
        for (let i = 0; i < tb.n; i++) {
          if (!drawnAsBuilding(urnd, mg, tb.gid[i], wB)) continue;
          const nv = tb.off[i + 1] - tb.off[i];
          if (nv < 3) continue;
          if (clock && (tb.u[i] & FLAG_NOYEAR) === 0 && iy < 1849 + tb.yr[i]) continue;
          const hM = roofHeight(tb.h[i], tb.hf[i]);
          const cxs = (cf.ax * tb.cx[i] + cf.ay * tb.cy[i] - ccx) * sc + W2;
          if (cxs < -120 * kx || cxs > W + 120 * kx) continue;
          ring(tb.vxw, tb.vyw, tb.off[i], nv,
               t.elevM(tb.cx[i], tb.cy[i]), hM);
        }
      }
    }
    // and the massing tier under it
    const bl = this.blocks, row = this.massRow;
    if (bl && row && 1 - wB > 0.004) {
      for (let b = 0; b < bl.n; b++) {
        if (row.cov[b] <= 0) continue;
        const r = blockRing(bl, b, BLOCK_INSET_M);
        if (!r.length) continue;
        const zg = t.elevM(bl.cx[b], bl.cy[b]);
        for (let k = 0; k < r.length; k++) {
          const px = cf.ax * r[k][0] + cf.ay * r[k][1];
          const py = cf.bx * r[k][0] + cf.by * r[k][1] + zg * f.proj.zex
                   + row.hgt[b] * zexb;
          const X = (px - ccx) * sc + W2;
          const Y = H2 - (py - ccy) * sc;
          if (k) p.lineTo(X, Y); else p.moveTo(X, Y);
        }
        p.closePath();
        any = true;
      }
    }
    if (!any) return;

    const rr = AO.R[Math.min(step, AO.R.length - 1)] ?? 2.4;
    g.globalCompositeOperation = "source-over";
    g.filter = `blur(${rr}px)`;
    g.fillStyle = "#000";
    g.fill(p);
    g.filter = "none";
    /* the tint, `source-in`: what is in the buffer is a blurred coverage MASK,
       and this replaces its colour while keeping its alpha — so the AO is one
       declared colour at the mask's own softness, exactly as `part4.html` L74
       does it. */
    g.globalCompositeOperation = "source-in";
    g.fillStyle = AO.COL;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";

    // and under the city, offset down-left along the key light
    const ox = AO.OX * rr, oy = AO.OY * rr;
    const sa = ctx.globalAlpha;
    ctx.globalAlpha = sa * AO_ALPHA;
    ctx.drawImage(buf as CanvasImageSource, 0, 0, bw, bh, ox, oy, W, H);
    ctx.globalAlpha = sa;
  }

  private paintMassing(
    f: Frame,
    t: TerrainField,
    step: number,
    wB: number,
    year: number | undefined,
  ): number {
    const bl = this.blocks;
    const mg = this.massing;
    if (!bl || !mg) return 0;
    const iy = year === undefined ? 2025 : Math.floor(year);
    if (!this.massRow || this.massRowYear !== iy) {
      this.massRow = massAt(mg, bl.n, iy, this.blockOrder);
      this.massRowYear = iy;
    }
    const pal = {
      roof: roofPalette((this.data.manifest.buildings as { palette: string[] }).palette),
      wall: wallPalette(),
    };
    const fade = fadeAmt(f);
    const colours = massLUT(pal, fade);
    const roofIdx = this.blockRoofIdx(bl);
    const wallIdx = this.blockWallIdx(bl);
    const alpha = 1 - wB;
    if (alpha <= 0.004) return 0;
    return drawMassing(
      f, t, bl, this.massRow, this.blockOrder, colours, roofIdx, wallIdx,
      { alpha, fadeAmt: fade },
    );
  }

  /**
   * THE MASSING SOLID'S ROOF TONE — MEASURED, as of P4b.
   *
   * `part3.html` §5732 replaced a seeded locale legend — "downtown: grey,
   * hard", "the avenues: pale stucco rows" — with **the area-weighted mean of
   * the measured roof colours of the buildings actually standing on the
   * block** (`paint/blocks.py` → `PAINT.bidx`), and its own comment calls the
   * legend it replaced *"an honest description of an invention, sitting in the
   * frame this piece is most often looked at in."*
   *
   * P4 could not read it: `manifest.kinds.blocks` shipped nine fields and none
   * was a roof index, and there is no block → building map in `base/massing` to
   * recompute one from. The stand-in was the block's own published
   * area-weighted mean LIDAR height, banded at `roofs.ts`'s 9 / 15 / 25 m —
   * an art choice on a measured column, stated as one, and **reported to P1 as
   * a gap.**
   *
   * P1 closed it. `bidx` is now a tenth field on the `blocks` chunk: per
   * building the MEDIAN colour of the published aerial pixels inside the
   * footprint, eroded 1.5 m so the sample is roof and not wall or kerb (Esri
   * World Imagery at z=18, 0.472 m/px; 166,042 of 166,166 footprints sampled);
   * area-weighted onto the block whose published ring CONTAINS the footprint's
   * centroid, and quantised to the same 32-entry palette the buildings use.
   * **5,043 of 5,404 blocks carry it (93.3 %).**
   *
   * The 361 that do not are park, water and right of way, and they ship the
   * `255` sentinel. Those keep the height band — the measurement says nothing
   * about them, so nothing is invented for them, and the fallback is named
   * here rather than hidden behind a default.
   */
  /**
   * THE MASSING SOLID'S WALL INDEX — the mock's own `WI`, which this file was
   * allocating as a zero array and `drawMassing` was throwing away.
   *
   * `part3.html` L5710 builds `WI[b]` and `RI[b]` together from one rule: the
   * **locale legend**, biased by distance from downtown and by which side of
   * the Ferry-to-Castro line the block sits on, over a seeded per-block noise.
   * `RI[b]` was then OVERWRITTEN by the measurement (`PA.bidx`, 5,043 of
   * 5,404 blocks) and `blockRoofIdx` above carries that. **`WI[b]` was never
   * overwritten, because nothing published measures the side of a block**, and
   * the mock's own comment says what the legend is for: *"the bias by locale
   * is what gives the wide shot a colour range instead of one beige."*
   *
   * So this is a legend and it is declared as one, exactly as the same rule is
   * declared where `decodeBld` uses it for the 3.8 % of footprints that join
   * no roll row. It is the SAME FUNCTION — `legendTones` in `palette.ts`,
   * whose four candidate arrays are `part3.html` L5716-5721 element for
   * element — read here on the block's own centre rather than a building's,
   * and over `buildURND`, which is byte-for-byte the mock's own `RND` (the
   * same xorshift, the same 19060418 seed).
   *
   * Cached: it is a pure function of the block table and cannot change.
   */
  private blockWallIdx(bl: BlockTable): Uint8Array {
    const hit = this.blockWall;
    if (hit && hit.length === bl.n) return hit;
    const out = new Uint8Array(bl.n);
    const tone = this.tone;
    // the legend is measured against the three named points; with no tone
    // context there is nothing to measure against and every block keeps 0
    if (!tone) return out;
    const rnd = buildURND(bl.n);
    for (let b = 0; b < bl.n; b++) {
      const r = Math.hypot(bl.cx[b] - tone.dtx, bl.cy[b] - tone.dty) / tone.maxR;
      const side =
        (bl.cx[b] - tone.fx) * tone.mvy - (bl.cy[b] - tone.fy) * tone.mvx < 0
          ? 0
          : 1;
      out[b] = legendTones(r, side, rnd[b]).wall;
    }
    this.blockWall = out;
    return out;
  }

  private blockRoofIdx(bl: BlockTable): Uint8Array {
    const hit = this.blockRoof;
    if (hit && hit.length === bl.n) return hit;
    const out = new Uint8Array(bl.n);
    const row = this.massRow;
    const BY_BAND = [WAM(3), WAM(8), WAM(10), WAM(1)];
    for (let b = 0; b < bl.n; b++) {
      const m = bl.bidx[b];
      if (m !== BIDX_NONE) {
        out[b] = PAINT_C0 + m;
        continue;
      }
      const h = row ? row.hgt[b] : 0;
      out[b] = BY_BAND[bandOfHeight(h)];
    }
    this.blockRoof = out;
    return out;
  }

  /**
   * THE FOOTPRINT TIER — `drawCity`'s own loop, as far as the export carries it.
   *
   * One prism per published footprint: the roof at `roofHeight(h, hf)` over the
   * ground the DEM gives, and the walls of every edge whose outward normal
   * faces down-screen. At the 315° bearing a building shows its roof and ONE
   * wall, so the front-face test is a sign test on the projected edge and not a
   * dot product.
   *
   * `drawnAsBuilding` is the dither: below `LOD_Z0` nothing but the solos is
   * here, and between 1.55 and 2.35 a building arrives on its own fixed
   * `URND[i]`, so a re-rasterisation at a higher `w` differs from the last one
   * by *more grain* and not by a different picture.
   *
   * ── WHAT P4b ADDED, AND WHY EACH ONE IS NOT COSMETIC ────────────────────
   * P4 shipped this as a stated SIMPLIFICATION of the mock's 597-line
   * `drawCity()`. Five things were missing and four of them are here:
   *
   * 1. **PAINTER'S ORDER.** The first loop walked the visible chunks in arrival
   *    order and each chunk in its own Hilbert order, which is spatially
   *    coherent and is *not* depth order — so a near building could be drawn
   *    before a far one and the far one then painted its roof over it. Nothing
   *    threw and the suite stayed green. `streamOrder` is the counting sort
   *    `buildings.ts` ships for exactly this.
   * 2. **THE CONTACT SHADOW**, batched per depth band. See `addContactShadow`.
   * 3. **THE `RECT_SCALE` RUNG** and the four-extreme-vertex `QUAD_PX` rung,
   *    both of which the first loop replaced with a bounding box. A bounding
   *    box circumscribes the shape, so it thickens every building by ~30 % of
   *    its area and closes up the streets between them.
   * 4. **THE ARRIVAL TINT**, which is `colourLUT`'s `roofF`/`wallF` — shipped
   *    since P3 and read by nothing, so every building on this map was drawn at
   *    tint index 0.
   * 5. **THE LANDMARK FLUSH AT THE BUCKET FLOOR** — `paintHeroes`, below.
   *
   * The lot-grain party lines are the one item on P4's list that is NOT here,
   * and the reason is that they do not exist to port. `LOTINK`, `LOT_SHADE`,
   * `LOT_MIN_BLOCK_PX` and `LOT_MIN_GAP_PX` are **dead in the mock as well** —
   * three declarations and one comment, no reader anywhere in `part1–4.html` —
   * because the 48 seeded frontage patterns they belonged to were deleted on
   * 2026-08-21 as an invention, and the real lot boundaries that were to
   * replace them are not in the P1 catalogue: `manifest.kinds` has seventeen
   * kinds and none is a lot. Drawing a party line here would be inventing both
   * its position and its existence. What the mock kept of that layer is the
   * ROOF OUTLINE — *"the outline is what separates one house from the one it
   * shares a party wall with"* — and that is drawn, at `EDGE_SHADE`.
   */
  private paintFootprints(
    f: Frame,
    t: TerrainField,
    view: CityView,
    z: number,
    step: number,
    wB: number,
    year: number | undefined,
  ): number {
    const mg = this.massing;
    const urnd = this.urnd;
    if (!mg || !urnd) return 0;
    const fade = fadeAmt(f);
    const key = fade.toFixed(4) + "|" + step;
    if (this.roofLutKey !== key || !this.roofLut || !this.roofNF) {
      const pal = {
        roof: roofPalette((this.data.manifest.buildings as { palette: string[] }).palette),
        wall: wallPalette(),
      };
      this.roofLut = colourLUT(pal, fade, step);
      /* ── THE PUBLISHED VALUE REACHED NO ROOF AT ALL ────────────────────
         `roofs.ts` ships `RSHADE`, `roofStep` and `roofFineLUT`, `DRAW.md` §7
         records them as landed, `draw.test.ts` asserts them — and NOTHING IN
         THE RENDERER CALLED ANY OF THE THREE. Every roof of a given palette
         entry was one flat value at every zoom, which is the thing the
         published quartiles exist to break: 121,419 of 166,166 footprints —
         every house in the Sunset and the Richmond — fall in height band 0 and
         so shared ONE tone, and at the district camera the mock's own
         measurement is 40,119 of 42,462 roofs in frame sharing sixteen.

         `part3.html` L1127 is exactly this: `CL_ROOFN[j*4+q] = shade(CL_ROOFF
         [j], RSHADE[q])`, and `roofFineLUT` already has that shape. Not one
         new byte on the wire — `rsh` is built from the height byte at decode. */
      this.roofNF = roofFineLUT(this.roofLut.roofF);
      this.roofLutKey = key;
    }
    const lut = this.roofLut;
    const roofNF = this.roofNF ?? roofFineLUT(lut.roofF);
    /** `COVER_GAIN[step]`, the one number `colourLUT` already resolved */
    const gain = COVER_GAIN[step] ?? 1;

    /** the `bldg` chunk and the `face` chunk that mirrors it, key for key */
    const tables: { tb: BldTable; face: Chunk | null }[] = [];
    if (this.solo) tables.push({ tb: this.solo, face: this.soloFace });
    if (z >= 1.55) {
      for (const c of this.data.visible("bldg", view)) {
        /* `base/solo` IS OF KIND `bldg`, so `visible("bldg")` yields it too and
           the solo table would be decoded, sorted and drawn TWICE — once from
           the line above and once from here. Harmless while the loop had no
           painter's order and not harmless now: a doubled roof is a doubled
           outline and a doubled wall gradient. */
        if (c.key === "base/solo") continue;
        const b = this.bldFor(c);
        /* THE FACE CHUNK IS PER CELL AND IT HAS TO BE MATCHED PER CELL.
           `face/10_10` mirrors `bldg/10_10` row for row, and the first cut read
           `base/solo-face` for every table — so a Mission house's openings were
           the published storey count, type and shop flag of whichever SOLO
           happened to share its row index. Silent, typed and wrong.
           `faceKeyFor` is a total function over the two key shapes that exist
           and returns null for anything else, because a WRONG face chunk reads
           as a plausible building and a missing one reads as fewer openings. */
        const fk = faceKeyFor(c.key);
        if (b) tables.push({ tb: b, face: fk ? this.data.get(fk) ?? null : null });
      }
    }
    if (!tables.length) return 0;

    const { ctx, W, H } = f;
    /* ── THE FOOTPRINT TIER IS ON THE CLOCK TOO ───────────────────────
       This was `const iy = 2025` — a hardcoded present, so the massing tier
       un-built with the year and the footprints above the dissolve did not.
       At the district camera that is a whole-city block plan thinning while
       every one of its 87,774 buildings stays standing, which is not a
       century scrub, it is two maps of different years in one frame.
       The gate is the roll's own: a footprint arrives in the year the secured
       assessor roll dates the building on its parcel, and `FLAG_NOYEAR` is
       honoured — the roll dates 12,594 parcels to its own "not known", and
       those are drawn in EVERY year rather than being given one. Nothing here
       invents a date; a building the record cannot date is counted, not
       hidden and not stamped. See `time.ts` §THE ONE RULE.
       `year === undefined` is "every year", which is what a deep link, a
       settled explorer and the cached layer all need. */
    const iy = year === undefined ? SCRUB_MAX : Math.floor(year);
    const clock = year !== undefined;
    /* THE ROOF'S COVERING FOR THIS YEAR. See `palette.ts` §THE ROOF COVERING
       TIMELINE: the measured aerial colour is the PRESENT and not the century,
       so it becomes the last era of a declared timeline and the earlier years
       are derived from the roll's own use class and year. At `SCRUB_MAX` every
       covering date falls in the last era and this table is `ERA_MEASURED`
       throughout — the present-day frame does not move. */
    if (this.eraRoofYear !== iy || !this.eraRoof) {
      this.eraRoof = roofEraTable(iy);
      this.eraRoofYear = iy;
    }
    const eraRoof = this.eraRoof;
    /* the fabric's own arrival wave: far-to-near across the frame with a
       per-building jitter, over the first 38.5 % of the year's passage. Off a
       run this is 1 for everything, which is `rise = 1` — the state
       `tintIndex` was written to expect when no clock is running. */
    const phase = clock ? risePhase(year, this.filmRunning) : 1;
    const staggering = phase < 1;
    const hidden = this.filmHide;
    /* Projected px per world metre, from the one equation. At the 315° bearing
       proj() is axis-aligned, so a world metre is `cA·√2·scale` px ACROSS the
       screen and `sA·√2·scale` px DOWN it — and a metre of BUILT HEIGHT is
       neither: it is `zexb·scale`, because `projb` adds `h·ZEXB` straight to
       the plane's second coordinate. Using the down-screen factor for height
       under-reports a wall by 2.7× and silently suppresses every facade
       (`FA_MIN_DH_PX`) and every roof tray. */
    const kx = f.proj.cA * Math.SQRT2 * f.cam.scale;
    const k2 = f.proj.sA * Math.SQRT2 * f.cam.scale;
    const kh = f.proj.zexb * f.cam.scale;
    const cf = f.proj.coeffs();
    /** `LMAX` — `part3.html` L1312, the length of the screen-x gradient */
    const lmax = Math.hypot(cf.ax, cf.ay) || 1;
    const faceOn = z >= 4.0;
    const groups = faceOn ? newFaceGroups() : null;

    /* ── PASS ONE: WHO IS IN THE FRAME, AND HOW FAR AWAY ──────────────
       One centroid projection and one screen-space reject per building, before
       a single ring vertex is touched — at block zoom that is 94 % of the city.
       What survives goes into three parallel arrays and is counting-sorted by
       depth. The sort cannot be cached per bearing the way the mock's is: the
       visible set changes as chunks arrive and as the camera moves. It is per
       RASTERISATION, which is the frame that can afford it, because a gesture
       is served from a blit of the last one. */
    let cap = 0;
    for (const { tb } of tables) cap += tb.n;
    const srcT = new Int32Array(cap);
    const srcI = new Int32Array(cap);
    const srcD = new Float32Array(cap);
    let m = 0;
    for (let ti = 0; ti < tables.length; ti++) {
      const tb = tables[ti].tb;
      for (let i = 0; i < tb.n; i++) {
        if (!drawnAsBuilding(urnd, mg, tb.gid[i], wB)) continue;
        if (tb.off[i + 1] - tb.off[i] < 3) continue;
        /* the clock, and the one thing the film may overrule. A footprint the
           film is RAISING must not also be drawn by the fabric underneath it at
           full height — the roll dates City Hall's parcel 1906, which is the
           parcel and not the building, so without this the move into shot 4
           arrives on a finished City Hall, deletes it and rebuilds it. */
        if (hidden !== null && hidden.has(tb.gid[i])) continue;
        if (clock && (tb.u[i] & FLAG_NOYEAR) === 0 && iy < 1849 + tb.yr[i]) continue;
        const hM = roofHeight(tb.h[i], tb.hf[i]);
        const zg = t.elevM(tb.cx[i], tb.cy[i]);
        const pcx = cf.ax * tb.cx[i] + cf.ay * tb.cy[i];
        const pcy =
          cf.bx * tb.cx[i] + cf.by * tb.cy[i] + zg * f.proj.zex + hM * f.proj.zexb;
        const cxs = (pcx - f.cam.cx) * f.cam.scale + W / 2;
        const cys = H / 2 - (pcy - f.cam.cy) * f.cam.scale;
        const rad = 120 * kx + hM * k2;
        if (cxs < -rad || cxs > W + rad || cys < -rad || cys > H + rad) continue;
        srcT[m] = ti;
        srcI[m] = i;
        srcD[m] = f.proj.depth(tb.cx[i], tb.cy[i]);
        m++;
      }
    }
    if (!m) return 0;
    const ord = streamOrder(srcD.subarray(0, m));
    const [dlo, dhi] = ord.range;
    const dspan = dhi - dlo || 1;
    /* THE AERIAL FADE IS NORMALISED OVER THE CITY, THE BAND INDEX OVER THE
       FRAME, and the two are different quantities. `ord.range` is the depth
       range of the buildings in THIS stream, which is the right denominator
       for the painter's-order bands (it spends all of them on what is on
       screen) and the wrong one for the haze: normalised per frame, a
       building's aerial fade would change as the camera moved and the whole
       fabric would breathe. `part3.html` normalises the haze over
       `bldDepthRange`, which is city-wide and computed once. */
    const [hzLo, hzHi] = this.cityDepthRange();
    const hzSpan = hzHi - hzLo || 1;

    /* ── THE HEROES, KEYED TO THEIR OWN BUCKET FLOOR ──────────────────
       See `paintHeroes`. Prepared here because the flush depths have to be
       computed against THIS frame's bucket geometry. */
    const heroQ = this.heroQueue(f, t, ord, iy);
    let hq = 0;
    const heroGids = heroQ.gids;

    /* ── THE BATCH, AND WHERE IT STOPS ────────────────────────────────
       `buildings.ts` §"One fill of a thousand subpaths" is explicit that a
       shared `Path2D` is NOT always the win: moving a NEAR building into one
       does not remove its geometry, it moves it into a path the rasteriser
       then has to resolve against a thousand overlapping subpaths, and that
       measured SLOWER — 291.5 ms → 373.2 — while the JS got cheaper.
       `NEAR_PX` = 9 is where the split sits, and it sits there because raising
       it looked like an 8x win under a broken measurement and was a regression
       under rAF counting.
       So: a building wider than NEAR_PX gets its own fill(); everything
       narrower joins a bucket keyed on its COLOUR, because one fill() carries
       one colour and the colour therefore HAS to be the batch key.
       The buckets are flushed AT EVERY DEPTH BAND and not at the end of the
       frame, because a batch that spans the whole city is a batch that has
       thrown painter's order away again. 128 bands is the mock's own number. */
    const BANDS = 128;
    const roofBatch = new Map<string, Path2D>();
    const wallBatch = new Map<string, Path2D>();
    const strokeBatch = new Map<string, Path2D>();
    let shadow: Path2D | null = null;
    const batch = (mp: Map<string, Path2D>, c: string): Path2D => {
      let p = mp.get(c);
      if (!p) { p = new Path2D(); mp.set(c, p); }
      return p;
    };
    /* ── THE SECOND SOLID'S OWN QUEUE, AND WHY IT IS DEFERRED ─────────
       A cap is HELD until its band's roofs have been flushed. Draw it when the
       building is reached and the batched roof of a neighbour in the same band
       — including, at the fabric tier, the building's OWN roof — is filled
       afterwards and paints straight over it. That is the correctness cost
       `form/BLOCK-C.md` paid for the cylinder with two extra colour buckets;
       a pending list is cheaper, because a cap is one of at most 522 objects
       in a frame and not one of 90,000.
       It is flushed at the band, not at the frame, for the reason everything
       else here is: a queue that spans the whole city has thrown painter's
       order away again. */
    const capQ: {
      slot: number; ux: number; uy: number; zg: number; h: number;
      rise: number; roof: string; wallO: number; ink: string | null;
    }[] = [];
    /* ONE BAND, COMPOSITED INTO THE CITY LAYER — the shadow first, because it
       is under everything this band stands up; then the walls, the roofs and
       the outlines. A nearer band is painted after, over it, which is the
       whole of *a shadow obeys the same painter's order everything else does*. */
    const flushBand = (): void => {
      if (shadow) { fillContactShadow(f, shadow); shadow = null; }
      for (const [col, p] of wallBatch) { ctx.fillStyle = col; ctx.fill(p); }
      wallBatch.clear();
      for (const [col, p] of roofBatch) { ctx.fillStyle = col; ctx.fill(p); }
      roofBatch.clear();
      if (strokeBatch.size) {
        ctx.lineWidth = 0.7;
        for (const [col, p] of strokeBatch) { ctx.strokeStyle = col; ctx.stroke(p); }
        strokeBatch.clear();
      }
      /* AND THE CAPS LAST, over the roofs they stand on and under the band in
         front of them. `drawStep` runs its own two pixel floors and returns
         false below either, so a queued cap is not necessarily a drawn one. */
      if (capQ.length) {
        const form = this.form;
        if (form) {
          for (const q of capQ) {
            drawStep(f, {
              form, slot: q.slot, zg: q.zg, h: q.h, rise: q.rise,
              ux: q.ux, uy: q.uy,
              wall: lut.wallF, wallO: q.wallO, roofColour: q.roof, ink: q.ink,
            });
          }
        }
        capQ.length = 0;
      }
    };

    const quad = QUAD_IX;
    let bandIx = -1;
    let drawn = 0;

    ctx.save();
    ctx.lineJoin = "round";
    for (let o = 0; o < ord.order.length; o++) {
      const j = ord.order[o];
      const dpt = srcD[j];
      const bx0 = (((dhi - dpt) / dspan) * BANDS) | 0;
      if (bx0 !== bandIx) { flushBand(); bandIx = bx0; }
      /* the landmarks of this bucket, before the buildings that are nearer
         than they are and after every building in their own bucket */
      while (hq < heroQ.n && heroQ.flushD[hq] > dpt) { this.drawOneHero(f, heroQ, hq++, fade, gain); }

      const tbe = tables[srcT[j]];
      const tb = tbe.tb;
      const i = srcI[j];
      const gid = tb.gid[i];
      if (heroGids.has(gid)) continue; // its own hero has already stood here

      const oo = tb.off[i];
      const nv = tb.off[i + 1] - oo;
      const hFull = roofHeight(tb.h[i], tb.hf[i]);
      const zg = t.elevM(tb.cx[i], tb.cy[i]);

      /* ── THE ARRIVAL WAVE, which SHELL.md §8b.1 left to this block because
         the film owns the clock. A building of THIS year's cohort GROWS out of
         the ground and lands pale, settling into its own colour — so a cohort
         reads as construction rather than as a switch being thrown.
         FAR EDGE OF THE FRAME FIRST, which agrees with painter's order: a
         building that arrives later always paints OVER one that arrived
         earlier, never under. `dn` is normalised on the SCREEN and not on the
         whole city, because a cohort seen at district zoom occupies a narrow
         slice of world depth and a world-normalised stagger collapses it into a
         flash at exactly the zoom where the reader is closest to it. */
      let rise = 1;
      if (staggering && (tb.u[i] & FLAG_NOYEAR) === 0 && 1849 + tb.yr[i] === iy) {
        const pcyG = cf.bx * tb.cx[i] + cf.by * tb.cy[i] + zg * f.proj.zex;
        const dn = Math.max(0, Math.min(1, (H / 2 - (pcyG - f.cam.cy) * f.cam.scale) / H));
        rise = riseOf(phase, dn, urnd[tb.gid[i] % urnd.length]);
        if (rise <= 0.001) continue;
      }
      const hM = rise >= 1 ? hFull : hFull * rise;

      /* Project the ring twice, base and roof, THROUGH THE COEFFICIENTS.
         `proj.coeffs()` exists for exactly this loop — "pre-projection loops
         (rings, footprints, the surround) want the coefficients, not four
         trig calls per vertex". It also matters that `projb` RETURNS A NEW
         ARRAY: at the district camera this loop runs over 87,774 buildings
         and ~880,000 vertices, so calling it twice a vertex allocates 1.8
         million two-element arrays per rasterisation. Same arithmetic, no
         allocation, one scratch pair of buffers reused across buildings. */
      const bx = ringBuf(0, nv), by = ringBuf(1, nv);
      const tx = ringBuf(2, nv), ty = ringBuf(3, nv);
      const zBase = zg * f.proj.zex;
      const dh = hM * f.proj.zexb;
      for (let k = 0; k < nv; k++) {
        const wx = tb.vxw[oo + k];
        const wy = tb.vyw[oo + k];
        const px = cf.ax * wx + cf.ay * wy;
        const pyB = cf.bx * wx + cf.by * wy + zBase;
        const sxv = (px - f.cam.cx) * f.cam.scale + W / 2;
        bx[k] = sxv;
        by[k] = H / 2 - (pyB - f.cam.cy) * f.cam.scale;
        tx[k] = sxv; // screen x carries no height: `projb` adds it to p1 only
        ty[k] = H / 2 - (pyB + dh - f.cam.cy) * f.cam.scale;
      }
      // the projected width, which is what every gate below is measured in
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < nv; k++) {
        if (tx[k] < x0) x0 = tx[k];
        if (tx[k] > x1) x1 = tx[k];
        if (ty[k] < y0) y0 = ty[k];
        if (ty[k] > y1) y1 = ty[k];
      }
      const wpx = x1 - x0;
      if (wpx < 0.35) continue;

      // WHICH WALLS FACE THE READER. This kept the FAR side of every building in
      // the city, and it is the single fault behind five separate complaints:
      // roofs floating with no wall under them, "only the facade", window rows
      // painted onto roof planes, the city reading washed out, and buildings
      // reading flatter than the mock's.
      //
      // The winding was taken in SCREEN coordinates, and screen y is flipped
      // (`by[k] = H/2 - (...)`). A y-flip reverses the sign of a signed area, and
      // all 166,166 published rings are positive in world space — so `s2` was
      // always negative, `sgn` always -1, the ternary dead code, and
      // `if (dx * sgn <= 0) continue` kept `dx < 0`. The back walls.
      //
      // The reference culls in WORLD space against the outward normal
      // (`buildBldProj`, part3.html L1311-1325). Expanded against
      // `screen-x = cA*(xr - yr)` the two are algebraically the same test:
      //     (dx*nx + dy*ny) = -d(px) / (cA*L)
      // so its `UEVIS = 1` is exactly `screen dx > 0`. Production had the right
      // test with the wrong sign.
      //
      // Measured: 47.7% of the mock's visible wall area was hidden behind the
      // roof (41,223 of 78,792 px). `planeQuartile` is odd-symmetric in edge
      // direction (q -> 3-q), so the wrong edges also took the complementary
      // lambert bucket — dark faces removed, pale faces added, city-wide, which
      // is the "washed out" cast. Walls measured 410 px against the mock's 408:
      // the height was never wrong, the bottom half was simply not drawn.
      const sgn = 1;

      const wallCi = tb.wi[i];
      /* THE ROOF WEARS THE COVERING OF ITS OWN LAST RE-COVERING, not the
         photograph of 2026. `ERA_MEASURED` — the whole of the present era, the
         5.03 % the roll gives no use class, and every `FLAG_NOYEAR` footprint
         — falls through to `ri`, which is what the page drew before this. The
         `FLAG_NOYEAR` refusal is made by reading row 6, the null row, which is
         the same refusal `fi` makes four lines down on the same byte. */
      const uEra = (tb.u[i] & FLAG_NOYEAR) !== 0 ? 6 : tb.u[i] & USE_MASK;
      const eraCi = eraRoof[uEra * YR_N + tb.yr[i]];
      const roofCi = eraCi === ERA_MEASURED ? tb.ri[i] : eraCi;
      const hz = hazeIdx(f, tb.cx[i], tb.cy[i], hzLo, hzSpan);
      const dhPx = hM * kh;
      /* THE TINT — the ochre of new construction and the arrival ramp, off
         `colourLUT`'s own `NF1`-wide tables. `FLAG_NOYEAR` is not "1849": the
         roll dates 12,594 parcels to its own "not known", and treating those
         as a year put the Presidio in ochre in the mock's 1906 frame. A
         building the roll does not date takes tint 0 and no ochre. */
      const fi = (tb.u[i] & FLAG_NOYEAR) !== 0 ? 0 : tintIndex(iy - (1849 + tb.yr[i]), rise);
      const roofCol =
        roofNF[(((roofCi * HZL + hz) * NF1 + fi) << 2) + tb.rsh[i]] ?? "#9a9384";
      const wallO = ((wallCi * HZL + hz) * NF1 + fi) * 4;
      const near = wpx > NEAR_PX;

      /* ── THE SECOND SOLID, QUEUED ────────────────────────────────────
         488 buildings whose own published statistics say there is a mass
         standing above the plane this loop just drew, and 40 more the step
         model cannot see and the published CLASS can — a steeple is a handful
         of 50 cm cells. Queued for ALL THREE rungs, because the gate that
         matters is not the building's width but the cap's own lift: at
         whole-city zoom the Ferry Building's tower is 0.9 px wide and 5.0 px
         tall, and *a skyline is made of lifts, not of widths.* `drawStep`
         applies both floors itself. */
      const fslot = this.form ? this.form.slotOf[gid] : 0;
      if (fslot) {
        capQ.push({
          slot: fslot - 1, ux: tb.cx[i], uy: tb.cy[i], zg, h: hM, rise,
          roof: roofCol, wallO,
          ink: inkFor(roofCol, EDGE_SHADE),
        });
      }

      /* ── THE RECT RUNG: one path call, the whole silhouette ───────────
         `RECT_SCALE` is 0.0 — "settled: the rect tier is for motion only" — so
         off a gesture this never fires and the ladder starts at `QUAD_PX`.
         The rectangle is AREA-PRESERVING and at the building's own centre:
         a bounding box would thicken every building by ~30 % of its area and
         close up the streets between them. The extrusion is only added where
         it is worth a pixel — a two-storey house projects 0.5 px of wall here,
         and adding it to every rectangle turns the fabric into a vertical
         comb. Downtown keeps its rise. */
      if (f.cam.scale < RECT_SCALE || (f.moving && f.cam.scale < QUAD_SCALE)) {
        let ar = 0;
        for (let k = 0; k < nv; k++) {
          const k1 = (k + 1) % nv;
          ar += tx[k] * ty[k1] - tx[k1] * ty[k];
        }
        const [rw, rh] = areaRect(Math.abs(ar) / 2, x1 - x0, y1 - y0);
        const ex = dhPx > 1.5 ? dhPx : 0;
        batch(roofBatch, roofCol).rect(
          (x0 + x1) * 0.5 - rw * 0.5, (y0 + y1) * 0.5 - rh * 0.5 - ex, rw, rh + ex,
        );
        drawn++;
        continue;
      }

      /* ── THE QUAD RUNG: four of the building's OWN vertices ───────────
         Not a bounding box: leftmost, topmost, rightmost, bottommost are real
         vertices of the real footprint, so the shape keeps its orientation and
         its proportions and only loses detail between those four points. At
         `QUAD_PX` = 7 px — a San Francisco lot is 25 ft of frontage — there is
         nothing between them to lose. Decided PER BUILDING and not per zoom:
         keyed on the zoom alone it cut the corners off the big ones, and a
         school or an L-shaped apartment block came out a wedge. */
      let n4 = nv;
      if (wpx < QUAD_PX) {
        extremeQuad(tx, ty, nv, quad);
        for (let k = 0; k < 4; k++) {
          const q = quad[k];
          QBX[k] = bx[q]; QBY[k] = by[q];
          QTX[k] = tx[q]; QTY[k] = ty[q];
        }
        for (let k = 0; k < 4; k++) {
          bx[k] = QBX[k]; by[k] = QBY[k]; tx[k] = QTX[k]; ty[k] = QTY[k];
        }
        n4 = 4;
      }

      /* ── THE CONTACT SHADOW ───────────────────────────────────────────
         Thrown down-LEFT from the fixed upper-right key light. Without it a
         building floats; with it the fabric has depth at 4 px, and at street
         zoom it is the single loudest mark on the frame. Gated on `h > 2` and
         on `SHADOW_MIN_PX` of projected width, both the mock's. A near
         building's own shadow goes in the same band path: it is the same
         colour, and two translucent fills that cross composite twice. */
      if (hM > 2 && wpx > SHADOW_MIN_PX) {
        const [sox, soy] = shadowOffset(hM, f.cam.scale);
        if (!shadow) shadow = new Path2D();
        addContactShadow(shadow, bx, by, n4, sox, soy);
      }

      // ── the walls, back to front is not needed: one wall faces the camera
      if (dhPx >= WALL_MIN_PX) {
        /* the foot band, resolved ONCE for this building: its height is
           declared in world metres, so its drawn height is the same on every
           wall of the same building and the ramp is read on that. */
        const footBand = near ? FA_FOOT_M * kh : 0;
        const footW = near ? footWeight(footBand) : 0;
        for (let k = 0; k < n4; k++) {
          const k1 = (k + 1) % n4;
          const dx = tx[k1] - tx[k];
          if (dx * sgn <= 0) continue; // turned away from the camera
          const q = n4 === nv
            ? planeQuartile(
                tb.vxw[oo + k1] - tb.vxw[oo + k],
                tb.vyw[oo + k1] - tb.vyw[oo + k],
                cf.ax, cf.ay, lmax,
              )
            : 1;
          const col = lut.wallF[wallO + q] ?? "#c0b49a";
          if (!near) {
            const p = batch(wallBatch, col);
            p.moveTo(bx[k], by[k]);
            p.lineTo(bx[k1], by[k1]);
            p.lineTo(tx[k1], ty[k1]);
            p.lineTo(tx[k], ty[k]);
            p.closePath();
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(bx[k], by[k]);
          ctx.lineTo(bx[k1], by[k1]);
          ctx.lineTo(tx[k1], ty[k1]);
          ctx.lineTo(tx[k], ty[k]);
          ctx.closePath();
          const topY = Math.min(ty[k], ty[k1]);
          const botY = Math.max(by[k], by[k1]);
          /* `WA.wallpx` = 11 CSS px of WALL HEIGHT above which a wall carries
             its grade — `part3.html` L8973, `grad = WA.faces && dh >= WA.wallpx`.
             This port had `botY - topY > 6`: nobody's number, and not even the
             mock's QUANTITY — `botY - topY` is the wall quad's vertical extent,
             which is `dhPx` PLUS however far the base falls across the wall, so
             a long wall turned across the screen passed the test on its own
             footprint rather than on its height. The gate is the height; the
             gradient still spans the quad it fills. */
          ctx.fillStyle =
            dhPx >= WA.wallpx ? wallGrad(ctx, topY, botY, col) : col;
          ctx.fill();

          /* ── THE WALL'S OWN FOOT ────────────────────────────────────
             `SHADOW_FILL` lays a contact shadow ON THE GROUND and stops at
             the wall, so every building in the city met the pavement at a
             hard edge with the same value on it as three storeys up. This is
             the other half of a shadow the renderer already declares — see
             `facades.ts` §THE WALL'S OWN FOOT for why it is that and not an
             invented plinth. Drawn HERE, inside the wall loop, because this
             is the one place that already holds the wall's own lambert
             bucket: the band is a value of `col` and never a new colour.

             `footWeight` is a cut-off and a ramp on the band's OWN drawn
             height, so it opens with the camera and is not drawn at all
             where it cannot be resolved. Screen x carries no height, so the
             band is the wall quad with its top edge brought down. */
          if (footW > 0.002) {
            const bandK = Math.min(footBand, (by[k] - ty[k]) * FA_FOOT_CAP);
            const bandK1 = Math.min(footBand, (by[k1] - ty[k1]) * FA_FOOT_CAP);
            if (bandK > 0.05 && bandK1 > 0.05) {
              /* a FALLOFF and not a band: a rectangle of one darker value
                 with a hard top edge reads as a plinth, which is a claim
                 about the building. The gradient spans the quad it fills,
                 exactly as `wallGrad` does above it. */
              ctx.fillStyle = footGrad(
                ctx,
                Math.min(by[k] - bandK, by[k1] - bandK1),
                Math.max(by[k], by[k1]),
                footW,
              );
              ctx.beginPath();
              ctx.moveTo(bx[k], by[k]);
              ctx.lineTo(bx[k1], by[k1]);
              ctx.lineTo(bx[k1], by[k1] - bandK1);
              ctx.lineTo(bx[k], by[k] - bandK);
              ctx.closePath();
              ctx.fill();
            }
          }

          if (groups && dhPx >= FA_MIN_DH_PX && n4 === nv) {
            this.emitFace(
              f, groups, tb, tbe.face, i, k, k1, bx, by, nv, dhPx, q,
            );
          }
        }

        /* ── THE STOREY LINES, AND THEY HAD NEVER BEEN DRAWN ────────────
           `roofs.ts` exports `drawsStoreyLines`, `storeyBandPx`,
           `STOREY_MIN_PX` and `STOREY_W_PX`; `DRAW.md` §7 lists them; the
           suite asserts the cut-off — and no draw call read any of them. On a
           Financial District wall 130 px tall this is the only mark that says
           how many floors are behind it, and it is most of the difference
           between a tower and a pale slab. `part3.html` L8994.

           A CUT-OFF, NOT A SIZE FLOOR: a band under `STOREY_MIN_PX` is not
           drawn at all, never squeezed to a minimum — the distinction measured
           on `gszV`, where a floor made a landmark stop shrinking with the city
           under it. It does nothing in the Sunset, whose median house the roll
           counts as one storey, and the 8.7 % the roll does not count get
           none rather than a guess. */
        if (near && n4 === nv && wpx >= STOREY_W_PX) {
          const nst = storeysOf(
            tb.st[i],
            tbe.face ? ((tbe.face.fields.st2 as Uint8Array)[i] ?? 0) : 0,
          );
          if (nst > 1 && drawsStoreyLines(dhPx, nst)) {
            /* ── AND THE LINE IS DARKER THAN THE WALL IT IS ON ───────────
               This was one stroke of `wallF[wallO + 1]` over every visible
               wall, which is `part3.html` L8994 exactly (`W4[WO+1]`), so it
               is not a port defect — but bucket 1 is a FIXED bucket and the
               wall under it is not. `colourLUT` builds the four buckets at
               `0.66 + 0.1q`, monotone, so the same line is darker than a
               bucket-3 wall, INVISIBLE on a bucket-1 wall, and LIGHTER than
               a bucket-0 wall — one mark meaning three different things.

               MEASURED (`.parity/g1storey.py`), street camera, over every
               visible wall of every building past the storey gate, weighted
               by the wall's own drawn area:

                 camera        bucket 0    1      2      3
                 Marina         27.3 %   6.9 %  4.4 %  61.4 %
                 Mission        23.3 %   1.4 %  0.6 %  74.7 %
                 downtown        2.8 %   7.3 % 45.1 %  44.8 %

               So the line reads correctly on 45-75 % of the drawn wall area
               and inverts or vanishes on 5-34 % of it — and the inverted
               ones are the DARK walls, not the pale ones I had assumed.

               The fix is `STOREY_INK_V` — one step under WHATEVER plane the
               line is drawn on, which is what a floor line is: the shadow
               under a slab. `roofs.ts` has why the step is 0.88 and why it
               is not a bucket INDEX (index q-1 has nothing under bucket 0,
               and bucket 0 is a quarter of the drawn wall area here).
               Batched by the wall's own bucket into at most four paths, so a
               tower is four strokes and not four hundred. */
            ctx.lineWidth = 0.7;
            for (let q = 0; q < 4; q++) stLine[q] = null;
            for (let k = 0; k < nv; k++) {
              const k1 = (k + 1) % nv;
              if ((tx[k1] - tx[k]) * sgn <= 0) continue;
              const wq = planeQuartile(
                tb.vxw[oo + k1] - tb.vxw[oo + k],
                tb.vyw[oo + k1] - tb.vyw[oo + k],
                cf.ax, cf.ay, lmax,
              );
              let p = stLine[wq];
              if (!p) { p = new Path2D(); stLine[wq] = p; }
              for (let sn = 1; sn < nst; sn++) {
                const fy = (dhPx * sn) / nst;
                p.moveTo(bx[k], by[k] - fy);
                p.lineTo(bx[k1], by[k1] - fy);
              }
            }
            for (let q = 0; q < 4; q++) {
              const p = stLine[q];
              if (!p) continue;
              ctx.strokeStyle = shade(
                lut.wallF[wallO + q] ?? "#c0b49a", STOREY_INK_V,
              );
              ctx.stroke(p);
            }
          }
        }
      }

      // ── the roof
      if (!near) {
        const p = batch(roofBatch, roofCol);
        p.moveTo(tx[0], ty[0]);
        for (let k = 1; k < n4; k++) p.lineTo(tx[k], ty[k]);
        p.closePath();
        /* THE OUTLINE — a DARKER VALUE OF THE ROOF IT BOUNDS, at
           `EDGE_SHADE`, and it stops at `STROKE_MIN_PX_B` rather than 3. The
           same line in one fixed ink is invisible on the near-black tar roofs
           that are half of downtown and a wire on the pale stucco ones; and
           below 5 px an outline is not a division between two houses, it is an
           anti-aliased smear that greys the whole fabric. This is what the
           party-line layer left behind, and it is the thing that makes two
           neighbours of the same tone and height read as two houses. */
        if (wpx > STROKE_MIN_PX_B) {
          const st = batch(strokeBatch, inkFor(roofCol, EDGE_SHADE));
          st.moveTo(tx[0], ty[0]);
          for (let k = 1; k < n4; k++) st.lineTo(tx[k], ty[k]);
          st.closePath();
        }
        drawn++;
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(tx[0], ty[0]);
      for (let k = 1; k < n4; k++) ctx.lineTo(tx[k], ty[k]);
      ctx.closePath();
      ctx.fillStyle = roofCol;
      ctx.fill();

      /* THE OUTLINE, RAMPED ON THE BUILDING'S OWN WIDTH. Below `INK_PX0` this
         is the 0.7 px hairline at `EDGE_SHADE` the page has always drawn, so
         nothing at whole-city or district zoom moves. Above it the line opens
         to 1.5 px through two darker values of the same roof — which is the
         difference between a Financial District that reads as buildings and
         one that reads as a continuous slab of pale grey. The port drew 0.9 px
         at one value at every zoom; `buildings.ts` §"AND THE OUTLINE OPENS
         INTO A DRAWN LINE" has the measurement. */
      if (wpx >= STROKE_MIN_PX_A) {
        ctx.strokeStyle = edgeInk(roofCol, wpx);
        ctx.lineWidth = edgeWidth(wpx);
        ctx.stroke();
      }

      /* ── THE PITCHED CAP, ON THE POPULATION THE RECORD SUPPORTS ──────
         `palette.ts` §WHO IS PITCHED has the population and `roofs.ts` §THE
         PRE-FIRE CITY IS PITCHED has the measurement behind it. A cap that
         fires draws INSTEAD of the coping: a wood-frame roof has an eave, not
         a parapet, and drawing both would be two different buildings on one
         footprint. Under its own rise cut-off `drawHip` declines and the flat
         roof already filled above is what stands. */
      let hipped = false;
      if (
        n4 === nv &&
        isPitched(tb.u[i] & USE_MASK, 1849 + tb.yr[i], (tb.u[i] & FLAG_NOYEAR) !== 0)
      ) {
        hipped = drawHip(f, {
          bx: tx, by: ty,
          rx: subarrayOf(tb.vxw, oo, nv), ry: subarrayOf(tb.vyw, oo, nv),
          vo: 0, nv,
          k2, kh,
          cax: cf.ax, cay: cf.ay, cbx: cf.bx, cby: cf.by,
          ax: cf.ax, ay: cf.ay, lmax,
          roofColour: roofCol,
          ink: wpx >= STROKE_MIN_PX_A ? edgeInk(roofCol, wpx) : null,
        });
      }

      // ── the coping, when the roof is worth one
      const tw = hipped ? 0 : trayW(wpx);
      if (tw > 0 && n4 === nv) {
        drawTray(f, {
          bx: tx, by: ty,
          rx: subarrayOf(tb.vxw, oo, nv), ry: subarrayOf(tb.vyw, oo, nv),
          vo: 0, nv,
          outerVisible: (k) => (tx[(k + 1) % nv] - tx[k]) * sgn > 0,
          w: tw,
          k2,
          roofColour: roofCol,
        });
      }

      if (groups) {
        /* A CURTAIN WALL REFLECTS THE SKY INSTEAD OF SHOWING A ROOM, and this
           argument was hardcoded `false` — so every post-1950 office tower in
           the Financial District took the punched-opening value. See
           `faGlassy`. The era is the roll's and a footprint the roll does not
           date has none, exactly as `emitFace` reads it. */
        const era = (tb.u[i] & FLAG_NOYEAR) !== 0 ? -1 : faEra(1849 + tb.yr[i]);
        const ty = tbe.face
          ? ((tbe.face.fields.ty as Uint8Array)[i] ?? 0)
          : 0;
        flushFaces(f, groups, lut.wallF, wallO, era >= 0 && faGlassy(ty, era));
        resetGroups(groups);
      }
      drawn++;
    }
    // whatever is left of the near end, and every landmark nearer than it
    flushBand();
    while (hq < heroQ.n) this.drawOneHero(f, heroQ, hq++, fade, gain);
    ctx.restore();
    void coverageAlpha;
    void skylitN;
    return drawn + heroQ.n;
  }

  /**
   * THE LANDMARK FLUSH, AND WHY IT IS THE BUCKET FLOOR AND NOT THE DEPTH.
   *
   * A hero is drawn INSIDE this stream, at its own place in painter's order,
   * over the contact shadow the fabric has already thrown and under every
   * building that really is in front of it. That is the whole anti-float
   * argument: it is not composited over the city, it IS one of the city's own
   * draw calls, and it therefore inherits the aerial fade, the depth bucket and
   * the year gate *because those are properties of the call site.*
   *
   * The flush depth is `bucketFloor` and not the hero's own depth, and
   * `buildings.ts` records the measurement that settled it: inside one of the
   * 8,192 depth buckets the buildings are in Hilbert order, not depth order, so
   * a landmark keyed to its own exact depth fires at whichever bucket-mate
   * happens to come first and the fabric then paints its roof straight back
   * over it. **Moscone kept 0 % of its pixels against 93 %.**
   *
   * The hero's building is then SKIPPED when the stream reaches it, so the
   * prism is not drawn inside the drawing that replaced it.
   *
   * Nothing here is fabricated: the eleven heroes, their 127 parts, every ring,
   * profile, material index, cut-off and tilt come out of `base/heroes`, and a
   * hero whose published year is after the year on the clock is not drawn at
   * all — the prism draws instead, which is what stood there.
   */
  private heroQueue(
    f: Frame,
    t: TerrainField,
    ord: ReturnType<typeof streamOrder>,
    iy: number,
  ): HeroQueue {
    const lm = this.landmarkTable;
    const gids = new Set<number>();
    if (!lm || !lm.heroes.length || !this.layers.heroes) {
      return { n: 0, flushD: new Float64Array(0), items: [], gids, mat: [], mats: { mats: [] } };
    }
    if (!this.heroMats) this.heroMats = heroMaterials(lm.materials);
    const items: { hero: HeroData; zg: number }[] = [];
    const fd: number[] = [];
    for (const h of lm.heroes) {
      if (iy < h.year) continue; // the prism draws — that is what stood there
      /* AND THE FILM'S OWN SUBJECT IS NOT DRAWN TWICE. `filmHide` takes the
         footprint out of the fabric; without the same test here City Hall's
         drawn dome kept standing under the blue prism the film is raising on
         top of it, so the shot showed a finished building with a construction
         painted over it. Same rule, same set, both halves. */
      if (this.filmHide !== null && this.filmHide.has(h.bi)) { gids.add(h.bi); continue; }
      items.push({ hero: h, zg: t.elevM(h.ax, h.ay) });
      fd.push(bucketFloor(ord, f.proj.depth(h.ax, h.ay)));
      gids.add(h.bi);
    }
    const ix = items.map((_, k) => k).sort((a, b) => fd[b] - fd[a]);
    return {
      n: items.length,
      flushD: Float64Array.from(ix, (k) => fd[k]),
      items: ix.map((k) => items[k]),
      gids,
      mat: lm.materials,
      mats: this.heroMats,
    };
  }

  private drawOneHero(
    f: Frame, q: HeroQueue, k: number, fade: number, gain: number,
  ): void {
    const it = q.items[k];
    drawHero(f, it.hero, q.mat, q.mats, it.zg, {
      fade,
      haze: HAZE,
      /* THE FRAME'S OWN COVER GAIN, and the heroes were not drawn at it.
         `colourLUT` applies `COVER_GAIN[step]` to all 166,166 buildings and
         `heroMat` applies the same `g` to every hero; this port applied it to
         the fabric only, so at whole-city zoom every landmark stood 25 %
         brighter than the city around it. Passed in because nothing in
         `landmarks.ts` may read the camera — see `lmLOD`. */
      gain,
      rise: 1,
      // the year is P5's; with no clock running everything published is there
      year: undefined,
      family: null,
    });
  }

  /**
   * One wall's openings, into the shared face groups.
   *
   * Everything about the rhythm is `facades.ts`'s: the era from the roll year,
   * the band count from `faceWeights`, the opening's height and sill from
   * `openingInBand`. **No storey height is fitted here** — `FA_NO_FITTED_
   * FLOOR_HEIGHT` — and no uncounted storey is invented: a wall whose published
   * storey count is zero gets no bands and therefore no openings.
   */
  private emitFace(
    f: Frame,
    g: ReturnType<typeof newFaceGroups>,
    tb: BldTable,
    face: Chunk | null,
    i: number,
    k: number,
    k1: number,
    bx: Float64Array,
    by: Float64Array,
    nv: number,
    dhPx: number,
    q: number,
  ): void {
    const o = tb.off[i];
    const Lm = Math.hypot(
      tb.vxw[o + k1] - tb.vxw[o + k],
      tb.vyw[o + k1] - tb.vyw[o + k],
    );
    const Hm = roofHeight(tb.h[i], tb.hf[i]);
    const st2 = face ? ((face.fields.st2 as Uint8Array)[i] ?? 0) : 0;
    const storeys = storeysOf(tb.st[i], st2);
    if (storeys <= 0) return;
    const roles = face ? (face.fields.role as Uint8Array) : null;
    const role = roles ? (roles[o + k] ?? ROLE_FRONT) : ROLE_FRONT;
    if (!faceTakesOpenings(role)) return;

    const ex = bx[k1] - bx[k],
      ey = by[k1] - by[k];
    const wallPx = Math.hypot(ex, ey);
    if (wallPx < 3) return;

    /* THE ERA IS THE ROLL'S, AND A FOOTPRINT THE ROLL DOES NOT DATE HAS NONE.
       `FLAG_NOYEAR` is 12,594 parcels the roll marks "not known"; reading an
       era off 1849 + 0 gives them the 1906 vocabulary, which is a date the
       record does not hold. `faVocab` takes era < 0 as UNCLASSED. */
    const era = (tb.u[i] & FLAG_NOYEAR) !== 0 ? -1 : faEra(1849 + tb.yr[i]);
    const w = faceWeights({
      Lm, Hm, dhPx, wallPx, storeys, role,
      type: face ? ((face.fields.ty as Uint8Array)[i] ?? 0) : 0,
      era,
      shop: face ? ((face.fields.shop as Uint8Array)[i] ?? 0) === 1 : false,
      camScale: f.cam.scale,
    });
    if (w.bands <= 0) return;
    if (w.opening <= 0.002 && w.ground <= 0.002 && w.cornice <= 0.002 && w.bay <= 0.002) {
      return;
    }

    /* px per metre ALONG the wall and UP it. Everything below is stated in
       world metres and multiplied by one of these two, which is the whole
       reason this layer needs no stroke and no DPR decision: a feature is the
       size the camera makes it and nothing is clamped. */
    const hs = wallPx / Lm;
    const vs = dhPx / Hm;
    /* a rectangle ON the wall: `s` along the base in [0,1], `v` up in metres */
    const rect = (
      p: Path2D, s0: number, s1: number, v0: number, v1: number,
    ): void => {
      const ax = bx[k] + ex * s0, ay = by[k] + ey * s0;
      const cx = bx[k] + ex * s1, cy = by[k] + ey * s1;
      p.moveTo(ax, ay - v0 * vs);
      p.lineTo(cx, cy - v0 * vs);
      p.lineTo(cx, cy - v1 * vs);
      p.lineTo(ax, ay - v1 * vs);
      p.closePath();
    };

    const m = w.m;
    const fh = w.bandM;
    const isFront = role === ROLE_FRONT;
    const openP = w.opening > 0.002 ? faceGroupPath(g.open, q) : null;
    if (openP) faceGroupAlpha(g.aOpen, q, w.opening);
    const gndP = w.ground > 0.002 && w.gnd !== GND_AS_ABOVE
      ? faceGroupPath(g.shop, q) : null;
    if (gndP) faceGroupAlpha(g.aShop, q, w.ground);
    const litP = w.sill > 0.002 ? faceGroupPath(g.lit, q) : null;
    if (litP) faceGroupAlpha(g.aLit, q, w.sill);
    const barP = w.bar > 0.002 ? faceGroupPath(g.bar, q) : null;
    if (barP) faceGroupAlpha(g.aBar, q, w.bar);

    /* THE DOOR BAY IS THE ONE AGAINST THE PARTY WALL. Deterministic, off the
       measured role of the two edges either side of this one — a San Francisco
       row house puts its entry against the wall it shares, and where neither
       neighbour is a party edge the entry is in the middle bay. */
    const prevRole = roles ? (roles[o + ((k + nv - 1) % nv)] ?? ROLE_BACK) : ROLE_BACK;
    const nextRole = roles ? (roles[o + ((k + 1) % nv)] ?? ROLE_BACK) : ROLE_BACK;
    const db = doorBay(m, prevRole, nextRole);

    for (let fl = 0; fl < w.bands; fl++) {
      const y0 = fl * fh;
      const ground = fl === 0;

      if (ground && w.gnd === GND_SHOP) {
        /* ── THE SHOPFRONT ─────────────────────────────────────────────
           The published class says the ground floor is a shop, so it is
           glazed ACROSS the frontage from the pavement to its fascia, with a
           mullion at each bay. One band, not a row of punched holes, and that
           is the whole difference between a Mission blockface and a Sunset
           one. The glazing reaches `FA_SHOP_TOE` of the pavement rather than
           standing on the 0.42 m stallriser: at block zoom the ground floor is
           four pixels tall, the riser eats the bottom one, and the dark band
           then floats and reads as shadow under a house. The riser survives as
           a LIT LINE where there are pixels for it to be one in. */
        const top = y0 + fh - Math.min(FA_SHOP_FASCIA, fh * 0.24);
        const bot = y0 + Math.min(FA_SHOP_TOE, fh * 0.04);
        if (gndP && top - bot > 0.7) {
          const gap = 0.10 / Lm;
          rect(gndP, gap, 1 - gap, bot, top);
          if (litP) {
            const rz = y0 + Math.min(FA_SHOP_SILL, fh * 0.14);
            rect(litP, gap, 1 - gap, rz - Math.min(0.07, fh * 0.02), rz);
            rect(litP, gap, 1 - gap, top, top + Math.min(0.20, fh * 0.06));
            const mw = Math.max(0.045, 0.9 / Math.max(hs, 1e-3)) / Lm;
            for (let b = 1; b < m; b++) {
              const c = b / m;
              rect(litP, c - mw, c + mw, bot, top);
            }
          }
        }
        continue;
      }

      if (ground && w.gnd === GND_VEHICLE) {
        /* a warehouse or a garage: ONE wide low opening, at the door bay */
        if (gndP) {
          const c = (db + 0.5) / m, hw = w.gw / (2 * Lm);
          rect(gndP, c - hw, c + hw, y0 + 0.06, y0 + 0.06 + w.gh);
          if (litP) {
            rect(litP, c - hw, c + hw, y0 + 0.06 + w.gh,
                 y0 + 0.06 + w.gh + Math.min(0.18, fh * 0.05));
          }
        }
        continue;
      }

      if (!openP) {
        /* the ordinary opening has not arrived, but an ENTRANCE is a much
           bigger object and may have. Draw it and nothing else on this floor. */
        if (ground && w.gnd === GND_ENTRANCE && gndP) {
          const c = (db + 0.5) / m, dhw = w.gw / (2 * Lm);
          rect(gndP, c - dhw, c + dhw, y0 + 0.04, y0 + 0.04 + w.gh);
        }
        continue;
      }

      const leftover = fh - w.oh;
      if (leftover < 0.12) continue;
      const sill = w.sill_m;
      const hw = w.ow / (2 * Lm);
      for (let b = 0; b < m; b++) {
        const c = (b + 0.5) / m;
        if (ground && w.gnd === GND_ENTRANCE && b === db) {
          /* THE ENTRANCE. A door reaches the ground; a window does not. */
          if (!gndP) continue;
          const dhw = w.gw / (2 * Lm);
          rect(gndP, c - dhw, c + dhw, y0 + 0.04, y0 + 0.04 + w.gh);
          if (litP) {
            rect(litP, c - dhw * 1.14, c + dhw * 1.14, y0 + 0.04 + w.gh,
                 y0 + 0.04 + w.gh + Math.min(0.22, fh * 0.06));
          }
          continue;
        }
        rect(openP, c - hw, c + hw, y0 + sill, y0 + sill + w.oh);
        if (litP) {
          /* the SILL under it, and the LIT REVEAL down its LEFT jamb. The key
             light in this frame is upper-RIGHT — the same light every contact
             shadow is thrown from — so the jamb that faces it is the left one,
             and it is the only part of a recessed opening brighter than the
             wall. */
          rect(litP, c - hw * 1.16, c + hw * 1.16,
               y0 + sill - Math.min(0.15, fh * 0.045), y0 + sill);
          const rv = Math.max(0.035, 0.7 / Math.max(hs, 1e-3)) / Lm;
          rect(litP, c - hw, c - hw + rv, y0 + sill, y0 + sill + w.oh);
        }
        if (barP) {
          /* the glazing bar: one mullion and one meeting rail, which is what
             turns a dark rectangle into a window at street zoom */
          const bt = Math.max(0.035, 0.7 / Math.max(hs, 1e-3)) / Lm;
          rect(barP, c - bt, c + bt, y0 + sill, y0 + sill + w.oh);
          const rh = Math.max(0.03, 0.7 / Math.max(vs, 1e-3));
          rect(barP, c - hw, c + hw,
               y0 + sill + w.oh * 0.54 - rh, y0 + sill + w.oh * 0.54 + rh);
        }
      }
    }

    /* ── THE BAY, UNDER the openings so the openings sit IN it ─────────── */
    if (w.bay > 0.002) {
      const b0 = w.gnd === GND_ENTRANCE && m > 1 ? (db === 0 ? 1 : 0) : 0;
      const b1 = w.gnd === GND_ENTRANCE && m > 1 ? (db === m - 1 ? m - 1 : m) : m;
      if (b1 > b0) {
        /* THE RAMP IS ON THE BAY'S OWN RUN, NOT ON THE WHOLE WALL.
           `faceWeights` can only see the wall, so it returns the eligibility
           and the wall-wide ramp; the bay a house actually carries is the run
           of bays the entrance does not take, which on a two-bay Sunset front
           is ONE of them. Ramping it on the whole frontage opens it at half
           the size it earned. `part3.html` L1058: `faRamp((b1-b0)/m*wpx,
           FA.by0, FA.by1)`. */
        const aBay = faRamp(
          ((b1 - b0) / m) * wallPx, FA_RAMP.bay[0], FA_RAMP.bay[1],
        );
        const inset = Math.min(0.12, 0.5 / Math.max(1, m));
        const s0 = b0 / m + inset * 0.25, s1 = b1 / m - inset * 0.25;
        const v0 = fh, v1 = Hm - (w.hasCornice ? FA_CORN_M : 0.10);
        if (aBay > 0.002 && (v1 - v0) * vs >= 2.0) {
          const byP = faceGroupPath(g.bay, q);
          faceGroupAlpha(g.aBay, q, aBay);
          rect(byP, s0, s1, v0, v1);
          /* AND THE TWO MARKS THAT MAKE IT A PROJECTION RATHER THAN A PANEL:
             the shaded right cheek and the soffit under it, in the plane of
             the wall, at `FA_V.shad`. Without them a bay is a slightly lighter
             rectangle and reads as paint. */
          const shP = faceGroupPath(g.shad, q);
          faceGroupAlpha(g.aShad, q, aBay);
          const tw = Math.max(0.06, 0.9 / Math.max(hs, 1e-3)) / Lm;
          rect(shP, s1 - tw, s1, v0, v1);
          rect(shP, s0, s1, v0, v0 + Math.max(0.10, 1.1 / Math.max(vs, 1e-3)));
        }
      }
    }

    /* ── THE CORNICE ──────────────────────────────────────────────────
       Pre-1950 and a type that carries one, on a wall the footprint measures
       as a front. IN THE PLANE OF THE WALL: a band of the wall's own colour
       one value up, and the shadow it throws under itself. Nothing is added
       above the MEASURED top and the silhouette does not move. */
    if (w.cornice > 0.002 && isFront && Hm > FA_CORN_M * 2.4) {
      const cp = faceGroupPath(g.lit, q);
      faceGroupAlpha(g.aLit, q, w.cornice);
      rect(cp, 0, 1, Hm - FA_CORN_M, Hm);
      /* AND THE SHADOW IT THROWS UNDER ITSELF. `FA_CORN_T` — 0.14 m — has been
         exported by `facades.ts` since P3 and read by nothing, so the cornice
         was a pale band with no depth. `part3.html` L1082. */
      const sp = faceGroupPath(g.shad, q);
      faceGroupAlpha(g.aShad, q, w.cornice);
      rect(sp, 0, 1, Hm - FA_CORN_M - FA_CORN_T, Hm - FA_CORN_M);
    }
  }
}

// ═══ helpers ═══════════════════════════════════════════════════════════════

/** the storey lines of ONE building, bucketed by the wall's own lambert so
 *  each bucket is one stroke. Four entries, reused across buildings. */
const stLine: (Path2D | null)[] = [null, null, null, null];

/** `drawCentrelines` takes the surface cells as `_cells` and does not read
 *  them; the line layer does not depend on the surface having resolved. */
const EMPTY_CELLS: readonly StreetCell[] = [];

/** four scratch vertex buffers, grown on demand and reused across buildings */
const RING_BUFS: Float64Array[] = [
  new Float64Array(64), new Float64Array(64),
  new Float64Array(64), new Float64Array(64),
];
function ringBuf(i: number, n: number): Float64Array {
  if (RING_BUFS[i].length < n) RING_BUFS[i] = new Float64Array(n * 2);
  return RING_BUFS[i];
}

/** the four-extreme-vertex rung's scratch: the indices, and the quad it picks
 *  out, held aside so the ring buffers can be overwritten in place */
const QUAD_IX = new Int32Array(4);
const QBX = new Float64Array(4), QBY = new Float64Array(4);
const QTX = new Float64Array(4), QTY = new Float64Array(4);

/**
 * The `face` chunk that mirrors a `bldg` chunk, row for row.
 *
 * Exactly two key shapes exist in the catalogue — `base/solo` and `bldg/<cell>`
 * — and anything else returns null rather than a guess. A regex that only
 * rewrote the `bldg/` prefix mapped `base/solo` to ITSELF, and the loop then
 * read the building chunk's own `gid`/`cnt`/`vx` where it expected
 * `st2`/`role`. It threw on the first frame at block zoom, which is the good
 * outcome; the bad one is the version of that mistake that returns a number.
 */
function faceKeyFor(key: string): string | null {
  if (key === "base/solo") return "base/solo-face";
  if (key.startsWith("bldg/")) return "face/" + key.slice(5);
  return null;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function subarrayOf(a: Float32Array, o: number, n: number): Float32Array {
  return a.subarray(o, o + n);
}

function resetGroups(g: ReturnType<typeof newFaceGroups>): void {
  for (let i = 0; i < 4; i++) {
    g.open[i] = null;
    g.bar[i] = null;
    g.lit[i] = null;
    g.bay[i] = null;
    g.shop[i] = null;
    g.shad[i] = null;
    g.aOpen[i] = 0;
    g.aBar[i] = 0;
    g.aLit[i] = 0;
    g.aBay[i] = 0;
    g.aShop[i] = 0;
    g.aShad[i] = 0;
  }
}

function isLandOf(sg: SurroundGrid, i: number, j: number): boolean {
  const s = sg as SurroundGrid & { isLand?: (i: number, j: number) => boolean };
  return s.isLand ? s.isLand(i, j) : false;
}

/**
 * The frame's aerial fade, read off log z and QUANTISED TO A 64th.
 *
 * It used to be three values by `cam.step`, so a third of the whole frame's
 * depth cue changed on the single frame the band flipped — and the band flips
 * in the middle of a zoom. Continuous in z, quantised for the cache key: under
 * a 64th of a blend is not a step anybody can see, and quantising is what keeps
 * `colourLUT()` a cache hit instead of a rebuild per frame.
 */
function fadeAmt(f: Frame): number {
  const z = zOf(f.cam);
  const l = Math.log(Math.max(1, z)) / Math.log(12);
  const v = 0.17 + (0.06 - 0.17) * Math.min(1, l);
  return Math.round(v * 64) / 64;
}

/**
 * THE HAZE WAS ON THE WRONG END OF THE CITY — AGAIN.
 *
 * `part3.html`'s Block M note records finding exactly this in its own fabric
 * tier and fixing it: *"bx = 0 is the horizon and bx = BANDS is the reader's
 * feet ... `dn = bx/BANDS` therefore put the MAXIMUM haze on the NEAREST
 * buildings and none at all on the far ones — the opposite of aerial
 * perspective, and the reason turning fadeAmt up made the foreground recede
 * instead of the background."*
 *
 * This port had the same inversion, in the only place it computes the index:
 *
 * ```
 *   d = depth(x, y)                       LARGER d is FARTHER — `buildBldOrder`
 *   t = (d + 12000) / 24000               buckets on (hi - d) and draws bucket 0
 *   hz = round((1 - t) * 15)              first, which is the horizon
 * ```
 *
 * so `hz`, which `colourLUT` blends toward `HAZE` in proportion to, was LARGEST
 * on the nearest buildings.
 *
 * And the two numbers under it were nobody's. `part3.html` L8945 is
 * `((dpt - dlo)/dspan)^2.5 * (HZL-1) | 0` — normalised over the city's OWN
 * depth range and on a 2.5 power, so the haze is concentrated at the far end
 * where aerial perspective puts it. A fixed ±12,000 window is 24,000 plane
 * units against a city that spans about a third of that, so the sixteen steps
 * were being spent on depth the city does not occupy and the fabric came out
 * within two steps of flat.
 *
 * THE RANGE IS THE ASSESSOR BLOCKS' AND NOT THE BUILDINGS'. `buildBldOrder`
 * computes the buildings' own range, but only over the chunks that happen to be
 * held; the mock has all 166,166 centroids in memory and this client does not.
 * `base/blocks` is city-wide, always loaded, and its 5,404 centroids are the
 * same built extent — the substitution is stated rather than hidden, and the
 * bearing is fixed at 315° so the range is computed once.
 */
function hazeIdx(f: Frame, x: number, y: number, dlo: number, dspan: number): number {
  const t = (f.proj.depth(x, y) - dlo) / dspan;
  const z = (Math.pow(t < 0 ? 0 : t > 1 ? 1 : t, 2.5) * (HZL - 1)) | 0;
  return z < 0 ? 0 : z > HZL - 1 ? HZL - 1 : z;
}

/* `wallQuartile` WAS A THIRD FUNCTION FOR ONE QUANTITY. It ran
   `max(0, n · SUN)` clamped by `LAM0` — the terrain's world-space sun vector —
   while `landmarks.ts` was already running the reference's own rule on the
   projection's coefficients, and `roofs.ts` a third variant. Every wall turned
   away from the light took step 0 instead of spreading over 0 and 1, so a
   block of houses came out two values where the reference gives it four. See
   `planeQuartile` in `buildings.ts`. Deleted. */

/**
 * Flag the DEM cells a set of published rings covers.
 *
 * **ONE, NOT 255.** `TerrainField.node()` averages these over the four cells
 * meeting at a node and hands the mean to `terrainRGB` as `parkF`, a FRACTION
 * in [0,1] that weights two rows of the colour table. Writing 255 weights the
 * park row 255× and the ground comes outwhite — measured as hard white rectangles
 * scattered across Golden Gate Park, the Presidio and every playground, on the
 * first screenshot of this file.
 */
function markCells(t: TerrainField, rings: readonly Ring[], out: Uint8Array): void {
  const N = t.N;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const g0 = t.toGrid(x0, y0);
    const g1 = t.toGrid(x1, y1);
    const i0 = Math.max(0, Math.floor(g0[0]));
    const j0 = Math.max(0, Math.floor(g0[1]));
    const i1 = Math.min(N - 1, Math.ceil(g1[0]));
    const j1 = Math.min(N - 1, Math.ceil(g1[1]));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const x = t.proj.X0 + i * t.cellM;
        const y = t.proj.Y0 + j * t.cellM;
        if (inPoly(x, y, ring)) out[i * N + j] = 1;
      }
  }
}

export { HAZE, shade, drawShoreline, drawSurround, CityData, Projection };
export type { Frame, PlaceLabel };
