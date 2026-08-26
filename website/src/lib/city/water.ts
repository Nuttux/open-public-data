/**
 * water.ts — the bay, the shoal band, the NOAA depth plate, the shoreline.
 *
 * Block P3. Ported from `gen/part3.html` §THE WATER PLANE, §THE BAY PLATE,
 * §BLOCK M — THE SHORELINE IS NOT A STAIRCASE, §THE SHALLOWS ARE ONE
 * INTERPOLATED PLATE and §BLOCK DETAIL — THE BAY HAS A FLOOR, together with
 * `world/BLOCK-W.md` §6, `quality/BLOCK-Q.md` §2–2.2 and
 * `detail/BLOCK-DETAIL.md` §3.
 *
 * Three surfaces, three different guarantees, and they are kept apart:
 *
 *  - **the depth plate** is PUBLISHED — NOAA bathymetry, 846,819 water nodes,
 *    deepest 114.05 m, on a 4x refinement of the surround grid;
 *  - **the shoal band** is a DECLARED TREATMENT — a BFS distance from land,
 *    never a depth claim, and `detail/` measured exactly how far from one it is:
 *    `corr(distance-from-shore, log depth) = 0.303`, r2 = 0.092;
 *  - **the shoreline** is PUBLISHED — DataSF txuc-3kzm, simplified to 45 m.
 */

import type { Plane, Projection } from "./projection";
import type { Chunk } from "./data";
import {
  type Frame,
  type SurroundGrid,
  HAZE,
  WA,
  QF,
  RS,
  lerpHex,
  resTune,
  rgbHex,
  sx,
  sy,
  TerrainField,
  LOOK,
  zOf,
} from "./terrain";

/**
 * BLOCK W: the same two roles, deeper and greener.
 *
 * The bay was `#a2b9d8` against a shoal of `#b8cbe6` — 15 % and 20 % chroma,
 * a difference of 0.06 in value, which is why open water read as one flat
 * plane of paper-blue. The open bay goes down and toward teal, the shallows
 * come up and toward jade, and the pair now spans 0.20 of value instead of
 * 0.06.
 */
export const BAY_OPEN = "#87a6c6";
export const BAY_SHOAL = "#c6dce3";

/** distance from land, in cells, over which the shallows reach */
export const SHOAL_REACH = 18;

/** the alpha the shoal band reaches at the shore */
export const SHOAL_A0 = 0.74;

/**
 * world metres, land side / water side.
 *
 * The corridor is ASYMMETRIC, and the measurement is why. The land side only
 * has to cover where the raster falls SHORT of the line, which is at most one
 * 77 m cell. The water side has to cover where it runs PAST it, and that is
 * not one cell: the 77 m mask calls the whole pier field north of the Ferry
 * Building land, so the staircase reaches several hundred metres into the bay.
 * A symmetric 130 m band cut the near half of it and left the rest as loose
 * pale squares offshore.
 */
export const SHORE_IN = 130;
export const SHORE_OUT = 1100;

/** the bay plate's resolution while the camera is moving */
export const BAY_SS = 0.25;

// ── the published shoreline ─────────────────────────────────────────────────

export type Ring = readonly (readonly [number, number])[];

/** Decode `base/coast` — the published shoreline and the 1906 burn polygon. */
export function decodeCoast(chunk: Chunk): {
  coast: Ring[];
  burn: Ring[];
} {
  const read = (lenName: string, xyName: string): Ring[] => {
    const len = chunk.fields[lenName];
    const xy = chunk.fields[xyName];
    if (!len || !xy) return [];
    const out: Ring[] = [];
    let o = 0;
    for (let r = 0; r < len.length; r++) {
      const n = len[r];
      const ring: [number, number][] = new Array(n);
      for (let k = 0; k < n; k++) ring[k] = [xy[o + k * 2], xy[o + k * 2 + 1]];
      out.push(ring);
      o += n * 2;
    }
    return out;
  };
  return { coast: read("coastLen", "coastXY"), burn: read("burnLen", "burnXY") };
}

export function inPoly(x: number, y: number, poly: Ring): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      ins = !ins;
  }
  return ins;
}

/**
 * The published rings, as one path, at the terrain's own elevation.
 *
 * `Math.max(0.4, elev)` and not `elev`: the ring is drawn at sea level where
 * the DEM says the ground is under it, so the line never sinks into the water
 * plate it is bounding.
 */
