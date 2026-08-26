/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/pick.ts — WHICH BLOCK IS UNDER THE POINTER.

   ── WHY THIS IS NOT A GPU READBACK ────────────────────────────────────────
   A renderer with a depth buffer can pick by drawing object ids into an
   offscreen target and reading one pixel back, and that is the obvious answer
   here and the wrong one, for a reason that has nothing to do with cost: THE
   THING BEING PICKED IS NOT IN THE SCENE. The scene holds terrain, water,
   streets and 166,166 extruded footprints; the assessor's block rings are not
   drawn at all. A readback can only name something that was rasterised, so it
   would answer "footprint 91,204" and leave the block — the entity the reader
   is actually pointing at, the one a panel can be written about — still to be
   resolved on the CPU. Once that resolution has to exist, the readback is a
   pipeline stall bought for nothing. (On the WebGPU backend it is also
   asynchronous, so a hover would answer a frame late.)

   So this is the Canvas renderer's own hit test, ported: `scene.ts` §pick,
   its `blockHash`, its `blockSolid` and its right-of-way snap. Same march,
   same crossing rule, same answers — the two renderers must not disagree
   about what a reader just clicked.

   ── THE PIXEL IS A LINE, AND THAT IS THE WHOLE ALGORITHM ──────────────────
   `projection.ts` §THE PIXEL IS A LINE: height moves a point up the screen, so
   the world points that could project to ONE pixel form a straight line
   parameterised by z, and `invAt(px, py, z)` is a point on it. Larger z is
   nearer the camera at every bearing, so the march walks z DOWNWARD from above
   the city and takes the first solid it enters. `marchStepZ()` sizes the step
   — it holds a WORLD distance (`HIT_STEP_M`) fixed rather than a z increment,
   so the sampling density does not move when the band moves the exaggeration.

   ── AND WHY THE GROUND PLANE ALONE IS THE BUG ─────────────────────────────
   Intersecting at z = 0 and asking which ring contains the point answers with
   the ground BEHIND the building the reader clicked. Measured on the Canvas
   path (BUGS.md §1): at the block band the line runs 3.37 world metres per
   unit z and a metre of built height is 0.8 of a unit, so a 15 m storefront
   threw the answer 40 m up-street — most of a block. Only 38.0 % of the street
   frame answered at all, and the answers that came were block-shaped islands
   slid down-left off the blocks they belonged to.

   The fix is not a fudge factor: the march crosses the SOLIDS, in the order a
   ray from the camera meets them.

     · THE TALL FOOTPRINTS first (`base/solo` — 15,265 of them, everything the
       encoder judged too tall to fold into a block mean, up to 260 m). These
       are exactly the buildings the displacement is worst for.
     · THE BLOCK PRISM second: the published ring extruded to its own
       area-weighted mean height over the elevation at its centroid. Measured
       on this payload, that mean tops out at 19 m and sits at 7.4 — which is
       why the plate alone recovers only about half the displacement and the
       solos above it are not optional.
     · THE GROUND last, and only then plain ring containment.

   ── MEASURED, ON THE PAYLOAD THIS WAS WRITTEN AGAINST ─────────────────────
   This march was replayed offline against the shipped chunks over a flat
   ground, aiming one pick at each of the 5,404 blocks' own roof centres — the
   pixel a reader pointing at that block would use:

       ground plane only    90.4 %, and the world point it answers at is a
                            MEDIAN 18.9 m from the centroid it was aimed at,
                            p90 29.6 m — most of a street, systematically
                            up-street, which is the displacement drawn
       the block prism      96.3 %
       prism + tall roofs   93.9 %

   THE LAST ROW IS NOT A REGRESSION. The tall footprints OCCLUDE, so a low
   block whose roof centre stands behind a tower stops answering, and that is
   the correct answer to that pixel. What the pass removes is the error that
   scales with height, which the roof-centre test cannot show because it never
   aims at a tower's neighbour: a 260 m tower at the closest band sits 208
   units of z over its own ground and the line runs 3.37 world metres per unit,
   so a ground-plane pick anywhere on its roof answers about 700 m up-street.

   ── THE ONE CONVERSION THAT IS EASY TO GET WRONG ──────────────────────────
   `projb` puts ground elevation on ZEX and built height on ZEXB — two
   different art dials — while `invAt`, which the march inverts through, knows
   ZEX only. So a roof sits at an EQUIVALENT z of `elev + h · ZEXB / ZEX`, and
   that ratio is a function of the band (0.485 at the widest ZEX of 3.3, 0.8 at
   the closest of 2.0). Using `h` directly over-corrects the very displacement
   this is here to remove. Both dials are read live off the projection, which
   is what the engine's `setStep` moves, so the solids follow the band without
   anyone telling them.
   ═══════════════════════════════════════════════════════════════════════ */

