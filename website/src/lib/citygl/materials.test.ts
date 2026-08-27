import { describe, expect, it } from "vitest";

import { legendTones, wallPalette } from "@/components/us/city/palette";
import {
  bldgMaterials,
  legendDraw,
  roofShadeTable,
  type LocaleLegend,
  type MaterialConfig,
} from "./materials";
import type { BldgTable } from "./bldg";

/**
 * WHAT THIS TEST IS FOR.
 *
 * The locale legend is the fallback for the footprints no roll row reaches,
 * and there are two ways to get it wrong that a screenshot cannot show:
 *
 *  · handing it a draw keyed on the ROW rather than on the published id, which
 *    `scene.ts` measured at 20.0 % of `base/solo` coming out a different
 *    material from the reference — and every one of those is a building in a
 *    district that has nothing else to look at;
 *  · letting it reach a footprint the roll DOES class, which would replace a
 *    published material with a positional guess.
 *
 * Both are asserted here. The tone table itself is `palette.ts`'s and is not
 * restated: this checks that the right rows reach it with the right arguments.
 */

/** `UMAT_WALL` index 7 is `mixed / unknown`, the roll's own honest bucket */
const USE_UNCLASSED = 7;
/** index 0 is `single family`, which the roll does class */
const USE_CLASSED = 0;

function table(rows: { use: number; cx: number; cy: number; gid: number }[]): BldgTable {
  const n = rows.length;
  return {
    n,
    gid: Uint32Array.from(rows.map((r) => r.gid)),
    off: Uint32Array.from({ length: n + 1 }, (_, i) => i * 4),
    vx: new Float32Array(n * 4),
    vy: new Float32Array(n * 4),
    cx: Float32Array.from(rows.map((r) => r.cx)),
    cy: Float32Array.from(rows.map((r) => r.cy)),
    h: Uint16Array.from(rows.map(() => 10)),
    hf: new Uint8Array(n),
    yr: Uint8Array.from(rows.map(() => 100)),
    u: Uint8Array.from(rows.map((r) => r.use)),
    st: Uint8Array.from(rows.map(() => 2)),
    paintIdx: new Uint8Array(n),
    /* the nosample bit SET, so the measured roof does not overwrite what the
       legend chose — the override is the last thing `bldgMaterials` does and
       it would hide the roof half of this entirely */
    paintFlag: Uint8Array.from(rows.map(() => 4)),
  };
}

const LEGEND: LocaleLegend = {
  originX: 0,
  originY: 0,
  maxR: 1000,
  lineX: 0,
  lineY: 0,
  lineDX: 1,
  lineDY: 0,
  tones: legendTones,
};

const CFG = (legend: LocaleLegend | null): MaterialConfig => ({
  hq: [],
  noSampleBit: 4,
  year0: 1849,
  legend,
  fallbackRoof: 1,
  fallbackWall: 1,
});