export function coastRings(
  g: CanvasRenderingContext2D | Path2D,
  f: Frame,
  t: TerrainField,
  coast: readonly Ring[],
): void {
  // Path2D has no beginPath; when one is passed the caller owns the path's
  // lifetime. Feature-tested rather than `instanceof Path2D`, which does not
  // exist under vitest's node environment.
  if ("beginPath" in g) g.beginPath();
  for (const ring of coast) {
    for (let i = 0; i < ring.length; i++) {
      const x0 = ring[i][0],
        y0 = ring[i][1];
      const p = f.proj.proj(x0, y0, Math.max(0.4, t.elevM(x0, y0)));
      const x = sx(f, p),
        y = sy(f, p);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  }
}

/**
 * THE CREAM SHARDS IN THE BAY ARE THE CORNERS OF THIS CORRIDOR.
 *
 * Reported off the Fisherman's Wharf frame and owned by nobody: pale triangles
 * and hairlines scattered across the water off Pier 45 and Fort Mason. They
 * are not a fill rule and not the piers. **They are THE GAPS BETWEEN
 * CONSECUTIVE QUADS.**
 *
 * The corridor is one quad per coastline segment, offset along that segment's
 * own normal. Where the coast turns, the two quads sharing a vertex are offset
 * in two different directions, and on the outside of the turn they splay apart
 * and leave a pie wedge of radius `SHORE_OUT` centred on the vertex that no
 * quad covers. The even-odd repaint is clipped to this path, so whatever the
 * 53.8 m raster had painted inside that wedge survives — which is the cream
 * staircase the shore treatment exists to cut away.
 *
 * MEASURED over the published coastline (txuc-3kzm, simplified to 45 m), using
 * this function's own `wet` test so the count is of the corridor actually
 * built: **425 segments, 392 with a wet side, 368 shared vertices, and 164 OF
 * THEM OPEN A GAP.** Median turn 69.9 degrees, p90 166.9. At
 * `SHORE_OUT = 1100 m` the median wedge is 738,065 m2 — 860 m on a side. They
 * got worse, not better, when Block M widened the water side to 1100 m.
 *
 * THE FIX IS A CAP, NOT A CORNER FAN. Extending a segment's quad by `outM`
 * along **its own direction** at each end makes consecutive quads overlap, and
 * the overlap covers the whole wedge for any turn up to 180 degrees: a point
 * in the wedge at angle A from the current normal sits at `-t*sin(A)` along
 * the segment, which is inside `[-outM, 0]` for every `t <= outM`. So the
 * previous and current caps between them cover it. No extra vertices, no arcs,
 * no change to the number of subpaths, and the added area is along the coast
 * rather than away from it.
 *
 * THE CAP IS ONLY APPLIED WHERE THERE IS A NEIGHBOUR TO MEET. At the end of a
 * run — where `wet` stops qualifying segments, which is the San Mateo county
 * line — an unconditional 1100 m overrun would draw a blue seam along a land
 * border that the `wet` test was written to prevent.
 *
 * Q4 asserts it by putting a point in the middle of each wedge and asking the
 * corridor path whether it is inside: **159 wedges in frame, 159/159 covered
 * with the cap, 103/159 without it.**
 */
export function coastBand(
  g: CanvasRenderingContext2D | Path2D,
  f: Frame,
  coast: readonly Ring[],
  wet: (x: number, y: number) => number,
  inM: number,
  outM: number,
): number {
  let n = 0;
  const { W, H } = f;
  if ("beginPath" in g) g.beginPath();
  for (const ring of coast) {
    const RN = ring.length;
    // which segments are in the corridor at all, and on which side — computed
    // first, because the cap at a vertex needs to know about its neighbour
    const SG = new Int8Array(RN);
    for (let i = 0; i < RN; i++) {
      const a = ring[i],
        b = ring[(i + 1) % RN];
      let dx = b[0] - a[0],
        dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const nx = -dy,
        ny = dx;
      const mx = (a[0] + b[0]) * 0.5,
        my = (a[1] + b[1]) * 0.5;
      const wp = wet(mx + nx * outM, my + ny * outM);
      const wm = wet(mx - nx * outM, my - ny * outM);
      SG[i] = !wp && !wm ? 0 : wp ? 1 : -1;
    }
    for (let i = 0; i < RN; i++) {
      const a = ring[i],
        b = ring[(i + 1) % RN];
      let dx = b[0] - a[0],
        dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const nx = -dy,
        ny = dx;
      const sg = SG[i];
      if (!sg) continue;
      const ox = nx * outM * sg,
        oy = ny * outM * sg,
        ix = -nx * inM * sg,
        iy = -ny * inM * sg;
      const capA = QF.shore && SG[(i - 1 + RN) % RN] ? outM : 0;
      const capB = QF.shore && SG[(i + 1) % RN] ? outM : 0;
      const ax0 = a[0] - dx * capA,
        ay0 = a[1] - dy * capA,
        bx0 = b[0] + dx * capB,
        by0 = b[1] + dy * capB;
      const q0 = f.proj.proj(ax0 + ox, ay0 + oy, 0.4),
        q1 = f.proj.proj(bx0 + ox, by0 + oy, 0.4),
        q2 = f.proj.proj(bx0 + ix, by0 + iy, 0.4),
        q3 = f.proj.proj(ax0 + ix, ay0 + iy, 0.4);
      const X0 = sx(f, q0),
        Y0 = sy(f, q0),
        X1 = sx(f, q1),
        Y1 = sy(f, q1),
        X2 = sx(f, q2),
        Y2 = sy(f, q2),
        X3 = sx(f, q3),
        Y3 = sy(f, q3);
      // off-screen segments are dropped BEFORE they enter the path. At block
      // zoom that is most of the 425, and the clip region they would have added
      // is what the even-odd fill after it has to rasterise.
      if (
        (X0 < 0 && X1 < 0 && X2 < 0 && X3 < 0) ||
        (X0 > W && X1 > W && X2 > W && X3 > W) ||
        (Y0 < 0 && Y1 < 0 && Y2 < 0 && Y3 < 0) ||
        (Y0 > H && Y1 > H && Y2 > H && Y3 > H)
      )
        continue;
      g.moveTo(X0, Y0);
      g.lineTo(X1, Y1);
      g.lineTo(X2, Y2);
      g.lineTo(X3, Y3);
      g.closePath();
      n++;
    }
  }
  return n;
}

/**
 * The corner-cap geometry, isolated so the property can be asserted without a
 * canvas: does the union of the previous and current segment's capped quads
 * cover a point in the wedge?
 *
 * A point in the wedge at angle A from the current normal sits at
 * `-t*sin(A)` along the segment, which is inside `[-outM, 0]` for every
 * `t <= outM`.
 */
export function wedgeCovered(
  turnRad: number,
  t: number,
  outM: number,
  capped: boolean,
): boolean {
  if (t > outM) return false;
  const along = -t * Math.sin(Math.abs(turnRad));
  const reach = capped ? outM : 0;
  return along >= -reach - 1e-9;
}

// ── the under-fill ──────────────────────────────────────────────────────────

/**
 * …AND THE OTHER HALF OF THE SHARDS IS THE UNDER-FILL.
 *
 * Block M's note says the ground-tone under-fill "only shows in the sliver
 * where the raster falls SHORT of the published line". True of the open coast,
 * **false of the north waterfront**: the published ring wraps the whole pier
 * field, where the 53.8 m raster has no land at all, so the pass laid several
 * hundred thousand square metres of pale ground into open water and the
 * corridor then had to cut it back out. Two large fills fighting over the same
 * pixels, and the corner wedges decided who won.
 *
 * Stopped at source: the under-fill is clipped to the **land side** of the
 * same corridor — `SHORE_IN = 130 m`, its own stated bound, against a 53.8 m
 * cell — so it cannot reach the bay. Painted area of that pass at the
 * waterfront camera: **719,037 -> 80,860 px, -88.8 %.** (Q5.)
 */
export function drawShoreUnderfill(
  f: Frame,
  coast: readonly Ring[],
  wet: (x: number, y: number) => number,
  groundTone: string,
): void {
  const { ctx } = f;
  ctx.save();
  const clip = new Path2D();
  coastBand(clip, f, coast, wet, SHORE_IN, 0);
  ctx.clip(clip, "nonzero");
  const ring = new Path2D();
  for (const r of coast) {
    for (let i = 0; i < r.length; i++) {
      const p = f.proj.proj(r[i][0], r[i][1], 0.4);
      if (i) ring.lineTo(sx(f, p), sy(f, p));
      else ring.moveTo(sx(f, p), sy(f, p));
    }
    ring.closePath();
  }
  ctx.fillStyle = groundTone;
  ctx.fill(ring, "evenodd");
  ctx.restore();
}

// ── the shoal band ──────────────────────────────────────────────────────────

export interface ShoalField {
  /** BFS distance from the surround raster's own land bit, in cells */
  readonly dist: Int32Array;
  /** two passes of a separable 1-2-1 over that distance */
  readonly smooth: Float32Array;
  /** cells the two rasters disagree about, or that lie outside every ring */
  readonly hole: Uint8Array;
}

/**
 * THE BAY HAD NO DEPTH AND THE SHALLOWS HAD EIGHT OF THEM.
 *
 * The band was `(1 - d/8) * 0.85` on an INTEGER cell distance, so the water
 * was eight flat steps 84 m wide, and at the Wharf frame one step is 41 px:
 * the bay read as a pale blue chequerboard laid against a flat fill. Two
 * changes, both to the same field. It reaches further — 18 cells, about
 * 1.5 km, which is the distance over which the Bay actually shelves off this
 * shore — and it is SMOOTHED, two passes of a separable 1-2-1 over the integer
 * distance, so the alpha is continuous where the distance is not.
 *
 * Nothing is invented: the field is still the BFS distance from the surround
 * raster's own land bit, and only its resolution changes.
 */
export function buildShoal(
  XW: number,
  XH: number,
  isLand: (i: number, j: number) => boolean,
): { dist: Int32Array; smooth: Float32Array } {
  const d = new Int32Array(XW * XH).fill(999);
  const q: number[] = [];
  for (let k = 0; k < XW * XH; k++) {
    const i = k % XW,
      j = (k / XW) | 0;
    if (isLand(i, j)) {
      d[k] = 0;
      q.push(k);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h],
      i = k % XW,
      j = (k / XW) | 0;
    if (d[k] >= SHOAL_REACH + 2) continue;
    const nb: [number, number][] = [
      [i - 1, j],
      [i + 1, j],
      [i, j - 1],
      [i, j + 1],
    ];
    for (const [a, b] of nb) {
      if (a < 0 || b < 0 || a >= XW || b >= XH) continue;
      const kk = b * XW + a;
      if (d[kk] > d[k] + 1) {
        d[kk] = d[k] + 1;
        q.push(kk);
      }
    }
  }
  const n = XW * XH;
  let src = new Float32Array(n);
  for (let k = 0; k < n; k++)
    src[k] = Math.min(SHOAL_REACH, d[k] >= 999 ? SHOAL_REACH : d[k]);
  let dst = new Float32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < XH; j++)
      for (let i = 0; i < XW; i++) {
        const k = j * XW + i;
        dst[k] =
          ((i > 0 ? src[k - 1] : src[k]) +
            2 * src[k] +
            (i < XW - 1 ? src[k + 1] : src[k])) *
          0.25;
      }
    let t = src;
    src = dst;
    dst = t;
    for (let j = 0; j < XH; j++)
      for (let i = 0; i < XW; i++) {
        const k = j * XW + i;
        dst[k] =
          ((j > 0 ? src[k - XW] : src[k]) +
            2 * src[k] +
            (j < XH - 1 ? src[k + XW] : src[k])) *
          0.25;
      }
    t = src;
    src = dst;
    dst = t;
  }
  return { dist: d, smooth: src };
}

/**
 * THE 244 DARK RECTANGLES OFF AQUATIC PARK AND FORT MASON.
 *
 * The test used to be "inside a published coast ring", which is true of the
 * pier field north of the Ferry Building and FALSE of every cove — Aquatic
 * Park, the Marina lagoon, the Islais Creek channel. A cove is outside the ring
 * by construction, so those cells were not marked; the water-side repaint
 * painted them open bay and the shoal then skipped them.
 *
 * PROVED BY PAINTING IT. The first cut of this fix said "the two rasters
 * disagree" and it did NOT clear the rectangles: rendering the corridor's
 * even-odd fill in red and the shoal quads in green showed the shoal covering
 * the whole frame EXCEPT those cells, and they turn out to be cells BOTH
 * rasters call land. Aquatic Park and the Fort Mason cove are too small for a
 * 110 m grid and too small for a 53.8 m one; they exist only in the 45 m
 * published vector.
 *
 * So the test is the one the REPAINT ITSELF uses. The even-odd fill paints bay
 * exactly where a point is OUTSIDE every published ring, so the shoal has to
 * be laid back exactly there — plus the shipped case, inside the ring where
 * the city raster says water. A union of two published instruments, and
 * neither is overruled.
 */