import type { Chunk, CityData } from "@/lib/city/data";
import { CA, projection, screenToPlane } from "@/lib/city/projection";
import { roofHeight } from "@/lib/city/roofs";
import { decodeBldg, type BldgTable } from "./bldg";

export interface BlockPicker {
  /** the block index under a screen pixel, or null */
  at(
    sx: number,
    sy: number,
    cam: { cx: number; cy: number; scale: number },
    W: number,
    H: number,
  ): number | null;
  /** the ring of a block, world metres, for drawing a highlight */
  ringOf(block: number): readonly (readonly [number, number])[] | null;
  dispose(): void;
}

/**
 * THE BLOCK GRID'S CELL, IN METRES.
 *
 * Measured on the published ring table: the median block's bounding box is
 * 110 × 133 m and the median ring has 4 vertices. At 160 m most blocks file
 * into one or two cells, and the handful of enormous ones — a park boundary
 * is one ring with several hundred vertices — file into a few hundred, which
 * is what their bounding box is worth. Smaller cells would buy nothing on the
 * median and cost the tail its own bucket list.
 */
const BLOCK_CELL_M = 160;

/** The footprint grid's cell. A tall footprint is tens of metres, not
 *  hundreds, so it wants a finer grid than the blocks do. */
const FOOT_CELL_M = 40;

/**
 * THE POINTER TOLERANCE FOR THE RIGHT-OF-WAY SNAP, in SCREEN pixels.
 *
 * A guard rather than a dial: it exists so that a zoom deeper than the
 * descriptor's own stops cannot turn the world bound below into a snap the
 * reader can watch happening. The world bound governs everywhere else.
 */
const SNAP_PX = 18;

/**
 * THE SAME SNAP, IN WORLD METRES, AS A FRACTION OF THE CITY'S OWN BLOCK.
 *
 * The quantity wanted here is half a street's right of way — reach the centre
 * line of the roadway a reader clicked and no further. That is a number about
 * a city's street standard, and this file is not allowed to know one, so it is
 * taken as a fixed fraction of the MEDIAN BLOCK'S OWN √area: a street is a
 * roughly constant share of the block pitch it separates, and the block table
 * states the pitch.
 *
 * THE CHECK, because a structural ratio still has to land somewhere real:
 * measured over all 5,404 rings of the payload the Canvas renderer's own bound
 * was hand-set for, the median √area is 102.4 m, so this gives 10.2 m against
 * that renderer's 10.5 m — 0.976 of a value derived from a published street
 * width. Nothing about the derivation was tuned to hit it.
 */
const SNAP_FRAC_OF_BLOCK = 0.1;

/**
 * SLACK ON THE MARCH'S TWO ENDS, in metres of z.
 *
 * The ceiling and the floor are found by sampling the ground on the pick
 * grid's own lattice, which is coarser than any DEM this will read, so the
 * extremes it finds bound the SAMPLED POINTS and not the surface. Starting
 * above the highest sample and ending below the lowest costs a few march steps
 * and removes the failure mode that matters: a ray that starts BELOW the
 * ground crosses it on its first sample and answers with a world point far
 * up-street from the pointer.
 */
const MARCH_SLACK_M = 40;

/** `footUnder`'s second answer: a footprint stands here and the assessor puts
 *  it on no block. It occludes — see the call site. */
const OFF_BLOCK = -2;

/** A uniform grid over a set of bounding boxes, CSR. */
interface Grid {
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly nx: number;
  readonly ny: number;
  /** length nx·ny + 1 */
  readonly start: Uint32Array;
  readonly items: Int32Array;
}

