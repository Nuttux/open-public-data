/**
 * streets.ts — the right-of-way surface, the carriageway, the kerb, the footway.
 *
 * Block P3. Ported from `gen/part3.html` §STREETS AND NAMES and
 * §THE STREET IS A SURFACE, with `street/BLOCK-STREETSCAPE.md`.
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
import { type Frame, sx, sy, TerrainField } from "./terrain";

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

export const ST_ALPHA = 0.8;

/** a paved carriageway */
export const ST_C_ROAD = "#b3aca1";
/** graded earth, before the Board orders paving */
export const ST_C_RAW = "#c6b696";
/** footway */
export const ST_C_FOOT = "#e0d8c8";
/** the published kerb line */
export const ST_C_KERB = "#8b8375";

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
 * `S(t) = t^2(3-2t)`; the derivative is zero at both ends, so nothing pops on
 * and nothing is clamped to a minimum. *A pixel floor is a step in the
 * derivative.*
 */
export function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** the extent tier's weight for one feature of published width `wM` metres */
export function extentW(wM: number, camScale: number): number {
  const px = wM * ST_KPROJ * camScale;
  return smoothstep((px - ST_EXT_PX) / ST_EXT_PX);
}

/** the surface tier's weight for one feature of published footway band `fwM` */
export function surfaceW(fwM: number, camScale: number): number {
  const px = fwM * ST_KPROJ * camScale;
  return smoothstep((px - ST_SRF_PX) / ST_SRF_PX);
}

// ── the decoded network ─────────────────────────────────────────────────────