describe("the locale legend", () => {
  it("reaches only the footprints the roll does not class", () => {
    const tb = table([
      { use: USE_CLASSED, cx: 900, cy: 0, gid: 1 },
      { use: USE_UNCLASSED, cx: 900, cy: 0, gid: 1 },
    ]);
    const m = bldgMaterials(tb, CFG(LEGEND));
    /* the classed row takes its published material; the unclassed one takes
       the legend, and at the same place with the same draw they must differ
       or the legend is not being reached. The cross product is zero on the
       line itself and `scene.ts` puts that case on side 1, not side 0 — the
       test asked for 0 and caught its own transcription of the predicate. */
    const want = legendTones(0.9, 1, legendDraw(1));
    expect(m.wall[1]).toBe(want.wall);
    expect(m.roof[1]).toBe(want.roof);
    expect(m.wall[0]).not.toBe(want.wall);
  });

  it("keys the draw on the PUBLISHED id, not on the row's place in the chunk", () => {
    /* the same building, at the same point, decoded as row 0 of one chunk and
       row 3 of another. `scene.ts` measured this exact mistake at 3,053 of
       15,261 footprints — 20.0 % — carrying a different material. */
    const solo = table([{ use: USE_UNCLASSED, cx: 500, cy: 120, gid: 90210 }]);
    const inChunk = table([
      { use: USE_UNCLASSED, cx: -1, cy: -1, gid: 7 },
      { use: USE_UNCLASSED, cx: -1, cy: -1, gid: 8 },
      { use: USE_UNCLASSED, cx: -1, cy: -1, gid: 9 },
      { use: USE_UNCLASSED, cx: 500, cy: 120, gid: 90210 },
    ]);
    const a = bldgMaterials(solo, CFG(LEGEND));
    const b = bldgMaterials(inChunk, CFG(LEGEND));
    expect(b.wall[3]).toBe(a.wall[0]);
    expect(b.roof[3]).toBe(a.roof[0]);
  });

  it("splits on which side of the published line the parcel falls", () => {
    /* the line runs along +x through the origin, so the sign of `cy` is the
       side. Same distance, same draw, opposite sides. */
    const tb = table([
      { use: USE_UNCLASSED, cx: 0, cy: 600, gid: 4242 },
      { use: USE_UNCLASSED, cx: 0, cy: -600, gid: 4242 },
    ]);
    const m = bldgMaterials(tb, CFG(LEGEND));
    const u = legendDraw(4242);
    expect(m.wall[0]).toBe(legendTones(0.6, 1, u).wall);
    expect(m.wall[1]).toBe(legendTones(0.6, 0, u).wall);
  });

  it("spreads a district over the palette instead of repeating one tone", () => {
    /* THE COMPLAINT THIS ANSWERS, as a number. A cluster of unclassed
       footprints used to take one neutral pair; the legend gives the same
       cluster the spread the reference gives it. */
    const rows = Array.from({ length: 600 }, (_, i) => ({
      use: USE_UNCLASSED,
      cx: 700 + (i % 25) * 4,
      cy: 900 + Math.floor(i / 25) * 4,
      gid: 10_000 + i,
    }));
    const tb = table(rows);
    const withLegend = new Set(bldgMaterials(tb, CFG(LEGEND)).wall);
    const without = new Set(bldgMaterials(tb, CFG(null)).wall);
    expect(without.size).toBe(1);
    expect(withLegend.size).toBeGreaterThanOrEqual(4);
  });

  it("falls back to the neutral pair where a city publishes no legend", () => {
    const tb = table([{ use: USE_UNCLASSED, cx: 10, cy: 10, gid: 3 }]);
    const m = bldgMaterials(tb, CFG(null));
    expect(m.wall[0]).toBe(1);
    expect(m.roof[0]).toBe(1);
  });

  it("draws the same number for the same id, every time", () => {
    expect(legendDraw(12345)).toBe(legendDraw(12345));
    expect(legendDraw(12345)).toBeGreaterThanOrEqual(0);
    expect(legendDraw(12345)).toBeLessThan(1);
  });
});

describe("roofShadeTable", () => {
  it("is four shades an entry, monotone in the height step", () => {
    const t = roofShadeTable(["#808080", "#404040"]);
    expect(t.length).toBe(8);
    const lum = (h: string): number =>
      parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    for (const c of [0, 1]) {
      const four = t.slice(c * 4, c * 4 + 4).map(lum);
      for (let i = 1; i < 4; i++) expect(four[i]).toBeGreaterThan(four[i - 1]);
    }
  });

  it("lifts the whole palette above its raw value — a roof is the top face", () => {
    /* `roofTone` is what makes the measured aerial palette a MATERIAL under a
       sun rather than a photograph's dead value, and this table used to skip
       it. The middle two steps straddle 1.0, so the toned entry has to sit
       above the raw one for the table to be doing its job at all. */
    const raw = "#4a4a44";
    const t = roofShadeTable([raw]);
    const lum = (h: string): number =>
      parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(t[1])).toBeGreaterThan(lum(raw));
  });
});

describe("the wall palette is not the roof palette", () => {
  it("has entries for every index the legend can return", () => {
    const w = wallPalette();
    for (let r = 0; r <= 1; r += 0.05) {
      for (const side of [0, 1]) {
        for (let u = 0; u < 1; u += 0.05) {
          expect(w[legendTones(r, side, u).wall]).toBeTypeOf("string");
        }
      }
    }
  });
});