/** The published block rings, decoded once. */
interface Rings {
  readonly n: number;
  /** `off[i]..off[i+1]` indexes `rx`/`ry` for block i */
  readonly off: Uint32Array;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly bx0: Float32Array;
  readonly by0: Float32Array;
  readonly bx1: Float32Array;
  readonly by1: Float32Array;
  /** √area of the median ring, metres — the city's own block pitch */
  readonly medianSpanM: number;
}

/** The tall footprints, filed under their bounding boxes and their blocks. */
interface Solos {
  readonly t: BldgTable;
  readonly grid: Grid;
  readonly bx0: Float32Array;
  readonly by0: Float32Array;
  readonly bx1: Float32Array;
  readonly by1: Float32Array;
  /** ground elevation at the centroid, and the roof above it, both metres */
  readonly elev: Float32Array;
  readonly hM: Float32Array;
  /** the block whose ring contains this footprint's centroid, or −1 */
  readonly blk: Int32Array;
  /** the roof in the march's own units, rebuilt when the band moves */
  readonly topZ: Float32Array;
  max: number;
  kh: number;
}

/**
 * POINT IN RING, THE CROSSING RULE, READ STRAIGHT OFF THE TYPED ARRAYS.
 *
 * Even-odd crossings, so a ring that is not convex — and almost none of them
 * are: an assessor block wraps around alleys, courtyards and a park boundary
 * that folds back on itself several hundred times — is handled by
 * construction rather than by a convexity assumption that would quietly hold
 * for the rectangles and fail on the interesting ones.
 *
 * It takes the arrays and an index rather than an array of pairs because the
 * march runs it once per step per candidate, and one allocation of
 * `[number, number][]` per candidate per click is the whole cost of the test.
 */
