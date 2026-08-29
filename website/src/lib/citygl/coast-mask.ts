/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/coast-mask.ts — A PUBLISHED SHORELINE, AT SUB-CELL RESOLUTION.

   ── THE PROBLEM THIS EXISTS FOR ──────────────────────────────────────────
   Both ground meshes are lattices of square-ish cells with one LAND BIT each:
   the city's DEM at 53.8 m and the surround at 110.0 x 139.2 m. A land bit is
   all or nothing, so the edge of the land is a staircase whose tread is the
   cell — five screen pixels at the whole-city camera on the city's grid, ten
   on the surround's. It is the first thing a reader sees and it is the
   cheapest-looking thing in the frame.

   Two earlier attempts cut the staircase back by DROPPING a cell whose CENTRE
   fell outside the published rings. Both are recorded in `layers/terrain.ts`
   and both were reverted, the second one after it deleted 2,172 of 37,754
   city land cells. A whole-cell test cannot do this job: the cell is the
   staircase, so a rule that answers per cell can only ever move the staircase,
   never remove it.

   ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────
   It answers per SUB-cell. The published rings are scan-converted once, at
   `K` sub-rows and sub-columns per lattice cell, into a bitset the mesh
   builders read: a cell wholly inside keeps its whole quad and costs nothing
   extra, a cell wholly outside is dropped, and a cell the line crosses is
   rebuilt as up to `K x K` sub-quads. The staircase's tread becomes cell / K
   and the land that survives is the land the published polygon actually
   covers.

   ── SCANLINE, NOT A POINT TEST PER SUB-CELL ──────────────────────────────
   The naive form is a ray-crossing test per sub-cell centre, which is
   `cells x K^2 x segments` — 477 million operations on the city's grid at
   K = 6 against 3,589 published segments. A scan conversion is
   `rows x segments` and answers the same question exactly: 1,560 rows x 3,589
   = 5.6 million, and it fills whole spans rather than testing points.

   ── THE UNION, AND WHY TWO REGISTERS ARE BOTH RIGHT ─────────────────────
   `rasteriseRings` takes a LIST of ring sets and ORs their fills. That is not
   a convenience: it is how the two published shorelines compose, and the
   composition is the pipeline's own.

   `emit_surround_coast.py` keeps a raster cell that is up to `city_pad_m`
   = 300 m OUTSIDE the regional hydrography, and `lib/city/terrain.ts`
   §cityOffshore says why in one sentence: *"within 300 m of the shore DataSF
   wins, because it is the city's own register of its own waterfront, and that
   is what keeps the Embarcadero's finger piers, Fort Mason and the Aquatic
   Park breakwater, which are real made land the county-scale hydrography does
   not carry."* The pad KEEPS those cells so a finer register can decide them.
   Nothing downstream ever decided. This is that decision, and it is the OR of
   the two registers rather than either alone:

     - the county-scale hydrography alone deletes the city's own waterfront —
       measured, 2,172 cells including all of the pier field;
     - the city's own outline alone deletes everything beyond the county line,
       which on this DEM is the whole southern quarter of the frame.

   MEASURED over the city's shipped land mask, 37,754 cells, centre test:
   inside the city's outline 35,627, inside the regional hydrography 35,582,
   inside EITHER 35,678. The 2,076 that neither register calls land are the
   300 m pad itself — a three-to-five cell band all the way round the coast,
   which is exactly the cream overhang this file exists to remove.

   ── EVEN-ODD, AND IT WAS CHECKED RATHER THAN ASSUMED ────────────────────
   Each set is filled even-odd, the rule `lib/city/water.ts` §inPoly uses.
   MEASURED against a non-zero winding fill over the same 37,754 cells, both
   rules answer identically on every cell of both sets — the published rings
   are disjoint, so there is nothing for the two rules to disagree about.
   ═══════════════════════════════════════════════════════════════════════ */

export type Ring = readonly (readonly [number, number])[];

/** The lattice a mask is built over: `nx * ny` cells, origin at a cell CORNER. */
export interface Lattice {
  readonly x0: number;
  readonly y0: number;
  readonly nx: number;
  readonly ny: number;
  readonly cellW: number;
  readonly cellH: number;
}