export function buildShoalHoles(
  XW: number,
  XH: number,
  centre: (i: number, j: number) => [number, number],
  dist: Int32Array,
  coast: readonly Ring[],
  cityIsWater: (x: number, y: number) => boolean,
): Uint8Array {
  const h = new Uint8Array(XW * XH);
  let lo0 = 1e9,
    lo1 = 1e9,
    hi0 = -1e9,
    hi1 = -1e9;
  for (const ring of coast)
    for (const v of ring) {
      if (v[0] < lo0) lo0 = v[0];
      if (v[0] > hi0) hi0 = v[0];
      if (v[1] < lo1) lo1 = v[1];
      if (v[1] > hi1) hi1 = v[1];
    }
  for (let j = 0; j < XH; j++)
    for (let i = 0; i < XW; i++) {
      const k = j * XW + i;
      if (dist[k] !== 0) continue;
      const [x, y] = centre(i, j);
      if (x < lo0 || x > hi0 || y < lo1 || y > hi1) continue;
      let ip = false;
      for (const ring of coast)
        if (inPoly(x, y, ring)) {
          ip = true;
          break;
        }
      const cityWater = cityIsWater(x, y);
      if (QF.shore) {
        if (cityWater || !ip) h[k] = 1;
        continue;
      }
      if (!cityWater) continue;
      if (ip) h[k] = 1;
    }
  return h;
}

/**
 * THE SHALLOWS ARE ONE INTERPOLATED PLATE.
 *
 * The loop this replaces filled one quad per SURROUND cell — 110.01 x 139.15 m,
 * 67.5 x 49.3 px at the Embarcadero camera — at a per-cell `globalAlpha`, over
 * a third of the picture, on the one surface where a seam has nothing to hide
 * behind.
 *
 * It is also the one raster in the piece that is FLAT: every quad is projected
 * at z = 0. `proj()` is linear, so grid (i, j) -> screen is a plain affine map,
 * and the whole field can be laid down as a single RGBA plate under one
 * `transform()`. **One `drawImage` instead of 13,409 fills**, and it is
 * cheaper than what it replaces (161.5 -> 111.9 ms at whole city).
 *
 * THE ALPHA IS THE PUBLISHED FIELD, unchanged — the two-pass 1-2-1 smoothing
 * of the distance-to-shore, through the same smoothstep and the same 0.74.
 * (WA4: 13,066 nodes checked against a field recomputed from scratch, **worst
 * alpha delta 0 of 255**.)
 *
 * One thing IS added and it is a fill-in under opaque paint: a LAND cell on
 * the coast — skipped by the loop, so alpha 0 — would drag the shallows down
 * to nothing in the last half cell before the shore, which is exactly where
 * they are strongest. A coastal land cell therefore carries the alpha the
 * water at its own edge carries (d = 0), and every pixel of it is painted over.
 *
 * AND IT IS SAMPLED N TIMES PER NODE STEP. The browser's bilinear filter is
 * C0 — the surface is exact at the nodes and its GRADIENT jumps across every
 * texel boundary, which is a Mach band every 135 px. Warping the bilinear
 * parameters through `S(t) = t^2(3-2t)` is EXACT AT EVERY NODE, so nothing the
 * plate says about the published field changes, and it is C1 across every
 * texel boundary.
 */
export function shoalCellAlpha(
  XW: number,
  XH: number,
  field: ShoalField,
): Float32Array {
  const CA = new Float32Array(XW * XH);
  for (let j = 0; j < XH; j++)
    for (let i = 0; i < XW; i++) {
      const k = j * XW + i,
        d = field.smooth[k];
      const land = field.dist[k] === 0 && !field.hole[k];
      if (land) {
        let edge = false;
        for (let a = -1; a <= 1 && !edge; a++)
          for (let b = -1; b <= 1 && !edge; b++) {
            const ii = i + a,
              jj = j + b;
            if (ii < 0 || jj < 0 || ii >= XW || jj >= XH) continue;
            const kk = jj * XW + ii;
            if (!(field.dist[kk] === 0 && !field.hole[kk])) edge = true;
          }
        CA[k] = edge ? SHOAL_A0 : 0;
        continue;
      }
      const t = Math.min(1, d / SHOAL_REACH);
      CA[k] = (1 - t * t * (3 - 2 * t)) * SHOAL_A0;
    }
  return CA;
}

/** the node field, which is what the plate is a picture OF. */
export function shoalNodeAlpha(
  XW: number,
  XH: number,
  cell: Float32Array,
): Float32Array {
  const XNW = XW + 1,
    XNH = XH + 1;
  const NA = new Float32Array(XNW * XNH);
  for (let j = 0; j < XNH; j++)
    for (let i = 0; i < XNW; i++) {
      let s = 0,
        n = 0;
      for (let a = -1; a <= 0; a++)
        for (let b = -1; b <= 0; b++) {
          const ii = i + a,
            jj = j + b;
          if (ii < 0 || jj < 0 || ii >= XW || jj >= XH) continue;
          s += cell[jj * XW + ii];
          n++;
        }
      NA[j * XNW + i] = n ? s / n : 0;
    }
  return NA;
}

/** the C1 resample: `S(t) = t^2(3-2t)` warping the bilinear parameters. */
export function resampleC1(
  NA: Float32Array,
  XNW: number,
  XNH: number,
  N: number,
): { data: Float32Array; w: number; h: number } {
  const PW = (XNW - 1) * N + 1,
    PH = (XNH - 1) * N + 1;
  const out = new Float32Array(PW * PH);
  const SS = new Float32Array(N + 1);
  for (let t = 0; t <= N; t++) {
    const u = t / N;
    SS[t] = u * u * (3 - 2 * u);
  }
  for (let J = 0; J < PH; J++) {
    const j0 = Math.min(XNH - 2, (J / N) | 0),
      fv = SS[J - j0 * N];
    const r0 = j0 * XNW,
      r1 = (j0 + 1) * XNW;
    for (let I = 0; I < PW; I++) {
      const i0 = Math.min(XNW - 2, (I / N) | 0),
        fu = SS[I - i0 * N];
      const a00 = NA[r0 + i0],
        a10 = NA[r0 + i0 + 1],
        a01 = NA[r1 + i0],
        a11 = NA[r1 + i0 + 1];
      const top = a00 + (a10 - a00) * fu;
      out[J * PW + I] = top + (a01 + (a11 - a01) * fu - top) * fv;
    }
  }
  return { data: out, w: PW, h: PH };
}

// ── the bay plate ───────────────────────────────────────────────────────────

let bayCv: HTMLCanvasElement | OffscreenCanvas | null = null;
let bayKey = "";

/**
 * THE BAY PLATE — the water's aerial perspective.
 *
 * `proj` is linear and its map is `D . Rot(ROT)` with `D = [[cA,-cA],[sA,sA]]`;
 * `Rot` is an isometry, so a world CIRCLE becomes an ellipse whose axes are
 * D's singular vectors — screen x and screen y — with semi-axes `cA*sqrt(2)`
 * and `sA*sqrt(2)` times `cam.scale`. One transform, one gradient, one fill.
 *
 * The two numbers in the radial stop are `hazeAt`'s own — 3400 m of full
 * colour, the cap reached 15000 m beyond it — **so the water and the land
 * recede on ONE rule.**
 *
 * BLOCK RES: AND IT IS NOT A QUARTER ANY MORE. A sixteenth of the pixels, and
 * the argument for it — "a field with no high frequencies in it by
 * construction is the same picture" — is true of the GRADIENT and false of the
 * BLIT, which lands 4 x 4 device-pixel steps in the one surface of the frame
 * that has nothing to hide a step behind.
 *
 * NOTE ON THE CACHE KEY. This key is continuous in `cam.scale`, which
 * elsewhere in this renderer is the bug that makes zoom jumpy. It is correct
 * here and it is worth stating why: this is **not a layer cache**. The plate's
 * content is a function of the camera, so a quantised key would hand back a
 * plate drawn for a different camera. What the finding forbids is a
 * continuous scale in the key of a buffer whose CONTENTS do not depend on it.
 */
/**
 * The aerial anchor, remembered from whoever last laid the bay.
 *
 * `hazeAt` is measured from the manifest's own `proj.downtown`, and the shell
 * hands that number to `bayPlate` on the frame immediately before it asks for
 * the water. `drawWater` needs the same point for the depth plate's own fade
 * and is not handed it, so the module keeps the one it was given rather than
 * writing a coordinate down here. **With nothing handed to it, the fade is not
 * painted** — no anchor is invented.
 */
let hazeAnchor: readonly [number, number] | null = null;

