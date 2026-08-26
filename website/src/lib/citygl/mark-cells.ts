/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/mark-cells.ts — WHICH DEM CELLS A PUBLISHED RING COVERS.

   `TerrainField` colours a node from two rows of its ramp: ordinary ground,
   and PARK. Which row it reads is a per-cell byte the field does not fill
   itself — the rings that decide it are published separately, and the caller
   has to walk them. `scene.ts` does exactly this and calls it `markCells`;
   this is the same walk, in a file the GPU path can reach without importing
   the Canvas renderer behind it.

   The consequence of not doing it is not subtle and it shipped for an hour:
   every park in the city came out the same bleached cream as the street
   beside it, because the greens were in the ramp and nothing ever selected
   them.
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
 * Bounded by each ring's box first, so this is the ring's own area and not
 * the city's — 328 rings over a 260 x 260 grid finishes in a few
 * milliseconds at build.
 */
export function markTerrainCells(t: TerrainField, rings: readonly Ring[], out: Uint8Array): void {
  const N = t.N;
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
        if (inPoly(x, y, ring)) out[i * N + j] = 1;
      }
    }
  }
}