export interface CoastMask {
  readonly K: number;
  readonly lattice: Lattice;
  /** is the CENTRE of sub-cell (si, sj) of cell (i, j) inside the rings? */
  at(i: number, j: number, si: number, sj: number): boolean;
  /** how many of the cell's `K * K` sub-cells are inside — 0 or K*K is the fast path */
  countIn(i: number, j: number): number;
}

/**
 * ── AND THE SAME ANSWER CAN COME FROM A FIELD INSTEAD OF FROM RINGS ─────
 *
 * Everything above encodes "is this point land?" as polygons and then scan-
 * converts them back into a bitmap. `base/landmask` skips both halves of that
 * round trip: it IS the bitmap, one bit a node of `z >= 0` on NOAA's
 * integrated bathymetric-topographic DEM, on the Mean High Water datum where
 * zero is the line a chart draws its coast at.
 *
 * `pipeline/scripts/us_sf_city/build_landmask.py` has the derivation and the
 * failure that argued for it: the same DEM's zero CONTOUR, handed to the far
 * shore's cut as rings, dropped 35,561 of 56,330 cells and two thirds of the
 * region's land, because a contour is lines and a cut wants polygons with an
 * inside. A field has no inside to get wrong.
 *
 * 2,809 x 1,891 bits at 16.30 x 20.61 m — just finer than the 18.33 x 23.19 m
 * sub-cell the region's cut refines to, so it can answer every question that
 * cut will ask and none that it will not. 665,632 bytes, **30,716 gzipped**:
 * less than half the size of the 3,168-vertex ring file it replaces, for
 * 5,311,819 answers instead.
 */
export interface LandMask {
  readonly w: number;
  readonly h: number;
  readonly rowBytes: number;
  readonly world: readonly [number, number, number, number];
  readonly bits: Uint8Array;
}

/** Fetch the field, or null if this city does not ship one. */
export async function loadLandMask(base: string): Promise<LandMask | null> {
  if (typeof window !== "undefined" &&
      /(?:\?|&)lmask=0(?:&|$)/.test(window.location.search)) {
    return null;
  }
  try {
    const [mr, br] = await Promise.all([
      fetch(`${base}/base/landmask.json`),
      fetch(`${base}/base/landmask.bin`),
    ]);
    if (!mr.ok || !br.ok) return null;
    const meta = (await mr.json()) as {
      w: number; h: number; rowBytes: number;
      world: [number, number, number, number];
    };
    const buf = await br.arrayBuffer();
    if (buf.byteLength !== meta.rowBytes * meta.h) return null;
    return {
      w: meta.w, h: meta.h, rowBytes: meta.rowBytes, world: meta.world,
      bits: new Uint8Array(buf),
    };
  } catch {
    return null;
  }
}

/**
 * The same `CoastMask` a set of rings would produce, read off the field.
 *
 * A sub-cell centre is a world point, and the field answers world points, so
 * there is no rasterisation step at all — `at` is two multiplies and a bit
 * test. Outside the field's own box it CLAMPS to the edge rather than
 * answering "water": the field covers the region's own box, so nothing inside
 * the lattice can fall outside it, and clamping keeps a rounding error at the
 * boundary from deleting a coastal cell.
 */
export function maskFromField(lm: LandMask, lattice: Lattice, K: number): CoastMask {
  const [mx0, my0, mx1, my1] = lm.world;
  const sx = (lm.w - 1) / (mx1 - mx0);
  const sy = (lm.h - 1) / (my1 - my0);
  const { x0, y0, cellW, cellH } = lattice;

  const at = (i: number, j: number, si: number, sj: number): boolean => {
    const wx = x0 + (i + (si + 0.5) / K) * cellW;
    const wy = y0 + (j + (sj + 0.5) / K) * cellH;
    let u = Math.round((wx - mx0) * sx);
    let v = Math.round((wy - my0) * sy);
    u = u < 0 ? 0 : u > lm.w - 1 ? lm.w - 1 : u;
    v = v < 0 ? 0 : v > lm.h - 1 ? lm.h - 1 : v;
    const byte = lm.bits[v * lm.rowBytes + (u >> 3)];
    return ((byte >> (7 - (u & 7))) & 1) === 1;
  };

  return {
    K,
    lattice,
    at,
    countIn(i: number, j: number): number {
      let n = 0;
      for (let sj = 0; sj < K; sj++) {
        for (let si = 0; si < K; si++) if (at(i, j, si, sj)) n++;
      }
      return n;
    },
  };
}