function ringHit(
  off: Uint32Array,
  rx: Float32Array,
  ry: Float32Array,
  i: number,
  x: number,
  y: number,
): boolean {
  const o = off[i];
  const m = off[i + 1] - o;
  if (m < 3) return false;
  let inside = false;
  for (let a = 0, b = m - 1; a < m; b = a++) {
    const xi = rx[o + a];
    const yi = ry[o + a];
    const xj = rx[o + b];
    const yj = ry[o + b];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** squared distance from a point to a segment — the snap's own measurement */
function segDist2(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
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

/**
 * The standard CSR bucket build: count, prefix-sum, scatter. Every item is
 * filed under each cell its bounding box covers, and an EMPTY box — the
 * sentinel a degenerate ring gets below — is filed nowhere at all, which is
 * what keeps it out of every candidate list without a second flag to check.
 */
function buildGrid(
  cell: number,
  n: number,
  bx0: Float32Array,
  by0: Float32Array,
  bx1: Float32Array,
  by1: Float32Array,
): Grid {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!(bx1[i] >= bx0[i])) continue;
    if (bx0[i] < x0) x0 = bx0[i];
    if (by0[i] < y0) y0 = by0[i];
    if (bx1[i] > x1) x1 = bx1[i];
    if (by1[i] > y1) y1 = by1[i];
  }
  if (!(x1 > x0) || !(y1 > y0)) {
    x0 = 0;
    y0 = 0;
    x1 = 1;
    y1 = 1;
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1);
  const ny = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
  const at = (v: number, lo: number, nn: number): number =>
    Math.max(0, Math.min(nn - 1, Math.floor((v - lo) / cell)));
  const start = new Uint32Array(nx * ny + 1);
  for (let i = 0; i < n; i++) {
    if (!(bx1[i] >= bx0[i])) continue;
    const i0 = at(bx0[i], x0, nx);
    const i1 = at(bx1[i], x0, nx);
    const j0 = at(by0[i], y0, ny);
    const j1 = at(by1[i], y0, ny);
    for (let j = j0; j <= j1; j++)
      for (let ii = i0; ii <= i1; ii++) start[j * nx + ii + 1]++;
  }
  for (let k = 0; k < nx * ny; k++) start[k + 1] += start[k];
  const items = new Int32Array(start[nx * ny]);
  const cur = Uint32Array.from(start.subarray(0, nx * ny));
  for (let i = 0; i < n; i++) {
    if (!(bx1[i] >= bx0[i])) continue;
    const i0 = at(bx0[i], x0, nx);
    const i1 = at(bx1[i], x0, nx);
    const j0 = at(by0[i], y0, ny);
    const j1 = at(by1[i], y0, ny);
    for (let j = j0; j <= j1; j++)
      for (let ii = i0; ii <= i1; ii++) items[cur[j * nx + ii]++] = i;
  }
  return { cell, x0, y0, nx, ny, start, items };
}

/**
 * `base/blocks` → rings in world metres.
 *
 * THE QUANTUM IS `(1 << sc) / 10`, AND IT MULTIPLIES. `sc` is a per-block
 * power-of-two EXPONENT and the deltas are tenths of that unit, so a vertex is
 * `ox + vx · 2^sc / 10`. Read as `1 / (1 << sc)` — which is what "a
 * power-of-two quantiser" sounds like — the rings come out hundreds of times
 * too large and every pick answers with whichever slab happens to cover the
 * bay. `overlay.ts` §hoodColumns and `scene.ts` §decodeBlocks have both paid
 * for this one; it is the third time it is being written down.
 */
function decodeRings(chunk: Chunk): Rings | null {
  const f = chunk.fields;
  const cnt = f.cnt as Uint16Array | undefined;
  const sc = f.sc as Uint8Array | undefined;
  const ox = f.ox as Float32Array | undefined;
  const oy = f.oy as Float32Array | undefined;
  const dvx = f.vx as Int16Array | undefined;
  const dvy = f.vy as Int16Array | undefined;
  if (!cnt || !sc || !ox || !oy || !dvx || !dvy) return null;

  const n = cnt.length;
  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const rx = new Float32Array(off[n]);
  const ry = new Float32Array(off[n]);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  const bx0 = new Float32Array(n);
  const by0 = new Float32Array(n);
  const bx1 = new Float32Array(n);
  const by1 = new Float32Array(n);
  const span = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const o = off[i];
    const m = cnt[i];
    const q = (1 << sc[i]) / 10;
    let mnx = Infinity;
    let mny = Infinity;
    let mxx = -Infinity;
    let mxy = -Infinity;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < m; k++) {
      const x = ox[i] + dvx[o + k] * q;
      const y = oy[i] + dvy[o + k] * q;
      rx[o + k] = x;
      ry[o + k] = y;
      sx += x;
      sy += y;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (y < mny) mny = y;
      if (y > mxy) mxy = y;
    }
    cx[i] = m ? sx / m : ox[i];
    cy[i] = m ? sy / m : oy[i];
    if (m < 3) {
      /* an EMPTY box, deliberately inverted: `buildGrid` files it nowhere and
         every bbox reject below fails it, so a degenerate ring is unpickable
         without a sentinel anyone has to remember to test */
      bx0[i] = 1;
      by0[i] = 1;
      bx1[i] = -1;
      by1[i] = -1;
      continue;
    }
    bx0[i] = mnx;
    by0[i] = mny;
    bx1[i] = mxx;
    by1[i] = mxy;
    /* the ring's own shoelace, for the snap's block pitch. Cross-checked
       against the chunk's published `a` column: they agree to 5e-5 over all
       5,404 rings, so this reads the geometry rather than depending on a
       column a city's encoder may not have written. */
    let ar = 0;
    for (let k = 0; k < m; k++) {
      const k1 = o + ((k + 1) % m);
      ar += rx[o + k] * ry[k1] - rx[k1] * ry[o + k];
    }
    span[i] = Math.sqrt(Math.abs(ar) / 2);
  }

  const spans = Array.from(span).filter((v) => v > 0).sort((a, b) => a - b);
  const medianSpanM = spans.length ? spans[spans.length >> 1] : 0;
  return { n, off, rx, ry, cx, cy, bx0, by0, bx1, by1, medianSpanM };
}

/**
 * EACH BLOCK'S OWN MEAN BUILT HEIGHT, from the LAST row of its timeline.
 *
 * `base/massing` is a per-block series of (year, coverage, mean height) rows;
 * the last row is the present, which is the city this engine draws. There is
 * no year here on purpose — the film's year gate belongs to the layer that
 * hides geometry, and a hit test that answered a different block from the one
 * on screen would be worse than one that is a few metres short.
 *
 * A city that ships no massing chunk loses only the prism: the march still
 * crosses the tall footprints and then the ground, so the picker degrades to
 * the Canvas renderer's first cut rather than failing.
 */
