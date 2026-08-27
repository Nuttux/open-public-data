/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/canopy-shards.ts — ONE CELL'S CANOPY, TOLD AS FOUR TREES.

   A canopy cell is 24 m of ground (`lib/city/trees.ts` §TREE_GRID) and a
   full one implies a dome of `blobRadius(576)` = 15.3 m, which the
   reference's own spread takes to 19.3 — a solid 38 m across. At the wide
   cameras that is right and it is what the published page was measured
   against. Close in it is a lie you can see: Daniel, on a residential
   block, *"they look big like houses, sometimes even tey gobble em up"*.

   So close in the same cell is drawn as FOUR domes of half the radius,
   which is the one split that keeps the published area exactly:
   4 x pi(r/2)^2 = pi r^2. Nothing is invented and nothing is lost.

   ── WHY THIS IS A MODULE AND NOT A LOOP IN THE LAYER THAT DRAWS THEM ─────
   Because two layers have to agree about it. `layers/ground-detail.ts`
   draws the domes and `layers/canopy-shadow.ts` lays the discs they cast,
   and when only the first one was quartered the ground kept a single 38 m
   shadow under four small trees. MEASURED against the published page over
   the same lawn, that cost 21 to 29 levels of 255 — park-lawn came back
   -24.8/-21.1/-28.7 and sunset-lawn -21.3/-16.5/-17.9, a canopy shadow with
   no canopy over it. One function, so the shape and its shadow cannot drift
   apart again.
   ═══════════════════════════════════════════════════════════════════════ */

/** how many trees one cell's canopy is told as, close in */
export const CANOPY_SHARDS = 4;

/**
 * Where the `i`-th cell's quarters stand and how big each is.
 *
 * `out` is filled with `[x, z, r]` per quarter, so a caller can place them
 * without allocating. The offsets sit on the cell's own quadrants, each
 * nudged by a hash of its index — four thousand cells on a bare lattice read
 * as a grid, and the eye finds a grid before it finds a tree, which is the
 * same argument `setCrownYaw` makes. Derived from the index and not from a
 * generator, so a rebuild puts every tree back where it was.
 */
export function canopyShards(
  i: number,
  x: number,
  z: number,
  r: number,
  out: Float32Array,
): void {
  const rq = r / 2;
  const d = r * 0.55;
  for (let k = 0; k < CANOPY_SHARDS; k++) {
    const h = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
    const jx = (h - Math.floor(h) - 0.5) * 0.7;
    const h2 = Math.sin((i + 1) * 39.3468 + k * 11.135) * 24634.6345;
    const jy = (h2 - Math.floor(h2) - 0.5) * 0.7;
    out[k * 3] = x + (k & 1 ? d : -d) * (1 + jx);
    out[k * 3 + 1] = z + (k & 2 ? d : -d) * (1 + jy);
    out[k * 3 + 2] = rq;
  }
}