export function bayPlate(
  f: Frame,
  makeCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
  downtown: readonly [number, number],
): HTMLCanvasElement | OffscreenCanvas | null {
  hazeAnchor = downtown;
  const tune = resTune(f.dpr, f.moving);
  const ss = tune.bayss || BAY_SS;
  const { W, H, cam } = f;
  /*
   * THE GUARD `drawDepthHaze` HAS, AND THIS CALL DID NOT. `.parity/BUGS.md`
   * §20: `createRadialGradient` throws `IndexSizeError` when `r0 < 0`, and it
   * takes the WHOLE frame's draw with it — which is why the camera came back
   * at z = −0.025 with nothing picking rather than showing an error. A camera
   * whose scale has gone to zero or negative makes `kx` do the same, and
   * `g.scale(1, ky / kx)` is already undefined before the gradient is reached.
   * Both radii are positive multiples of `kx`, so `kx > 0` is the whole of the
   * `R1 > R0` test the sibling at `drawDepthHaze` writes out.
   */
  const kx = f.proj.cA * Math.SQRT2 * cam.scale,
    ky = f.proj.sA * Math.SQRT2 * cam.scale;
  if (!(kx > 0) || !(ky > 0)) return null;
  const key =
    W +
    "|" +
    H +
    "|" +
    cam.cx.toFixed(2) +
    "|" +
    cam.cy.toFixed(2) +
    "|" +
    cam.scale.toFixed(6) +
    "|" +
    BAY_OPEN +
    "|" +
    HAZE +
    "|" +
    ss;
  const w = Math.max(2, Math.round(W * ss)),
    h = Math.max(2, Math.round(H * ss));
  if (bayCv && bayKey === key && bayCv.width === w && bayCv.height === h)
    return bayCv;
  bayCv = makeCanvas(w, h);
  bayCv.width = w;
  bayCv.height = h;
  const g = bayCv.getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return null;
  g.setTransform(ss, 0, 0, ss, 0, 0);
  const dp = f.proj.proj(downtown[0], downtown[1], 0);
  const cx = sx(f, dp),
    cy = sy(f, dp);
  const R0 = 3400 * kx,
    R1 = (3400 + 15000) * kx;
  g.translate(cx, cy);
  g.scale(1, ky / kx);
  g.translate(-cx, -cy);
  const gr = g.createRadialGradient(cx, cy, R0, cx, cy, R1);
  gr.addColorStop(0, BAY_OPEN);
  gr.addColorStop(1, lerpHex(BAY_OPEN, HAZE, 0.62));
  g.fillStyle = gr;
  const pad = Math.max(W, H) * (kx / ky) + Math.abs(cy) * (kx / ky) + 2;
  g.fillRect(-pad, cy - pad, W + 2 * pad, 2 * pad);
  bayKey = key;
  return bayCv;
}

// ── the depth plate ─────────────────────────────────────────────────────────

/**
 * THE BAY HAS A FLOOR.
 *
 * The bay was `BAY_OPEN` with a haze ramp on it, and a pale band hugging every
 * shore whose alpha is a BFS DISTANCE FROM LAND over the 110 m surround
 * raster. Block W never claimed that band was depth; it is "distance from
 * land, in cells, so the shallows can be a shade lighter", an honest declared
 * treatment. But it reads as a depth claim, and **THE DEPTH IS PUBLISHED.**
 *
 * Measured, reproducing that rule on the same grid and asking the published
 * bathymetry what is actually there:
 *
 * ```
 *   corr(distance-from-shore, log depth) = 0.303   ->   r2 = 0.092
 * ```
 *
 * Distance from the shore explains NINE PER CENT of the bay's depth, and water
 * deeper than 25 m is painted with the shallow tint at alpha up to 0.43.
 *
 * WHAT IS PUBLISHED AND WHAT IS DECLARED, kept apart:
 *
 * - PUBLISHED: the depth at every node; the RAMP'S STOPS, which are that
 *   distribution's own quantiles (0 / 9.93 / 27.47 / 114.05 m); the ramp's
 *   DIRECTION, which is the page's own `BAY_SHOAL -> BAY_OPEN` step extended;
 *   the bed's GRADIENT, which is what shades it.
 * - DECLARED: the ramp's spread and its deep tail; the bed's vertical
 *   exaggeration and the amplitude and reach of its shading. At the LAND's own
 *   exaggeration the bay floor's Lambert spread is 0.012 and invisible, and at
 *   x40 the multibeam SURVEY TRACK LINES appear in the shading, which is its
 *   own reason not to go there.
 *
 * And the LEVEL is not a choice at all: the ramp is re-centred, from the
 * shipped histogram of the published depth, so that the AREA-WEIGHTED MEAN
 * COLOUR OF THE WATER IS THE VALUE BLOCK W SET FOR THE OPEN BAY. What changes
 * is the variation, not the level. At one whole step per quantile interval the
 * first two stops come out at `#c3dae2` and `#84a4c5`, which are `BAY_SHOAL`
 * and `BAY_OPEN` to within two levels: **the page had already put "open bay"
 * at the bay's own median depth without knowing it.**
 */
export interface WaterMeta {
  readonly nw: number;
  readonly nh: number;
  readonly mul: number;
  readonly dmax: number;
  /** the published distribution's own quantiles, metres */
  readonly qs: readonly number[];
  /** [minX, minY, maxX, maxY] in world metres; j increases NORTH */
  readonly world: readonly [number, number, number, number];
}

/** depth in metres at a node value. `(v/255)^2 * dmax`, the source's own quantiser. */
export function depthM(v: number, dmax: number): number {
  const t = v / 255;
  return t * t * dmax;
}

/**
 * REFUSES AT LOAD if the refinement does not check out.
 *
 * `part3.html` refuses to draw the field at all if `nw !== XW * mul + 1`, and
 * that refusal is the reason level 0 can be claimed lossless with respect to
 * the published coarse grid: every `mul`-th node IS a node of it.
 */
export function assertRefinement(meta: WaterMeta, XW: number, XH: number): void {
  if (meta.nw !== XW * meta.mul + 1 || meta.nh !== XH * meta.mul + 1)
    throw new Error(
      `bathymetry is not a ${meta.mul}x refinement of the surround grid: ` +
        `${meta.nw}x${meta.nh} against ${XW * meta.mul + 1}x${XH * meta.mul + 1}`,
    );
}

/**
 * The ramp's SHAPE, in whole `BAY_SHOAL -> BAY_OPEN` steps.
 *
 * `spread` is one step per published quantile interval; `tail` is where the
 * deepest stop sits, in those steps. Both are **DECLARED**, as they are in the
 * source: the published quantiles fix where the stops are and the direction
 * the water darkens, and how far apart the tones sit is this port's reading of
 * "one whole step per quantile interval". The 0.75 rather than 1.0 is the
 * source's own number and the check on it is in `depthRamp`.
 */
export const DE_SPREAD = 0.75;
export const DE_TAIL = 2.2;

/** the four `u` values the published quantiles sit at */
export const depthU_stops = (): readonly number[] => [
  0,
  DE_SPREAD,
  2 * DE_SPREAD,
  DE_TAIL * DE_SPREAD,
];

/**
 * `u(d)` — piecewise linear through the published quantiles, in ramp steps.
 *
 * The quantiles are NOT evenly spaced in metres (0 / 9.929 / 27.466 / 114.045)
 * and are evenly spaced in `u`, which is the whole point: the tone follows the
 * DISTRIBUTION rather than the depth, so the half of the bay that is shallower
 * than 9.9 m gets a whole step of the ramp to itself instead of the first
 * ninth of it.
 */
export function depthU(d: number, qs: readonly number[]): number {
  const U = depthU_stops();
  if (d <= qs[1])
    return U[0] + ((U[1] - U[0]) * (d - qs[0])) / Math.max(1e-6, qs[1] - qs[0]);
  if (d <= qs[2])
    return U[1] + ((U[2] - U[1]) * (d - qs[1])) / Math.max(1e-6, qs[2] - qs[1]);
  return (
    U[2] +
    (U[3] - U[2]) *
      Math.min(1, (d - qs[2]) / Math.max(1e-6, qs[3] - qs[2]))
  );
}

/**
 * The area-weighted mean of `u` over a published depth field.
 *
 * Every node of the shipped grid covers the same area, so a plain mean over
 * the non-zero codes IS the area-weighted mean. Zero is land: the encoder
 * drops it, so it is not water averaged as shallow.
 *
 * Exported so `DEPTH_UM` can be re-derived from the shipped chunk rather than
 * believed.
 */
export function depthMeanU(
  dep: Uint8Array,
  dmax: number,
  qs: readonly number[],
): number {
  const hist = new Float64Array(256);
  for (let k = 0; k < dep.length; k++) hist[dep[k]]++;
  hist[0] = 0;
  let s = 0,
    n = 0;
  for (let b = 1; b < 256; b++) {
    if (!hist[b]) continue;
    s += depthU(depthM(b, dmax), qs) * hist[b];
    n += hist[b];
  }
  return n ? s / n : 0;
}