function blockHeights(data: CityData, n: number): Float32Array | null {
  const chunk = data.get("base/massing");
  if (!chunk) return null;
  const off = chunk.fields.off as Uint32Array | undefined;
  const th = chunk.fields.th as Uint8Array | undefined;
  if (!off || !th || off.length !== n + 1) return null;
  const out = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    const e = off[b + 1];
    if (e > off[b]) out[b] = th[e - 1];
  }
  return out;
}

export function blockPicker(
  data: CityData,
  opts: { elevAt(x: number, y: number): number },
): BlockPicker | null {
  const chunk = data.get("base/blocks");
  if (!chunk) return null;
  const r = decodeRings(chunk);
  if (!r || r.n === 0) return null;

  const grid = buildGrid(BLOCK_CELL_M, r.n, r.bx0, r.by0, r.bx1, r.by1);

  /* the block prism's two halves, both fixed: the ground it stands on and the
     mean height on top of it. Only the ratio between the two exaggerations
     moves, so the metres are measured once here and the z is rebuilt below. */
  const gElev = new Float32Array(r.n);
  for (let i = 0; i < r.n; i++) gElev[i] = opts.elevAt(r.cx[i], r.cy[i]);
  const gH = blockHeights(data, r.n);

  /* ── THE MARCH'S CEILING AND FLOOR, SAMPLED RATHER THAN ASSUMED ─────────
     A constant here would be a fact about one city's terrain. The ground is
     instead sampled on the pick grid's own lattice — one call per cell,
     thousands of them, once — and the march runs between what it found plus
     the slack above. */
  let gMin = Infinity;
  let gMax = -Infinity;
  for (let j = 0; j < grid.ny; j++) {
    const y = grid.y0 + (j + 0.5) * grid.cell;
    for (let i = 0; i < grid.nx; i++) {
      const e = opts.elevAt(grid.x0 + (i + 0.5) * grid.cell, y);
      if (e < gMin) gMin = e;
      if (e > gMax) gMax = e;
    }
  }
  if (!Number.isFinite(gMin)) gMin = 0;
  if (!Number.isFinite(gMax)) gMax = 0;

  let disposed = false;

  /* the prism tops in march units, rebuilt when the band moves the ratio */
  const bTop = new Float32Array(r.n);
  let bTopMax = -Infinity;
  let bTopKh = Number.NaN;
  const blockSolid = (kh: number): number => {
    if (bTopKh === kh) return bTopMax;
    bTopMax = -Infinity;
    for (let i = 0; i < r.n; i++) {
      const v = gElev[i] + (gH ? gH[i] * kh : 0);
      bTop[i] = v;
      if (v > bTopMax) bTopMax = v;
    }
    bTopKh = kh;
    return bTopMax;
  };

  /**
   * The block whose ring contains this world point, or −1.
   *
   * With `top` supplied this is the SOLID test: the point must be inside the
   * ring AND the ray must have descended to or below that block's built top,
   * so the answer is the first prism the line enters. With `top` null it is
   * plain ground containment.
   *
   * AN ARROW RATHER THAN A `function`, and not as a style: a hoisted
   * declaration is created before `r`'s null check runs, so TypeScript cannot
   * carry the narrowing into it and every `r.` inside becomes an error. A
   * `const` closure written after the check keeps it.
   */
  const blockUnder = (
    x: number,
    y: number,
    top: Float32Array | null,
    z: number,
  ): number => {
    const ii = Math.floor((x - grid.x0) / grid.cell);
    const jj = Math.floor((y - grid.y0) / grid.cell);
    if (ii < 0 || jj < 0 || ii >= grid.nx || jj >= grid.ny) return -1;
    const c = jj * grid.nx + ii;
    for (let k = grid.start[c]; k < grid.start[c + 1]; k++) {
      const i = grid.items[k];
      if (x < r.bx0[i] || x > r.bx1[i] || y < r.by0[i] || y > r.by1[i]) continue;
      if (top && top[i] < z) continue;
      if (ringHit(r.off, r.rx, r.ry, i, x, y)) return i;
    }
    return -1;
  };

  /* ── THE TALL FOOTPRINTS, RESOLVED LAZILY ─────────────────────────────
     `base/solo` is a base-tier chunk and is normally in hand before anything
     is pickable, but the picker may be built the moment the block table lands.
     So it is retried — a map lookup — until it appears, rather than being
     missing for the life of the page because of one frame's ordering. */
  let solos: Solos | null = null;
  const soloTable = (): Solos | null => {
    if (solos) return solos;
    const sc = data.get("base/solo");
    if (!sc) return null;
    const t = decodeBldg(sc);
    if (t.n === 0) return null;
    const bx0 = new Float32Array(t.n);
    const by0 = new Float32Array(t.n);
    const bx1 = new Float32Array(t.n);
    const by1 = new Float32Array(t.n);
    const elev = new Float32Array(t.n);
    const hM = new Float32Array(t.n);
    const blk = new Int32Array(t.n);
    for (let i = 0; i < t.n; i++) {
      const o = t.off[i];
      const m = t.off[i + 1] - o;
      if (m < 3) {
        bx0[i] = 1;
        by0[i] = 1;
        bx1[i] = -1;
        by1[i] = -1;
        blk[i] = -1;
        continue;
      }
      let mnx = Infinity;
      let mny = Infinity;
      let mxx = -Infinity;
      let mxy = -Infinity;
      for (let k = 0; k < m; k++) {
        const x = t.vx[o + k];
        const y = t.vy[o + k];
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
      }
      bx0[i] = mnx;
      by0[i] = mny;
      bx1[i] = mxx;
      by1[i] = mxy;
      elev[i] = opts.elevAt(t.cx[i], t.cy[i]);
      hM[i] = roofHeight(t.h[i], t.hf[i]);
      /* CONTAINMENT OF THE CENTROID AND NOTHING ELSE — the rule the published
         tables are joined by. Nearest-ring would file a pier or a barracks
         onto whichever block happens to be closest and invent a relation the
         assessor does not record. Measured on this payload: 1,452 of 15,265
         land on a ring and 13,813 do not, which is the shape of the city and
         not a defect of the join. */
      blk[i] = blockUnder(t.cx[i], t.cy[i], null, 0);
    }
    solos = {
      t,
      grid: buildGrid(FOOT_CELL_M, t.n, bx0, by0, bx1, by1),
      bx0,
      by0,
      bx1,
      by1,
      elev,
      hM,
      blk,
      topZ: new Float32Array(t.n),
      max: -Infinity,
      kh: Number.NaN,
    };
    return solos;
  };

  const soloSolid = (s: Solos, kh: number): number => {
    if (s.kh === kh) return s.max;
    let mx = -Infinity;
    for (let i = 0; i < s.t.n; i++) {
      const v = s.elev[i] + s.hM[i] * kh;
      s.topZ[i] = v;
      if (v > mx) mx = v;
    }
    s.max = mx;
    s.kh = kh;
    return mx;
  };

  /** the footprint the march has just entered, resolved to its block */
  const footUnder = (s: Solos, x: number, y: number, z: number): number => {
    const g = s.grid;
    const ii = Math.floor((x - g.x0) / g.cell);
    const jj = Math.floor((y - g.y0) / g.cell);
    if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) return -1;
    const c = jj * g.nx + ii;
    for (let k = g.start[c]; k < g.start[c + 1]; k++) {
      const i = g.items[k];
      if (s.topZ[i] < z) continue;
      if (x < s.bx0[i] || x > s.bx1[i] || y < s.by0[i] || y > s.by1[i]) continue;
      if (!ringHit(s.t.off, s.t.vx, s.t.vy, i, x, y)) continue;
      return s.blk[i] >= 0 ? s.blk[i] : OFF_BLOCK;
    }
    return -1;
  };

  /** the block whose ring edge is nearest this world point, within `tol` */
  const nearestRing = (x: number, y: number, tol: number): number => {
    if (!(tol > 0)) return -1;
    const i0 = Math.floor((x - tol - grid.x0) / grid.cell);
    const i1 = Math.floor((x + tol - grid.x0) / grid.cell);
    const j0 = Math.floor((y - tol - grid.y0) / grid.cell);
    const j1 = Math.floor((y + tol - grid.y0) / grid.cell);
    let best = tol * tol;
    let bi = -1;
    const seen = new Set<number>();
    for (let j = j0; j <= j1; j++) {
      if (j < 0 || j >= grid.ny) continue;
      for (let ii = i0; ii <= i1; ii++) {
        if (ii < 0 || ii >= grid.nx) continue;
        const c = j * grid.nx + ii;
        for (let k = grid.start[c]; k < grid.start[c + 1]; k++) {
          const i = grid.items[k];
          if (seen.has(i)) continue;
          seen.add(i);
          if (
            x < r.bx0[i] - tol || x > r.bx1[i] + tol ||
            y < r.by0[i] - tol || y > r.by1[i] + tol
          ) continue;
          const o = r.off[i];
          const m = r.off[i + 1] - o;
          if (m < 3) continue;
          for (let a = 0, b = m - 1; a < m; b = a++) {
            const d = segDist2(
              x, y,
              r.rx[o + b], r.ry[o + b],
              r.rx[o + a], r.ry[o + a],
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
  };

  return {
    at(sx, sy, cam, W, H) {
      if (disposed) return null;
      /* the two dials, read live: the engine's `setStep` moves ZEX through
         `projection.setBand`, and `invAt` below inverts through that same
         number. Caching either would put the hit test on a different band from
         the picture. */
      const zex = Math.max(1e-6, projection.zex);
      const kh = projection.zexb / zex;
      const plane = screenToPlane(sx, sy, W, H, cam);
      const dz = projection.marchStepZ();
      const bMax = blockSolid(kh);
      const s = soloTable();
      const sMax = s ? soloSolid(s, kh) : -Infinity;

      const z0 = Math.max(gMax + MARCH_SLACK_M, bMax, sMax) + dz;
      const zEnd = gMin - MARCH_SLACK_M;
      let hitX = 0;
      let hitY = 0;
      let found = false;
      for (let z = z0; z >= zEnd; z -= dz) {
        const w = projection.invAt(plane[0], plane[1], z);
        const wx = w[0];
        const wy = w[1];
        if (s && z <= sMax) {
          const b = footUnder(s, wx, wy, z);
          /* AN OFF-BLOCK FOOTPRINT OCCLUDES rather than being seen through.
             Letting the ray pass buys a few points of answer rate and buys
             them with the wrong block: the march covers of the order of a
             kilometre of world distance, so what is found behind a tall
             building is up to that far up-street from the pointer. A reader
             pointing at something the assessor files under no block is better
             told nothing than told about a block they cannot see. */
          if (b === OFF_BLOCK) return null;
          if (b >= 0) return b;
        }
        if (z <= bMax) {
          const b = blockUnder(wx, wy, bTop, z);
          if (b >= 0) return b;
        }
        if (opts.elevAt(wx, wy) >= z) {
          hitX = wx;
          hitY = wy;
          found = true;
          break;
        }
      }
      if (!found) return null;

      const b = blockUnder(hitX, hitY, null, 0);
      if (b >= 0) return b;

      /* ── THE RIGHT OF WAY, AND THE ONE SNAP THIS FILE ALLOWS ───────────
         The rings do not tile the city: they stop at the property line, and
         between them is the roadway — measured on the Canvas path, at the
         closest stop only 38 % of the visible GROUND is inside a ring. A
         reader who clicks the street has clicked something the block table has
         no polygon for, and answering nothing is not what they meant, because
         the block a street fronts is a real answer to a click on that street.
         Bounded twice, and both bounds do work: in SCREEN pixels so it stays a
         pointer tolerance and never grows as the reader zooms out, and in
         WORLD metres so at the widest camera — where one pixel is tens of
         metres — it collapses to nothing rather than dragging the water onto
         the nearest block. Outside both, the pick is still null. */
      const px = Math.max(1e-9, cam.scale * CA);
      const tol = Math.min(SNAP_FRAC_OF_BLOCK * r.medianSpanM, SNAP_PX / px);
      const snapped = nearestRing(hitX, hitY, tol);
      return snapped >= 0 ? snapped : null;
    },

    ringOf(block) {
      if (disposed || block < 0 || block >= r.n) return null;
      const o = r.off[block];
      const m = r.off[block + 1] - o;
      if (m < 3) return null;
      const out: [number, number][] = new Array(m);
      for (let k = 0; k < m; k++) out[k] = [r.rx[o + k], r.ry[o + k]];
      return out;
    },

    dispose() {
      disposed = true;
      solos = null;
    },
  };
}
