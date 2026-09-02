import { describe, expect, it } from "vitest";

import { TILE_CSS, tilePlane, wantsTiles, type TileIndex } from "./tile-plane";

/* the shape `scripts/render-city-tiles.mjs` writes, with the numbers it wrote
   for the present-year pyramid on 2026-09-02 */
const INDEX: TileIndex = {
  tile: 512,
  dpr: 2,
  ref: { cx: 241.427019126574, cy: 707.0567508859249, scale: 0.0681567332915786 },
  levels: {
    "0": { band: 0, scale: 0.0085195916614473, tiles: [1, 1], px: [320, 192] },
    "1": { band: 0, scale: 0.0170391833228946, tiles: [2, 1], px: [640, 384] },
    "2": { band: 0, scale: 0.0340783666457893, tiles: [3, 2], px: [1280, 768] },
    "3": { band: 0, scale: 0.0681567332915786, tiles: [5, 3], px: [2560, 1536] },
    "4": { band: 1, scale: 0.1363134665831572, tiles: [10, 6], px: [5120, 3072] },
  },
};

describe("the pyramid's frame", () => {
  const tp = tilePlane(INDEX);

  it("shows level 3 at the camera it was rendered on", () => {
    /* the renderer's own CSS px per plane unit at level 3, shown 1:1 */
    expect(tp.scaleAt(3)).toBeCloseTo(INDEX.ref.scale, 12);
    expect(tp.zoomFor(INDEX.ref.scale)).toBeCloseTo(3, 12);
  });

  it("puts the reference camera at the centre of every level", () => {
    const [X, Y] = tp.toFrame(INDEX.ref.cx, INDEX.ref.cy);
    expect(X).toBeCloseTo(tp.w0 / 2, 12);
    expect(Y).toBeCloseTo(tp.h0 / 2, 12);
    /* and level 0 is one tile's worth of the renderer's 320 x 192 device px */
    expect(tp.w0).toBe((320 * TILE_CSS) / 512);
    expect(tp.h0).toBe((192 * TILE_CSS) / 512);
  });

  it("round-trips plane and frame", () => {
    for (const [px, py] of [[0, 0], [241.4, 707.1], [-3000, 5000], [9000, -2000]]) {
      const [X, Y] = tp.toFrame(px, py);
      const [bx, by] = tp.toPlane(X, Y);
      expect(bx).toBeCloseTo(px, 9);
      expect(by).toBeCloseTo(py, 9);
    }
  });

  it("flips y: north on the plane is up on the tile", () => {
    const [, y0] = tp.toFrame(0, 0);
    const [, y1] = tp.toFrame(0, 100);
    expect(y1).toBeLessThan(y0);
  });

  it("hands the overlay the camera a view stands for", () => {
    const cam = tp.cameraOf(tp.w0 / 2, tp.h0 / 2, 3);
    expect(cam.cx).toBeCloseTo(INDEX.ref.cx, 9);
    expect(cam.cy).toBeCloseTo(INDEX.ref.cy, 9);
    expect(cam.scale).toBeCloseTo(INDEX.ref.scale, 12);
    /* a level-3 tile edge is 256 shown px, which is 256 / scale plane units */
    const edge = tp.cameraOf(tp.w0 / 2 + TILE_CSS / 2 ** 3, tp.h0 / 2, 3);
    expect(edge.cx - cam.cx).toBeCloseTo(TILE_CSS / INDEX.ref.scale, 6);
  });

  it("refuses an index without a level 0", () => {
    expect(() => tilePlane({ ...INDEX, levels: {} })).toThrow();
  });
});

describe("which renderer", () => {
  it("is the phone's, on a phone", () => {
    expect(wantsTiles("", { coarse: true, width: 390 }, true)).toBe(true);
    expect(wantsTiles("", { coarse: true, width: 1024 }, true)).toBe(false);
    expect(wantsTiles("", { coarse: false, width: 390 }, true)).toBe(false);
  });
  it("is whatever the query says", () => {
    expect(wantsTiles("?tiles=1", { coarse: false, width: 1600 }, true)).toBe(true);
    expect(wantsTiles("?a=1&tiles=0", { coarse: true, width: 390 }, true)).toBe(false);
  });
  it("is never tiles for a city with no pyramid", () => {
    expect(wantsTiles("?tiles=1", { coarse: true, width: 390 }, false)).toBe(false);
  });
});