/**
 * THE LEVEL IS NOT A CHOICE AT ALL, AND IT WAS BEING CHOSEN.
 *
 * The ramp is re-centred so that **the area-weighted mean colour of the water
 * is the value Block W set for the open bay.** What the bathymetry changes is
 * the VARIATION, not the level — the discipline `roofs/BLOCK-F2.md` §2.4 used
 * for the roof's own band.
 *
 * The first cut of this port shipped four hand-picked stops
 * (`BAY_SHOAL, #a9c4d6, BAY_OPEN, lerp(BAY_OPEN, #39597e, .55)`) and did NOT
 * re-centre. MEASURED over the 53,128 water nodes of the shipped
 * `base/water0`, the mean colour that ramp paints is
 *
 * ```
 *   painted   168.6, 195.1, 213.5
 *   BAY_OPEN  135.0, 166.0, 198.0
 *   error     +33.6, +29.1, +15.5   of 255
 * ```
 *
 * — the bay was **a third of a level too pale over its whole area**, which is
 * exactly parity §6's "one pale blue-grey wash" and most of why the wide frame
 * reads washed out. It is low magnitude per pixel and enormous in area, so it
 * does not announce itself.
 *
 * `DEPTH_UM` is that mean, in `u`, over the shipped field. It is a MEASURED
 * constant with a stated target, the way `terrain.ts`'s `XBASE_K` is, and it
 * is re-derivable:
 *
 * ```
 *   depthMeanU(city.get("base/water0").fields.dep, 120, manifest.water.qs)
 *   = 0.718468   over 53,128 water nodes
 * ```
 *
 * **The check that the arithmetic is right and not merely self-consistent**:
 * at this spread the second stop comes out `#85a4c5`, and the source records
 * that stop as `#84a4c5` — one level, on a number neither side copied from the
 * other. The first comes out a pale `#b4cddb` and the deepest `#4c74ab`.
 *
 * The level-0 field is every fourth node of the 4x refinement, and every node
 * of either grid covers equal area, so the coarse field is an unbiased area
 * sample of the fine one and the mean is the same quantity.
 */
export const DEPTH_UM = 0.718468;

/**
 * The depth ramp. Stops are the published quantiles; the colours are
 * `BAY_OPEN + (u - um) * (BAY_OPEN - BAY_SHOAL)`, so the direction and the
 * step are the page's own two water tones and **the mean is BAY_OPEN by
 * construction.**
 *
 * `depthColour` interpolates linearly in `d` between stops, and `u` is
 * piecewise linear in `d` between exactly those stops, so the interpolated
 * colour is `OP + (u(d) - um) * D` at every depth and not only at the stops.
 */
export function depthRamp(
  qs: readonly number[],
  um: number = DEPTH_UM,
): {
  stops: readonly number[];
  colours: readonly string[];
} {
  const SH = [
    parseInt(BAY_SHOAL.slice(1, 3), 16),
    parseInt(BAY_SHOAL.slice(3, 5), 16),
    parseInt(BAY_SHOAL.slice(5, 7), 16),
  ];
  const OP = [
    parseInt(BAY_OPEN.slice(1, 3), 16),
    parseInt(BAY_OPEN.slice(3, 5), 16),
    parseInt(BAY_OPEN.slice(5, 7), 16),
  ];
  const U = depthU_stops();
  const colours = U.map((u) =>
    rgbHex(
      OP[0] + (u - um) * (OP[0] - SH[0]),
      OP[1] + (u - um) * (OP[1] - SH[1]),
      OP[2] + (u - um) * (OP[2] - SH[2]),
    ),
  );
  return { stops: qs, colours };
}

/** linear interpolation along the published ramp; returns [r,g,b]. */
export function depthColour(
  d: number,
  ramp: { stops: readonly number[]; colours: readonly string[] },
): [number, number, number] {
  const { stops, colours } = ramp;
  let i = 0;
  while (i < stops.length - 2 && d > stops[i + 1]) i++;
  const a = stops[i],
    b = stops[i + 1];
  const t = b > a ? Math.min(1, Math.max(0, (d - a) / (b - a))) : 0;
  const h = lerpHex(colours[i], colours[Math.min(colours.length - 1, i + 1)], t);
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/**
 * Lay a plate down under exactly the affine `drawShoalPlate` uses.
 *
 * AND THE PLATE IS CULLED TO THE FRAME, which cost 40-80 ms to find out. At
 * street zoom the affine scales a 417 x 281 plate to about 50,000 px across,
 * and asking the compositor to resample all of it so that a thousandth of it
 * lands on the canvas is 51 ms at a camera with no water in it at all —
 * MEASURED, ablating the flag: 11.0 ms shipped, 51.0 ms with an unculled
 * plate. The map is affine and therefore invertible, so the four screen
 * corners give the exact grid rectangle the frame can see.
 */
export function blitGridPlate(
  f: Frame,
  plate: CanvasImageSource & { width: number; height: number },
  g: SurroundGrid,
  texelsPerCell: number,
): boolean {
  const { ctx, W, H } = f;
  const NN = texelsPerCell;
  const o = f.proj.proj(g.mx[0], g.my[0], 0),
    u = f.proj.proj(g.mx[1], g.my[0], 0),
    v = f.proj.proj(g.mx[0], g.my[1], 0);
  const ox = sx(f, o),
    oy = sy(f, o);
  const ux = sx(f, u) - ox,
    uy = sy(f, u) - oy,
    vx = sx(f, v) - ox,
    vy = sy(f, v) - oy;
  const det = ux * vy - uy * vx;
  if (!det) return false;
  let i0 = 1e9,
    i1 = -1e9,
    j0 = 1e9,
    j1 = -1e9;
  for (let c = 0; c < 4; c++) {
    const px = c & 1 ? W + 2 : -2,
      py = c & 2 ? H + 2 : -2;
    const dx = px - ox,
      dy = py - oy;
    const gi = (dx * vy - dy * vx) / det + 0.5;
    const gj = (-dx * uy + dy * ux) / det + 0.5;
    if (gi < i0) i0 = gi;
    if (gi > i1) i1 = gi;
    if (gj < j0) j0 = gj;
    if (gj > j1) j1 = gj;
  }
  const sxx = Math.max(0, (Math.floor(i0) - 1) * NN),
    syy = Math.max(0, (Math.floor(j0) - 1) * NN);
  const sw = Math.min(plate.width, (Math.ceil(i1) + 1) * NN) - sxx,
    sh = Math.min(plate.height, (Math.ceil(j1) + 1) * NN) - syy;
  if (sw <= 0 || sh <= 0) return false;
  ctx.save();
  ctx.transform(
    ux / NN,
    uy / NN,
    vx / NN,
    vy / NN,
    ox - (0.5 * ux) / NN - (0.5 * vx) / NN,
    oy - (0.5 * uy) / NN - (0.5 * vy) / NN,
  );
  const sm = ctx.imageSmoothingEnabled,
    sq = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  // "high" is a multi-pass resample and this is a pure UPSCALE, where bilinear
  // is exact enough; "low" is bilinear and it is the difference between 51 ms
  // and 16 ms at street zoom.
  ctx.imageSmoothingQuality = WA.iq || "low";
  ctx.drawImage(plate, sxx, syy, sw, sh, sxx, syy, sw, sh);
  ctx.imageSmoothingEnabled = sm;
  ctx.imageSmoothingQuality = sq;
  ctx.restore();
  return true;
}

/** how many samples per published node step the shallows plate is built at */
export function shoalSamples(): number {
  return Math.max(1, Math.min(8, Math.round(RS.on ? RS.shoalss : 1)));
}

/**
 * The whole water pass, in the order the mock paints it: bay plate, depth
 * plate, shoal plate, then the shoreline's own corridor. Every step is a
 * no-op where its input is missing, so a first paint with only `base/coast`
 * still draws a coastline and no bay.
 */
export interface WaterLayers {
  readonly bay?: CanvasImageSource & { width: number; height: number };
  readonly depth?: CanvasImageSource & { width: number; height: number };
  readonly shoal?: CanvasImageSource & { width: number; height: number };
  readonly surround?: SurroundGrid | null;
  readonly depthTexels?: number;
  readonly shoalTexels?: number;
  /** the aerial anchor — `manifest.proj.downtown`, the point `hazeAt` measures from */
  readonly downtown?: readonly [number, number];
}

/**
 * THE WATER RECEDES ON THE LAND'S OWN RULE, AND THE DEPTH PLATE WAS NOT.
 *
 * `part3.html` §depthPlate hazes **inside the plate**, per node, in world
 * metres: `hz = clamp((|w - downtown| - 3400) / 15000, 0, WA.hazecap)` — the
 * same expression `TerrainField.hazeAt` runs, so *"the water and the land
 * recede on one rule"*. This port builds the depth plate from the published
 * ramp alone and hazes nothing, and the bay plate underneath it — which does
 * carry the fade — is covered by it.
 *
 * MEASURED on the district frame at Ocean Beach, over the open Pacific strip:
 * with the ramp re-centred and no fade, prod's sea runs
 * **-53.5, -34.6, -11.5 of 255 against the mock's**. The two errors had been
 * cancelling: the un-recentred ramp was about +33 too pale everywhere, which
 * happened to sit near the fade's own +99 out at the frame edge and left the
 * near bay pale by the whole of it. *The same shape as `XBASE_K`'s fallback,
 * and worth recording twice.*
 *
 * It goes down as ONE fill and that is a fact about this projection, not a
 * saving: `proj` is `D · Rot(ROT)` with `Rot` an isometry, so a world circle
 * is an ellipse whose axes are screen x and screen y. `hazeAt` is linear in
 * the world radius and flat past its cap, so the ramp is exactly two stops —
 * 0 at 3,400 m and `WA.hazecap` at the radius the cap is reached,
 * `3400 + 15000 * hazecap`, beyond which a radial gradient holds its last stop
 * of its own accord. **Nothing here is a curve fitted to the plate's own
 * numbers; it is the plate's own numbers.**
 */
export function drawDepthHaze(f: Frame, downtown: readonly [number, number]): boolean {
  const cap = WA.hazecap;
  if (!(cap > 0) || !QF.water) return false;
  const { ctx, W, H, cam } = f;
  const dp = f.proj.proj(downtown[0], downtown[1], 0);
  const cx = sx(f, dp),
    cy = sy(f, dp);
  const kx = f.proj.cA * Math.SQRT2 * cam.scale,
    ky = f.proj.sA * Math.SQRT2 * cam.scale;
  if (!(kx > 0) || !(ky > 0)) return false;
  const R0 = 3400 * kx,
    R1 = (3400 + 15000 * cap) * kx;
  if (!(R1 > R0)) return false;
  const hz = HAZE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ky / kx);
  ctx.translate(-cx, -cy);
  const gr = ctx.createRadialGradient(cx, cy, R0, cx, cy, R1);
  gr.addColorStop(0, hexA(hz, 0));
  gr.addColorStop(1, hexA(hz, cap));
  ctx.fillStyle = gr;
  const pad = Math.max(W, H) * (kx / ky) + Math.abs(cy) * (kx / ky) + 2;
  ctx.fillRect(-pad, cy - pad, W + 2 * pad, 2 * pad);
  ctx.restore();
  return true;
}

