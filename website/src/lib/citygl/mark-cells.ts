/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/mark-cells.ts — WHICH DEM CELLS A PUBLISHED RING SET COVERS.

   `TerrainField` colours a node from two rows of its ramp — ordinary ground
   and PARK — and lerps the result toward one ash tone by a third per-cell
   byte, the BURN. Neither byte is filled by the field: the rings that decide
   them are published separately, and the caller has to walk them. `scene.ts`
   does exactly this and calls it `markCells`; this is the same walk, in a
   file the GPU path can reach without importing the Canvas renderer behind
   it.

   The consequence of not doing it is not subtle and it shipped for an hour:
   every park in the city came out the same bleached cream as the street
   beside it, because the greens were in the ramp and nothing ever selected
   them. The burn had the same defect and it shipped for longer — see
   `fire.ts`.

   ── TWO FILL RULES, AND THE CHOICE IS THE REGISTER'S, NOT OURS ────────────
   A set of park rings is a set of separate parks: a cell inside ANY of them
   is park, and the union is right. A burned-district polygon is one boundary
   with HOLES in it — the pockets that did not burn — and for that the union
   is wrong, because a hole ring would mark the ground it exists to spare.
   Both rules are here and the caller names the one its register uses.
   ═══════════════════════════════════════════════════════════════════════ */

import type { TerrainField } from "@/lib/city/terrain";

type Ring = readonly (readonly [number, number])[];

/** the ray-crossing test, on the ring's own vertices */
function inPoly(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const yi = ring[k][1];
    const yj = ring[j][1];
    if (yi > y !== yj > y) {
      const xi = ring[k][0];
      const xj = ring[j][0];
      if (x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside;
    }
  }
  return inside;
}

/**
 * Set `out[i * N + j]` for every cell whose own corner falls inside a ring.
 *
 * THE UNION RULE — a cell inside any one ring is marked. This is the rule
 * `scene.ts` §markCells applies and it is byte-identical to it, so the parks
 * the two renderers select are the same parks.
 *
 * Bounded by each ring's box first, so this is the ring's own area and not
 * the city's — 328 rings over a 260 x 260 grid finishes in a few
 * milliseconds at build.
 */
export function markTerrainCells(t: TerrainField, rings: readonly Ring[], out: Uint8Array): number {
  const N = t.N;
  let marked = 0;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
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
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x = t.proj.X0 + i * t.cellM;
        const y = t.proj.Y0 + j * t.cellM;
        if (inPoly(x, y, ring) && !out[i * N + j]) {
          out[i * N + j] = 1;
          marked++;
        }
      }
    }
  }
  return marked;
}

/**
 * The same walk under the EVEN-ODD rule: a cell is marked when an odd number
 * of the rings contain it, so a ring drawn inside another one CUTS A HOLE.
 *
 * ── WHY THIS EXISTS, MEASURED ─────────────────────────────────────────────
 * The burned-district register this port reads (`base/coast`'s `burnLen` /
 * `burnXY`) ships **seven rings: one outer boundary of 130 vertices and six
 * inner ones**, the inner six wound the other way and totalling 82,195 m2
 * against the outer ring's 10.40 km2. They are pockets the register says did
 * NOT burn, and the published Canvas renderer already honours them — its own
 * fill of the same rings is `g.fill("evenodd")`.
 *
 * Under the union rule those six pockets come out marked. MEASURED over the
 * shipped register on this DEM's 260 x 260 lattice: **3,597 cells union
 * against 3,570 even-odd, 3,573 against 3,546 on land — 27 cells, 78,190 m2,
 * 0.76 % of the burned ground** that the union rule paints as ash and the
 * register says was spared. Small, and wrong in the direction that matters:
 * the whole point of a hole in a disaster boundary is that something stood.
 *
 * The union bounding box is walked once rather than each ring's own, because
 * a parity count cannot be accumulated ring by ring.
 */
export function markTerrainCellsEvenOdd(
  t: TerrainField,
  rings: readonly Ring[],
  out: Uint8Array,
): number {
  const N = t.N;
  const use = rings.filter((r) => r.length >= 3);
  if (!use.length) return 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of use) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const g0 = t.toGrid(x0, y0);
  const g1 = t.toGrid(x1, y1);
  const i0 = Math.max(0, Math.floor(g0[0]));
  const j0 = Math.max(0, Math.floor(g0[1]));
  const i1 = Math.min(N - 1, Math.ceil(g1[0]));
  const j1 = Math.min(N - 1, Math.ceil(g1[1]));
  let marked = 0;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const x = t.proj.X0 + i * t.cellM;
      const y = t.proj.Y0 + j * t.cellM;
      let cross = 0;
      for (const ring of use) if (inPoly(x, y, ring)) cross++;
      if ((cross & 1) === 1 && !out[i * N + j]) {
        out[i * N + j] = 1;
        marked++;
      }
    }
  }
  return marked;
}
