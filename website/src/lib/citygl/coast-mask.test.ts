import { describe, expect, it } from "vitest";

import { rasteriseRings, type Lattice, type Ring } from "./coast-mask";

/* ═══════════════════════════════════════════════════════════════════════
   THE ONE THING IN THIS ENGINE THAT CAN DELETE A CITY.

   `layers/terrain.ts` drops a DEM cell when this file says no part of it is
   inside any published ring. Two earlier coast attempts deleted real land —
   2,172 cells the second time, 3.44 km2 of one beach — so the rule that
   decides it is worth asserting rather than trusting: a square fills as a
   square, a hole inside it is a hole, two sets OR rather than cancel, and a
   point outside every set is never land.
   ═══════════════════════════════════════════════════════════════════════ */

/** a closed axis-aligned rectangle, first vertex repeated as the published
 *  rings are — the closure must not double-count a scanline crossing */
function rect(x0: number, y0: number, x1: number, y1: number): Ring {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

const LAT: Lattice = { x0: 0, y0: 0, nx: 10, ny: 10, cellW: 10, cellH: 10 };

describe("rasteriseRings", () => {
  it("fills a rectangle on its own cell boundaries", () => {
    // 30..70 in both axes: cells 3,4,5,6 are wholly inside at any K
    const m = rasteriseRings([[rect(30, 30, 70, 70)]], LAT, 4);
    expect(m.countIn(4, 4)).toBe(16);
    expect(m.countIn(3, 3)).toBe(16);
    expect(m.countIn(6, 6)).toBe(16);
    expect(m.countIn(2, 4)).toBe(0);
    expect(m.countIn(7, 4)).toBe(0);
    expect(m.countIn(4, 2)).toBe(0);
  });

  it("splits a cell the line crosses, which is the whole point", () => {
    // the edge at x = 35 cuts cell 3 at its own quarter
    const m = rasteriseRings([[rect(35, 0, 100, 100)]], LAT, 4);
    const n = m.countIn(3, 5);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(16);
    // sub-columns 0 (centre 31.25) out, 1 (centre 33.75) out, 2 and 3 in
    expect(m.at(3, 5, 0, 0)).toBe(false);
    expect(m.at(3, 5, 1, 0)).toBe(false);
    expect(m.at(3, 5, 2, 0)).toBe(true);
    expect(m.at(3, 5, 3, 0)).toBe(true);
  });

  it("treats a ring inside a ring as a hole, even-odd", () => {
    const m = rasteriseRings([[rect(0, 0, 100, 100), rect(30, 30, 70, 70)]], LAT, 2);
    expect(m.countIn(1, 1)).toBe(4); // outside the inner ring: land
    expect(m.countIn(5, 5)).toBe(0); // inside it: the hole
  });

  it("ORs two sets rather than cancelling them — §THE UNION", () => {
    /* the failure this guards: with both sets filled into ONE even-odd pass,
       a point inside both would flip twice and come out water. That is the
       pier field and the county line at once. */
    const a: Ring[] = [rect(0, 0, 60, 100)];
    const b: Ring[] = [rect(40, 0, 100, 100)];
    const m = rasteriseRings([a, b], LAT, 2);
    expect(m.countIn(5, 5)).toBe(4); // in both
    expect(m.countIn(1, 5)).toBe(4); // in a only
    expect(m.countIn(8, 5)).toBe(4); // in b only
  });

  it("never calls a point land when no set contains it", () => {
    const m = rasteriseRings([[rect(20, 20, 40, 40)], [rect(60, 60, 80, 80)]], LAT, 3);
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const inA = i >= 2 && i < 4 && j >= 2 && j < 4;
        const inB = i >= 6 && i < 8 && j >= 6 && j < 8;
        if (!inA && !inB) expect(m.countIn(i, j)).toBe(0);
      }
    }
  });

  it("answers false outside the lattice instead of reading a neighbour's bits", () => {
    const m = rasteriseRings([[rect(0, 0, 100, 100)]], LAT, 2);
    expect(m.at(-1, 0, 0, 0)).toBe(false);
    expect(m.at(0, -1, 0, 0)).toBe(false);
    expect(m.at(10, 0, 0, 0)).toBe(false);
    expect(m.countIn(10, 10)).toBe(0);
  });

  it("takes a non-square cell, which the far shore's lattice is", () => {
    const lat: Lattice = { x0: 0, y0: 0, nx: 8, ny: 8, cellW: 110, cellH: 139 };
    const m = rasteriseRings([[rect(220, 278, 550, 695)]], lat, 4);
    expect(m.countIn(3, 3)).toBe(16);
    expect(m.countIn(1, 3)).toBe(0);
    expect(m.countIn(3, 1)).toBe(0);
  });
});