function hexA(hex: string, a: number): string {
  return (
    "rgba(" +
    parseInt(hex.slice(1, 3), 16) +
    "," +
    parseInt(hex.slice(3, 5), 16) +
    "," +
    parseInt(hex.slice(5, 7), 16) +
    "," +
    a +
    ")"
  );
}

/**
 * THE DEPTH GOES OVER THE SHOAL BAND, NOT UNDER IT. THIS PORT HAD IT BACKWARDS.
 *
 * `part3.html` `drawTerrain` L5338-5345 lays them bay -> shoal -> depth, and
 * says why at the call:
 *
 * > BLOCK DETAIL: and the water knows how deep it is. **OVER the shore band —
 * > which is untouched, and is a distance from land and says so** — and UNDER
 * > drawContext, so every pixel of the plate that reaches the land is painted
 * > over by the land.
 *
 * That sentence is §2's own hierarchy as a paint order: the depth is
 * PUBLISHED, the shoal band is a DECLARED TREATMENT whose correlation with
 * depth is r2 = 0.092, and **the published field is the one that ends up on
 * top.** This function blitted depth first and laid the band over it.
 *
 * **MEASURED, AND IT MOVED NOTHING, AND THAT IS THE FINDING.** B3, the open
 * Pacific, three rows sampled at three columns each: nine pixels for nine,
 * identical before and after. The reason is that `L.shoal` is never supplied —
 * `scene.ts` `paintWaterBed` hands `drawWater` `{bay, depth, surround,
 * depthTexels}` and blits the shallows itself from `paintShoal`, at step 3,
 * **after `drawSurround` and `drawTerrain`**. So the inversion is real and it
 * is two files away; this order is corrected so that a caller that does supply
 * `shoal` gets the reference's order, and the note that matters is in
 * `DRAW.md` §13.6 against the call site that has it.
 *
 * The aerial fade stays WITH the depth, immediately after its blit, because in
 * the reference it is baked INSIDE that plate per node.
 */
export function drawWater(f: Frame, L: WaterLayers): void {
  const { ctx, W, H } = f;
  lastWater = L;
  if (L.bay) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(L.bay, 0, 0, W, H);
    ctx.restore();
  }
  if (L.shoal && L.surround)
    blitGridPlate(f, L.shoal, L.surround, L.shoalTexels ?? 1);
  if (L.depth && L.surround) {
    blitGridPlate(f, L.depth, L.surround, L.depthTexels ?? 1);
    /* the wave tooth goes OVER the published depth and UNDER the haze, so a
       far reach of water loses its waves with the same fade it loses its
       colour — see `drawWaves` */
    drawWaves(f);
    // the fade the plate does not carry — over the depth and under the land,
    // which is where the mock bakes it
    const anchor = L.downtown ?? hazeAnchor;
    if (anchor) drawDepthHaze(f, anchor);
  } else {
    drawWaves(f);
  }
}

/* ── THE WAVE TOOTH ──────────────────────────────────────────────────────
 *
 * A DECLARED TREATMENT, like the shoal band, and it claims nothing: the bay
 * plate and the depth plate are two smooth fields and together they read as a
 * flat blue fill — on the whole-city frame the water is 40 % of the picture
 * and it was the one surface with no hand in it. Gouache-board water in the
 * bird's-eye lithographs this register is drawn after carries a short,
 * broken, horizontal stroke — a tooth, not a wave field — and that is what
 * this is: one 176 px tile of ~26 short arcs, light over dark, repeated.
 *
 * Two rules keep it honest and cheap:
 *  - it is painted BEFORE the land and BEFORE the haze, so the land covers it
 *    and the far field fades it exactly as it fades the colour under it;
 *  - the tile is scaled by the zoom's square root, so the stroke stays a
 *    stroke at the district camera rather than becoming a texture of
 *    pinpricks, and it is capped so the street camera never sees a wave the
 *    width of a building.
 * The pattern is one `createPattern` fill per rasterisation, and it is gated
 * on `LOOK.waves`.
 */
const WAVE_TILE = 176;
type WaveCanvas = HTMLCanvasElement | OffscreenCanvas;
function waveCanvas(w: number, h: number): WaveCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
let waveTile: WaveCanvas | null = null;
let waveTileDpr = 0;
const wavePatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function waveTileFor(dpr: number): WaveCanvas | null {
  if (waveTile && waveTileDpr === dpr) return waveTile;
  const px = Math.max(1, Math.round(WAVE_TILE * dpr));
  const cv = waveCanvas(px, px);
  if (!cv) return null;
  const g = cv.getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, WAVE_TILE, WAVE_TILE);
  g.lineCap = "round";
  // a fixed LCG so the tile is the same on every machine and every frame
  let seed = 0x9e3779b9;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wraps: readonly (readonly [number, number])[] = [
    [0, 0], [-WAVE_TILE, 0], [0, -WAVE_TILE], [-WAVE_TILE, -WAVE_TILE],
  ];
  for (let i = 0; i < 26; i++) {
    const x = rnd() * WAVE_TILE;
    const y = rnd() * WAVE_TILE;
    const len = 7 + rnd() * 16;
    const bow = (rnd() - 0.5) * 2.4;
    const dark = rnd() < 0.36;
    // the stroke is drawn again across the tile edge so the repeat has no seam
    for (const [ox, oy] of wraps) {
      const X = x + ox, Y = y + oy;
      if (X + len < -2 || X > WAVE_TILE + 2 || Y < -4 || Y > WAVE_TILE + 4) continue;
      g.beginPath();
      g.moveTo(X, Y);
      g.quadraticCurveTo(X + len * 0.5, Y + bow, X + len, Y);
      g.lineWidth = dark ? 1.0 : 1.1;
      g.strokeStyle = dark ? "rgba(34,56,96,0.13)" : "rgba(255,255,255,0.22)";
      g.stroke();
      if (!dark) {
        // the shadow line a lithographer puts under a highlight
        g.beginPath();
        g.moveTo(X + 1, Y + 1.2);
        g.quadraticCurveTo(X + len * 0.5, Y + bow + 1.2, X + len - 1, Y + 1.2);
        g.lineWidth = 0.8;
        g.strokeStyle = "rgba(34,56,96,0.07)";
        g.stroke();
      }
    }
  }
  waveTile = cv;
  waveTileDpr = dpr;
  return cv;
}

