import { describe, expect, it } from "vitest";

import { rasteriseRings, type Lattice, type Ring } from "../coast-mask";
import { plateGeometry, type Box, type CityCut } from "./water";

/* ═══════════════════════════════════════════════════════════════════════
   THE PLATE MUST NOT PAINT LAND.

   It did, over 22.5 km2 of San Francisco — `water.ts` §THE PLATE IS CUT has
   the count and the cause. The defect was invisible to every test in this
   engine because the plate was two triangles over the whole world and the
   frame only looked right while the ground happened to cover it.

   So the property asserted here is the one the picture depends on: no part
   of what this builds lies inside a published ring, unless the cell it
   belongs to is one the register itself calls offshore — and every part of
   the box that is NOT inside a ring is still covered.
   ═══════════════════════════════════════════════════════════════════════ */

/** a closed rectangle, first vertex repeated as the published rings are */
function rect(x0: number, y0: number, x1: number, y1: number): Ring {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

/** the lattice stands in for the city's DEM: 10 x 10 cells of 10 m */
const LAT: Lattice = { x0: 0, y0: 0, nx: 10, ny: 10, cellW: 10, cellH: 10 };
/** and the plate reaches 50 m past it on every side */
const BOX: Box = [-50, -50, 150, 150];

function cut(sets: readonly (readonly Ring[])[], offshore?: (i: number, j: number) => boolean): CityCut {
  return {
    lat: LAT,
    mask: rasteriseRings(sets, LAT, 6),
    offshore: offshore ?? (() => false),
  };
}

/** every triangle's centroid, in world x/z */
function centroids(geo: { attributes: Record<string, { array: ArrayLike<number> }>; index: { array: ArrayLike<number> } | null }): [number, number][] {
  const pos = geo.attributes.position.array;
  const idx = geo.index?.array;
  if (!idx) throw new Error("the plate is indexed");
  const out: [number, number][] = [];
  for (let t = 0; t < idx.length; t += 3) {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += pos[idx[t + k] * 3];
      z += pos[idx[t + k] * 3 + 2];
    }
    out.push([x / 3, z / 3]);
  }
  return out;
}

function inRect(x: number, y: number, r: readonly number[]): boolean {
  return x > r[0] && x < r[2] && y > r[1] && y < r[3];
}

/** is world point (x, z) covered by any triangle of the plate? */
function covers(
  geo: { attributes: Record<string, { array: ArrayLike<number> }>; index: { array: ArrayLike<number> } | null },
  x: number,
  z: number,
): boolean {
  const pos = geo.attributes.position.array;
  const idx = geo.index?.array;
  if (!idx) throw new Error("the plate is indexed");
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = pos[a], az = pos[a + 2];
    const bx = pos[b], bz = pos[b + 2];
    const cx = pos[c], cz = pos[c + 2];
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos3 = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos3)) return true;
  }
  return false;
}

describe("plateGeometry", () => {
  it("with no cut it is the whole rectangle, as it always was", () => {
    const { geo, stats } = plateGeometry(BOX, null);
    expect(stats).toBeNull();
    expect(geo.index?.count).toBe(6);
    const c = centroids(geo);
    // both triangles sit inside the box and nowhere else
    for (const [x, z] of c) expect(inRect(x, z, [-50, -50, 150, 150])).toBe(true);
  });

  it("emits no triangle inside a published land ring", () => {
    // 30..70 in both axes is land; everything else in the box is water
    const c = cut([[rect(30, 30, 70, 70)], [rect(30, 30, 70, 70)]]);
    const { geo, stats } = plateGeometry(BOX, c);
    expect(stats).not.toBeNull();
    for (const [x, z] of centroids(geo)) {
      expect(inRect(x, z, [30, 30, 70, 70])).toBe(false);
    }
    // and the land it stopped painting is that square, to the sub-cell
    const KK = 6 * 6;
    expect(stats?.landSub).toBe(4 * 4 * KK);
  });

  it("still covers the water on both sides of the lattice edge", () => {
    const c = cut([[rect(30, 30, 70, 70)], [rect(30, 30, 70, 70)]]);
    const { geo } = plateGeometry(BOX, c);
    // outside the lattice altogether — the bands
    expect(covers(geo, -25, -25)).toBe(true);
    expect(covers(geo, 125, 125)).toBe(true);
    expect(covers(geo, -25, 50)).toBe(true);
    expect(covers(geo, 125, 50)).toBe(true);
    // inside the lattice but outside the ring, on both sides of it
    expect(covers(geo, 15, 50)).toBe(true);
    expect(covers(geo, 85, 50)).toBe(true);
    // and not inside it
    expect(covers(geo, 50, 50)).toBe(false);
  });

  it("an offshore cell is water however the ring is wound", () => {
    /* the published `cityOffshore` bit: this cell is more than 300 m outside
       the regional hydrography, so the county outline calling it land is a
       legal boundary and not a shoreline. Cell (4,4) is 40..50 in both axes,
       wholly inside the ring above. */
    const c = cut([[rect(30, 30, 70, 70)], [rect(30, 30, 70, 70)]], (i, j) => i === 4 && j === 4);
    const { geo } = plateGeometry(BOX, c);
    expect(covers(geo, 45, 45)).toBe(true);
    // and its neighbour, which is not flagged, is still dry
    expect(covers(geo, 55, 45)).toBe(false);
  });

  it("merges runs rather than emitting a quad per sub-cell", () => {
    /* 10 x 10 cells at K = 6 is 3,600 sub-cells; a quad each would be 7,200
       triangles. The merge has to collapse the open water to a handful. */
    const c = cut([[rect(30, 30, 70, 70)], [rect(30, 30, 70, 70)]]);
    const { stats } = plateGeometry(BOX, c);
    expect(stats).not.toBeNull();
    expect(stats!.triangles).toBeLessThan(40);
  });
});