/** one ring's box, so a scanline skips the sets it cannot cross */
interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function segmentsOf(sets: readonly (readonly Ring[])[]): Seg[][] {
  return sets.map((rings) => {
    const out: Seg[] = [];
    for (const ring of rings) {
      const n = ring.length;
      if (n < 3) continue;
      for (let k = 0, j = n - 1; k < n; j = k++) {
        const y0 = ring[j][1];
        const y1 = ring[k][1];
        // a horizontal edge crosses no scanline, and it is the one that makes
        // a crossing test double-count
        if (y0 === y1) continue;
        out.push({ x0: ring[j][0], y0, x1: ring[k][0], y1 });
      }
    }
    return out;
  });
}

/**
 * Scan-convert `sets` over `lattice` at `K` sub-cells a side.
 *
 * Each set is filled EVEN-ODD on its own and the fills are ORed, so a point
 * is land when ANY register calls it land — see the header.
 */
export function rasteriseRings(
  sets: readonly (readonly Ring[])[],
  lattice: Lattice,
  K: number,
): CoastMask {
  const { x0, y0, nx, ny, cellW, cellH } = lattice;
  const W = nx * K;
  const H = ny * K;
  const stride = (W + 7) >> 3;
  const bits = new Uint8Array(stride * H);
  const segs = segmentsOf(sets);
  const sw = cellW / K;
  const sh = cellH / K;

  /* scratch, reused for every row: the x of each crossing. 3,168 vertices is
     the largest published set, so no row can need more than that many. */
  let xs = new Float64Array(256);

  for (let r = 0; r < H; r++) {
    const wy = y0 + (r + 0.5) * sh;
    const row = r * stride;
    for (const set of segs) {
      let n = 0;
      for (const s of set) {
        // half-open in y, so a vertex shared by two edges is counted once
        if (s.y0 > wy === s.y1 > wy) continue;
        const t = (wy - s.y0) / (s.y1 - s.y0);
        if (n === xs.length) {
          const g = new Float64Array(xs.length * 2);
          g.set(xs);
          xs = g;
        }
        xs[n++] = s.x0 + t * (s.x1 - s.x0);
      }
      if (n < 2) continue;
      const line = xs.subarray(0, n);
      line.sort();
      for (let k = 0; k + 1 < n; k += 2) {
        /* the span [line[k], line[k+1]] is inside. A sub-cell is inside when
           its CENTRE is, so the first covered column is the first centre at or
           past the span's start: centre(c) = x0 + (c + 0.5) * sw. */
        let c0 = Math.ceil((line[k] - x0) / sw - 0.5);
        let c1 = Math.floor((line[k + 1] - x0) / sw - 0.5);
        if (c1 < 0 || c0 > W - 1) continue;
        if (c0 < 0) c0 = 0;
        if (c1 > W - 1) c1 = W - 1;
        for (let c = c0; c <= c1; c++) bits[row + (c >> 3)] |= 1 << (c & 7);
      }
    }
  }

  const KK = K * K;
  return {
    K,
    lattice,
    at(i, j, si, sj) {
      const c = i * K + si;
      const r = j * K + sj;
      if (c < 0 || r < 0 || c >= W || r >= H) return false;
      return ((bits[r * stride + (c >> 3)] >> (c & 7)) & 1) === 1;
    },
    countIn(i, j) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) return 0;
      let n = 0;
      for (let sj = 0; sj < K; sj++) {
        const r = (j * K + sj) * stride;
        for (let si = 0; si < K; si++) {
          const c = i * K + si;
          n += (bits[r + (c >> 3)] >> (c & 7)) & 1;
        }
      }
      return n === KK ? KK : n;
    },
  };
}