/** the wave tooth over the whole frame; the land is painted over it after */
export function drawWaves(f: Frame): void {
  if (!LOOK.waves || !QF.water) return;
  if (typeof DOMMatrix === "undefined") return;
  const { ctx, W, H, cam } = f;
  const tile = waveTileFor(f.dpr);
  if (!tile) return;
  let pat = wavePatterns.get(ctx) ?? null;
  if (!pat) {
    pat = ctx.createPattern(tile as CanvasImageSource, "repeat");
    if (!pat) return;
    wavePatterns.set(ctx, pat);
  }
  const z = zOf(cam);
  const k = Math.min(2.6, Math.max(1, Math.sqrt(Math.max(1, z))));
  // the tile is drawn at DPR so it has to be scaled back down by it here
  pat.setTransform(new DOMMatrix().scale(k / f.dpr));
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * THE SHORE CORRIDOR'S WATER SIDE, WHICH WAS WRITTEN AND CALLED BY NOBODY.
 *
 * `coastBand`, `wedgeCovered` and `drawShoreUnderfill` have shipped since
 * Block P3 with their measurements, their corner-cap proof and their specs —
 * and `grep -rn coastBand src/` outside this file returns the doc-comment in
 * `DRAW.md` and nothing else. **Neither half of the corridor has ever been
 * painted in production.** DRAW.md §13.6 recorded the consequence as an open
 * question it declined to guess at:
 *
 * > the mock's near Pacific carries a large, sharply bounded blue mass —
 * > 151,178,204 at its darkest — where prod runs 187 to 197 across the same
 * > ground … I could not close it and I am not going to guess at it.
 *
 * It is this pass, and it is not a guess. `part3.html` L5432-5449, after the
 * city's cells and before the coastline ink:
 *
 * ```js
 * if(LOOK.shore&&coastBand(ctx,W,H,40,SHORE_OUT)>0){
 *   ctx.save(); ctx.clip();
 *   ctx.beginPath(); ctx.rect(-2,-2,W+4,H+4);
 *   for(const ring of C.coast){ ...proj(x,y,max(0.4,elevM(x,y)))... }
 *   ctx.fillStyle=BAY_OPEN; ctx.fill("evenodd");
 *   drawShoal(ctx,W,H,15);
 *   ctx.restore();
 * }
 * ```
 *
 * **`BAY_OPEN` OPAQUE, AND THAT IS THE POINT.** Everywhere else the bay is a
 * hazed plate; here, inside 1,100 m of a published shoreline, the water is
 * repainted at full strength and the graded shallows are laid back over it.
 * The mock's own comment says why — *"painted in the shoal tone rather than
 * open bay, because within a few hundred metres of the shore that is what the
 * water already is"* — and its second job is the one `coastBand`'s doc-comment
 * is entirely about: the 53.8 m raster's cream staircase runs several hundred
 * metres past the published line into the bay, and this fill is what cuts it
 * back out.
 *
 * MEASURED, ablating the mock's own flags at the Sunset district camera over
 * the six screen columns the band crosses: turning `DE.water`, `DE.bed`,
 * `WA.shoal` or `WA.hazecap` off moves those pixels by at most 2 of 255, so
 * the blue mass is none of the depth plate, the seabed relief, the shallows or
 * the haze. It is this fill, and the mock reads 147,175,202 where production
 * reads 188,199,207 — **41, 24 and 5 levels, over the whole 1,100 m coastal
 * corridor of every frame that has a coast in it.**
 *
 * The `wet` test is the mock's, on the SURROUND raster's own land bit and not
 * on the city DEM: *"a segment with land on both sides is the San Mateo county
 * line, not a beach, and it gets no corridor."*
 */
export function drawShoreCorridor(
  f: Frame,
  t: TerrainField,
  coast: readonly Ring[],
  L: {
    readonly surround?: SurroundGrid | null;
    readonly shoal?: (CanvasImageSource & { width: number; height: number }) | undefined;
    readonly shoalTexels?: number;
  },
): number {
  const sg = L.surround;
  if (!sg || !coast.length) return 0;
  const isLand = sg.isLand;
  if (!isLand) return 0;
  const { ctx, W, H } = f;
  const gx = sg.XW / (sg.mx[sg.XW] - sg.mx[0]),
    gy = sg.XH / (sg.my[sg.XH] - sg.my[0]);
  const wet = (px: number, py: number): number => {
    const i2 = ((px - sg.mx[0]) * gx) | 0,
      j2 = ((py - sg.my[0]) * gy) | 0;
    return i2 < 0 || j2 < 0 || i2 >= sg.XW || j2 >= sg.XH ? 1 : isLand(i2, j2) ? 0 : 1;
  };
  const band = new Path2D();
  // the mock's own inM here is 40, not SHORE_IN: the land side of this pass is
  // the under-fill's, and 40 m is the sliver the even-odd fill needs to sit on
  // so that the seam lands under the published line rather than beside it.
  const n = coastBand(band, f, coast, wet, 40, SHORE_OUT);
  if (n <= 0) return 0;
  ctx.save();
  ctx.clip(band, "nonzero");
  /* ── AND THE SHALLOWS ARE CLIPPED TO THE WATER SIDE, WHICH THE REFERENCE
     GETS FOR FREE AND THIS BUILD DOES NOT ────────────────────────────────
     `part3.html` lays the even-odd fill and then calls `drawShoal` inside the
     corridor clip alone, because ITS shoal plate is already transparent over
     land: `xland(i,j)` is the whole land test behind the band's BFS.
     Production's is not. `scene.ensurePlates` builds the field with

         buildShoal(XW, XH, (i, j) => sg.z(i, j) > 0 && isLandOf(sg, i, j))

     and **`sg.z > 0` is not a land test.** Treasure Island is made land whose
     110 m surround node reads 0 m, so the shallows treat the whole island as
     water and the plate is opaque over it. Under the cells that never showed;
     re-blitted over them by this pass it painted the entire island the shoal
     tone — MEASURED by ablation, `?layers=-shore` restores the cream
     staircase and `?layers=` (all on) does not.
     So the clip is intersected with the even-odd water side before either
     mark is laid. That cannot remove anything the reference draws — its plate
     is already zero on land — and it makes the published shoreline the
     boundary of both marks instead of only of one. The `sg.z > 0` term is a
     `scene.ts` line and it is written up in DRAW.md §16.3 for its owner. */
  const outside = new Path2D();
  outside.rect(-2, -2, W + 4, H + 4);
  coastRings(outside, f, t, coast);
  ctx.clip(outside, "evenodd");
  ctx.fillStyle = BAY_OPEN;
  ctx.fillRect(-2, -2, W + 4, H + 4);
  // the graded band, exactly as it was laid — the plate the bay pass already
  // built, re-blitted inside the corridor because the fill above covered it
  if (L.shoal && sg) blitGridPlate(f, L.shoal, sg, L.shoalTexels ?? 1);
  ctx.restore();
  return n;
}

/**
 * THE LAYERS THE CORRIDOR NEEDS, BORROWED FROM THE SIBLING CALL — AND HOW TO
 * DELETE THIS.
 *
 * `scene.paint` calls `drawWater(f, {bay, shoal, depth, surround, …})` at step
 * 1 and `drawShoreline(f, t, this.coast)` at step 3 of the SAME frame. The
 * corridor is drawn at step 3 by the reference's order and needs the shoal
 * plate and the surround grid that step 1 was handed. `streets.ts` already
 * carries this exact pattern for `drawStreetSurface` and names the one-line
 * change that removes it; this one is:
 *
 *     drawShoreline(f, t, this.coast, { surround: sg, shoal: this.shoalPlate })
 *
 * in `scene.paint` §3, with `sg = band.surround`. `drawShoreline`'s fourth
 * argument is already optional and already preferred over this fallback, so
 * that edit lands the same picture and deletes the module state. Until then
 * the borrowed record is the one from one statement earlier in the same
 * `paint()`, at the same camera, in the same band.
 */
let lastWater: WaterLayers | null = null;

/**
 * The published shoreline, in ink, over whatever the raster did — **and only
 * where the raster has land to be the shore OF.**
 *
 * `part3.html` L5456-5474, and its comment is the whole of it:
 *
 * > Coastline ink. Only where the 77 m DEM raster actually has land within a
 * > cell: the vector shoreline resolves piers and slivers the raster cannot,
 * > and stroking those draws INK FLOATING ON EMPTY WATER.
 *
 * This port drew every vertex of every ring as one closed path. Two
 * consequences, both visible on the district frame at Ocean Beach:
 *
 * - **the ink ran out into the open Pacific** — txuc-3kzm resolves piers,
 *   breakwaters and offshore slivers that the 53.8 m mask calls water, and a
 *   closed ring drawn through them is a dark line with nothing on either side
 *   of it;
 * - **the line climbed the hill.** `coastRings` projects at
 *   `max(0.4, elevM(x, y))`, which is right for the FILL — the ring must not
 *   sink under the water plate it bounds — and wrong for the INK, which the
 *   reference projects at a flat `0.4`. At Lands End and Fort Funston the
 *   ground behind the line rises 60-100 m, so the ink was lifted a projected
 *   `z * ZEX` up the screen and left the shore it names.
 *
 * The gate is the reference's own 3 x 3: a vertex is drawn if any of the nine
 * cells around it is land. `maskAt` already applies the offshore coast fix
 * (`QF.coast`), which is the reference's `!xcfix(ii, jj)` — so the two tests
 * are one call here. The pen lifts on a vertex that fails, so a run of
 * offshore vertices leaves a GAP rather than a chord across the bay.
 *
 * The ink is `rgba(10,10,10,.42)` and `lineJoin` is left as the caller has it,
 * both as the reference has them.
 */
/**
 * THE PUBLISHED SHORELINE, BORROWED THE WAY `lastWater` IS BORROWED.
 *
 * `trees.ts` `drawParkRings` needs the coast and `scene.paint` does not hand
 * it one — the same shape as `lastWater` above, with the same one-line
 * deletion:
 *
 *     drawParkRings(f, t, this.parks, this.coast)
 *
 * in `scene.paint` §3. `drawParkRings`'s fourth argument is already optional
 * and already preferred over this fallback, so that edit lands the same
 * picture and deletes the module state. Until then the borrowed record is the
 * one from ONE STATEMENT EARLIER in the same `paint()` — `drawShoreline` runs
 * at step 3 and the parks at step 3b — at the same camera, in the same band.
 */
let lastCoast: readonly Ring[] | null = null;

export function borrowedCoast(): readonly Ring[] | null {
  return lastCoast;
}

export function drawShoreline(
  f: Frame,
  t: TerrainField,
  coast: readonly Ring[],
  layers?: {
    readonly surround?: SurroundGrid | null;
    readonly shoal?: (CanvasImageSource & { width: number; height: number }) | undefined;
    readonly shoalTexels?: number;
  },
): void {
  lastCoast = coast;
  const { ctx } = f;
  const N = t.N;
  /* THE CORRIDOR FIRST, THEN THE INK — the reference's order, and the ink is
     the last thing in `drawTerrain` before the names. Painting the ink first
     and the corridor over it would rub out the line the corridor exists to
     make visible. */
  /* ── AND NOT AT THE WIDE CAMERAS, MEASURED 2026-08-26 ────────────────
     `coastBand`'s wedges are built in world metres and at z < 1.6 they
     project to sharp triangular shards a hundred pixels long across the
     open bay — the "spiky polygon" on every opening frame (shots/shore-
     pair.png: corridor on, corridor off). The staircase it exists to cut
     back is three pixels a step at that camera and the rim under the ink
     now covers it. From the district camera in, the corridor does its job
     and the wedges are under the shore where they belong. Settled at 3.0: the
     1936 and 1907 shots at z 2.05-2.55 still showed the shards at 1.6, and
     the district camera at 2.6+ needs the corridor for its own staircase. */
  if (QF.shore && zOf(f.cam) >= 3.0) drawShoreCorridor(f, t, coast, layers ?? lastWater ?? {});
  ctx.save();
  ctx.beginPath();
  for (const ring of coast) {
    let pen = false;
    for (let i = 0; i < ring.length; i++) {
      const g = t.toGrid(ring[i][0], ring[i][1]);
      const gi = Math.round(g[0]),
        gj = Math.round(g[1]);
      let ok = false;
      for (let a = -1; a <= 1 && !ok; a++)
        for (let b = -1; b <= 1 && !ok; b++) {
          const ii = gi + a,
            jj = gj + b;
          if (ii >= 0 && jj >= 0 && ii < N && jj < N && t.maskAt(ii, jj)) ok = true;
        }
      if (!ok) {
        pen = false;
        continue;
      }
      const p = f.proj.proj(ring[i][0], ring[i][1], 0.4);
      const x = sx(f, p),
        y = sy(f, p);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
  }
  /* ── THE RIM — `LOOK.shorerim` ────────────────────────────────────────
     A model's edge meets its resin: the lithographs this register follows
     put a pale halo along the coast under the ink, so the line reads as an
     EDGE and not as a wire. The same path, stroked pale and wide first,
     then the ink over it — one extra stroke per rasterisation. */
  if (LOOK.shorerim) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,252,242,.75)";
    ctx.lineWidth = 4.0;
    ctx.stroke();
    ctx.strokeStyle = "rgba(10,10,10,.5)";
  } else {
    ctx.strokeStyle = "rgba(10,10,10,.42)";
  }
  ctx.lineWidth = 1.0;
  ctx.stroke();
  ctx.restore();
}