export interface StreetCell {
  readonly fid: Uint32Array;
  readonly kind: Uint8Array;
  readonly cls: Uint8Array;
  readonly cnn: Uint32Array;
  /** right-of-way width, decimetres */
  readonly w: Uint16Array;
  /** footway band, centimetres */
  readonly fw: Uint16Array;
  /** the year the Board accepted or ordered it; 0 = undated */
  readonly yr: Uint16Array;
  /** the year it was improved (paved); 0 = undated */
  readonly imp: Uint16Array;
  /** the year it was kerbed; 0 = undated */
  readonly krb: Uint16Array;
  readonly rwN: Uint8Array;
  readonly rwLen: Uint16Array;
  readonly rwX: Float32Array;
  readonly rwY: Float32Array;
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
 * The centrelines, drawn ON THE GROUND, BEFORE the blocks.
 *
 * A block then paints over the half of a street that is behind it — which is
 * correct occlusion in this projection, because an extruded block covers its
 * own footprint and everything up-screen of it, and up-screen is away.
 *
 * One `Path2D` per class, one `stroke()` per class. Two passes a class: the
 * covered centrelines at the faded alpha, the uncovered ones at full.
 */
export function drawCentrelines(
  f: Frame,
  cells: readonly StreetCell[],
  t: TerrainField,
  opts: {
    /** per-class median published width, metres, read off the shipped widths at load */
    readonly medianW: readonly number[];
    /** true where a published right of way has arrived to replace this line */
    readonly covered: (cell: StreetCell, i: number) => boolean;
    readonly band: number;
    readonly ink?: string;
  },
): number {
  const { ctx, cam } = f;
  const clsMax = ST_CLS_MAX[Math.min(ST_CLS_MAX.length - 1, opts.band)];
  const ink = opts.ink ?? "rgba(78,72,60,.52)";
  let drawn = 0;
  for (let pass = 0; pass < 2; pass++) {
    // pass 0 = covered (faded), pass 1 = uncovered (full)
    for (let c = 0; c <= clsMax; c++) {
      const a =
        pass === 0 ? centrelineFade(opts.medianW[c] ?? 20.9, cam.scale) : 1;
      if (a <= 0.002) continue;
      const p = new Path2D();
      let any = false;
      for (const cell of cells) {
        const n = cell.cls.length;
        let vo = 0;
        for (let i = 0; i < n; i++) {
          const nv = cell.rwLen[i];
          const base = vo;
          vo += nv;
          if (cell.cls[i] !== c) continue;
          if (opts.covered(cell, i) !== (pass === 0)) continue;
          for (let k = 0; k < nv; k++) {
            const wx = cell.rwX[base + k],
              wy = cell.rwY[base + k];
            // Terrain elevation at every street vertex, sampled once per cell
            // and cached by the caller: `elevM()` is two clamps and an array
            // read, but 14,432 of them per frame per pass — and the animated
            // pass runs the city draw twice — is real money for a number that
            // cannot change.
            const pr = f.proj.proj(wx, wy, t.elevM(wx, wy) + 0.8);
            if (k) p.lineTo(sx(f, pr), sy(f, pr));
            else p.moveTo(sx(f, pr), sy(f, pr));
          }
          any = true;
          drawn++;
        }
      }
      if (!any) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = ink;
      ctx.lineWidth = ST_W[c] ?? 0.7;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(p);
      ctx.restore();
    }
  }
  return drawn;
}

/**
 * The published right of way, as a surface.
 *
 * Both gates are **per feature**, so promotion is staggered across the frame
 * by the city's own widths and no frame is a different picture from the one
 * before it. Neither weight is a threshold: the ramp is an ALPHA.
 */
export function drawStreetSurface(
  f: Frame,
  cells: readonly StreetCell[],
  opts: { readonly year?: number; readonly skip?: (cnn: number) => boolean },
): StreetDrawResult {
  const { ctx, cam, W, H } = f;
  let lines = 0,
    surfaces = 0,
    held = 0;

  // one path per tone, so the whole tier is four fills
  const rowPath = new Path2D();
  const roadPaved = new Path2D();
  const roadRaw = new Path2D();
  const kerbPath = new Path2D();
  let aExtent = 0,
    aSurface = 0;

  for (const cell of cells) {
    const n = cell.cls.length;
    let rwo = 0,
      rdo = 0,
      kerbBit = 0;
    for (let i = 0; i < n; i++) {
      const rwn = cell.rwLen[i],
        rdn = cell.rdLen[i];
      const rwBase = rwo,
        rdBase = rdo;
      rwo += rwn;
      rdo += rdn;
      const kb = kerbBit;
      kerbBit += rdn;

      if (opts.skip && opts.skip(cell.cnn[i])) continue;
      const per = periodOf(cell, i, opts.year);
      if (!per.exists) continue;

      const wM = cell.w[i] / 10;
      const fwM = cell.fw[i] / 100;
      const we = extentW(wM, cam.scale);
      if (we <= 0.002) {
        held++;
        continue;
      }
      const ws = surfaceW(fwM, cam.scale);
      if (we > aExtent) aExtent = we;
      if (ws > aSurface) aSurface = ws;

      // cull before the path: the clip region an off-screen feature would add
      // is what the fill after it has to rasterise
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      const put = (p: Path2D, base: number, count: number): void => {
        for (let k = 0; k < count; k++) {
          const pr = f.proj.proj(cell.rwX[base + k], cell.rwY[base + k], 0.4);
          const X = sx(f, pr),
            Y = sy(f, pr);
          if (X < minX) minX = X;
          if (X > maxX) maxX = X;
          if (Y < minY) minY = Y;
          if (Y > maxY) maxY = Y;
          if (k) p.lineTo(X, Y);
          else p.moveTo(X, Y);
        }
        p.closePath();
      };
      const scratch = new Path2D();
      put(scratch, rwBase, rwn);
      if (maxX < -8 || minX > W + 8 || maxY < -8 || minY > H + 8) {
        held++;
        continue;
      }
      rowPath.addPath(scratch);
      surfaces++;

      if (ws > 0.002 && rdn > 0) {
        const road = per.paved ? roadPaved : roadRaw;
        for (let k = 0; k < rdn; k++) {
          const pr = f.proj.proj(cell.rdX[rdBase + k], cell.rdY[rdBase + k], 0.4);
          if (k) road.lineTo(sx(f, pr), sy(f, pr));
          else road.moveTo(sx(f, pr), sy(f, pr));
        }
        road.closePath();
        if (per.kerbed)
          for (let k = 0; k < rdn; k++) {
            if (!isKerbEdge(cell, kb + k)) continue;
            const a = f.proj.proj(cell.rdX[rdBase + k], cell.rdY[rdBase + k], 0.4);
            const j = (k + 1) % rdn;
            const b = f.proj.proj(cell.rdX[rdBase + j], cell.rdY[rdBase + j], 0.4);
            kerbPath.moveTo(sx(f, a), sy(f, a));
            kerbPath.lineTo(sx(f, b), sy(f, b));
          }
      }
    }
  }

  if (surfaces) {
    ctx.save();
    // the right of way, in one tone: the footway is what is left of it
    ctx.globalAlpha = ST_ALPHA * aExtent;
    ctx.fillStyle = ST_C_FOOT;
    ctx.fill(rowPath, "evenodd");
    if (aSurface > 0.002) {
      ctx.globalAlpha = ST_ALPHA * aSurface;
      ctx.fillStyle = ST_C_ROAD;
      ctx.fill(roadPaved, "evenodd");
      ctx.fillStyle = ST_C_RAW;
      ctx.fill(roadRaw, "evenodd");
      ctx.globalAlpha = ST_ALPHA * aSurface * 0.9;
      ctx.strokeStyle = ST_C_KERB;
      ctx.lineWidth = 0.8;
      ctx.stroke(kerbPath);
    }
    ctx.restore();
  }
  return { lines, surfaces, held };
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