export type { Plane, Projection };

// ── the depth plate at the resolution the City published ────────────────────

/**
 * THE PLATE IS 417 x 281 AND THE PUBLISHED FIELD IS 1665 x 1121.
 *
 * `scene.ensurePlates` builds the bathymetry out of `base/water0` alone — a
 * 417 x 281 node grid, one node per 110 m surround cell, **117,681 of the
 * 846,819 NOAA nodes the encoder shipped.** The other 729,138 are in
 * `water1`'s 26 tiles, they have been on the wire since Block P2, and
 * `grep -rn 'water1' src/` returns the manifest reader and nothing else.
 *
 * `blitGridPlate` has never needed a change for this: it already takes
 * `texelsPerCell`, and `mul` is 4. `assertRefinement` already refuses a field
 * that is not an exact refinement — 1665 = 416 x 4 + 1 and 1121 = 280 x 4 + 1,
 * so **every fourth texel of the refined plate IS a node of the coarse one**,
 * which is what makes level 0 loss-free with respect to level 1 and what lets
 * the two be swapped under the same blit.
 *
 * TWO THINGS ARE OUTSIDE THESE FILES AND BOTH ARE NAMED:
 *
 * 1. **`water1`'s tier `minZ` is 3.0**, so the tier is not fetched at the two
 *    wide cameras at all. The whole-city and district frames cannot be helped
 *    by this without a MANIFEST change, and the manifest is the encoder's.
 *    That change is not free: `water1` is 236,561 gzipped bytes against the
 *    base tier's 689,379, so moving it to base is +34 % on the first paint and
 *    is a decision about the first paint, not about the water.
 * 2. **the plate is assembled in `scene.ensurePlates`**, which is not one of
 *    these files. The call is
 *
 *    ```ts
 *    const tiles = this.data.manifest.chunks
 *      .filter((c) => c.kind === "water" && c.tier === "water1")
 *      .map((c) => ({ e: c, f: this.data.get(c.k) }))
 *      .filter((t) => !!t.f);
 *    const fine = tiles.length ? buildDepthPlate(meta, tiles, makeCanvas) : null;
 *    if (fine) { this.depthPlate = fine; this.depthTexels = meta.mul; }
 *    ```
 *
 *    with `depthTexels: this.depthTexels ?? 1` at the `drawWater` call. It is
 *    idempotent and it refuses rather than guessing: a tile whose byte count
 *    does not match its own published `w * h` throws naming the tile.
 *
 * A MISSING TILE IS LAND, NOT A HOLE. Nine of the 7 x 5 tile positions carry no
 * chunk because every node in them is dry, and the encoder drops them for that
 * reason; the plate is created transparent and a dropped tile stays
 * transparent, which is the same thing `v === 0` means inside a tile.
 */
export interface DepthTile {
  /** the manifest entry: `gx`, `gy`, `w`, `h` in NODES of the refined grid */
  readonly e: { readonly gx: number; readonly gy: number; readonly w: number; readonly h: number; readonly k?: string };
  readonly f: Chunk;
}

export function buildDepthPlate(
  meta: WaterMeta,
  tiles: readonly DepthTile[],
  makeCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas | null {
  if (!tiles.length) return null;
  const cv = makeCanvas(meta.nw, meta.nh);
  cv.width = meta.nw;
  cv.height = meta.nh;
  const g = cv.getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return null;
  const ramp = depthRamp(meta.qs);
  for (const t of tiles) {
    const dep = t.f.fields.dep as Uint8Array | undefined;
    if (!dep) continue;
    const { gx, gy, w, h } = t.e;
    if (dep.length !== w * h) {
      throw new Error(
        `${t.e.k ?? "water1 tile"}: ${dep.length} depth nodes for a published ${w}x${h}`,
      );
    }
    if (gx + w > meta.nw || gy + h > meta.nh) {
      throw new Error(
        `${t.e.k ?? "water1 tile"}: ${gx}+${w} x ${gy}+${h} is outside the ` +
          `published ${meta.nw}x${meta.nh} field`,
      );
    }
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = dep[i];
      const o = i * 4;
      if (v === 0) {
        img.data[o + 3] = 0; // dry: the source drops it, so does this
        continue;
      }
      const c = depthColour(depthM(v, meta.dmax), ramp);
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
    g.putImageData(img, gx, gy);
  }
  return cv;
}
