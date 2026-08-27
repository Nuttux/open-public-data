import { describe, expect, it } from "vitest";

import { terrainRGB } from "@/lib/city/terrain";
import type { TerrainField } from "@/lib/city/terrain";
import { burnFadeAt } from "./fire";
import { markTerrainCells, markTerrainCellsEvenOdd } from "./mark-cells";

/**
 * A lattice with nothing on it but a grid — enough for the two `mark-cells`
 * walks, which read only `N`, `cellM`, `proj.X0/Y0` and `toGrid`.
 */
function lattice(N: number, cellM: number): TerrainField {
  return {
    N,
    cellM,
    proj: { X0: 0, Y0: 0, s: 1 / cellM, N },
    toGrid: (x: number, y: number) => [x / cellM, y / cellM] as [number, number],
  } as unknown as TerrainField;
}

const square = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): readonly (readonly [number, number])[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe("mark-cells: a hole in a published boundary is not burned ground", () => {
  /* A 10 x 10 outer square with a 4 x 4 square inside it, on a 1 m lattice.
     The ray-crossing test is half-open in both axes — a corner on the low
     edge counts and one on the high edge does not — so the outer square takes
     a 10 x 10 block of corners and the inner one a 4 x 4 block inside it. */
  const t = lattice(32, 1);
  const rings = [square(4, 4, 14, 14), square(7, 7, 11, 11)];

  it("the union rule marks the hole", () => {
    const out = new Uint8Array(32 * 32);
    expect(markTerrainCells(t, rings, out)).toBe(10 * 10);
  });

  it("the even-odd rule spares it", () => {
    const out = new Uint8Array(32 * 32);
    expect(markTerrainCellsEvenOdd(t, rings, out)).toBe(10 * 10 - 4 * 4);
  });

  it("and marks the same ground where there is no hole", () => {
    const one = [square(4, 4, 14, 14)];
    const a = new Uint8Array(32 * 32);
    const b = new Uint8Array(32 * 32);
    markTerrainCells(t, one, a);
    markTerrainCellsEvenOdd(t, one, b);
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});

describe("burnFadeAt is the reference renderer's own burnPhase", () => {
  /* `gen/part4.html` L160:
       burnPhase(year) = year <= 1906 ? 1 : (year >= 1913 ? 0 : 1-(year-1906)/7)
     with its two years lifted out into parameters. */
  const ref = (y: number): number => (y <= 1906 ? 1 : y >= 1913 ? 0 : 1 - (y - 1906) / 7);
  it("agrees with it over the whole window", () => {
    for (let y = 1900; y <= 1920; y += 0.25) {
      expect(burnFadeAt(y, 1906, 1913)).toBeCloseTo(ref(y), 12);
    }
  });
  it("degenerates to a step when the window has no width", () => {
    expect(burnFadeAt(1906, 1906, 1906)).toBe(1);
    expect(burnFadeAt(1907, 1906, 1906)).toBe(0);
  });
});

/**
 * THE CROSS-FADE IS THE SAME PICTURE, AND THIS IS THE REFERENCE'S OWN CHECK.
 *
 * `fire.ts` never recomputes the ground at a moving phase: it precomputes the
 * node colour at burnT 0 and at burnT 1 and lerps between them. That is the
 * method `gen/part4.html` states and bounds — *"against a direct render at
 * burnT 0.2 / 0.5 / 0.8, zero pixels differ by more than 6 and the largest
 * single difference is 7/255"*.
 *
 * TWO TERMS MAKE IT AN APPROXIMATION AND BOTH ARE MEASURED HERE:
 *
 *   · `skylitN` renormalises the tinted colour back to the input's own
 *     luminance, which is a ratio and not an affine map, so it does not
 *     commute with a lerp. On its own it is worth **0.013 of 255** across
 *     this sweep — nothing.
 *   · the buffer three reads is in the LINEAR working space, so the lerp
 *     happens there and not in the sRGB bytes the ramp is written in. That is
 *     the larger term and it is the one this asserts.
 *
 * Swept over the ramp's own domain rather than over a picture, which is
 * strictly harder than the reference's check: every elevation, every Lambert,
 * both park rows, the whole canopy range.
 */
describe("the ash cross-fade against a direct render", () => {
  /* three's own transfer functions, which is what `Color.setRGB(…, SRGB)` and
     the renderer's output conversion do to every one of these values */
  const toLinear = (v: number): number =>
    v < 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4);
  const toSRGB = (v: number): number =>
    v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 0.41666) - 0.055;

  it("stays inside the reference's own bound", () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    const d: [number, number, number] = [0, 0, 0];
    let worst = 0;
    let sum = 0;
    let n = 0;
    for (let z = 0; z <= 300; z += 25) {
      for (let lam = 0; lam <= 1.0001; lam += 0.1) {
        for (const park of [0, 0.5, 1]) {
          for (const can of [0, 40, 120, 255]) {
            terrainRGB(z, lam, park, 0, can, a);
            terrainRGB(z, lam, park, 1, can, b);
            for (const p of [0.2, 0.5, 0.8]) {
              terrainRGB(z, lam, park, p, can, d);
              for (let c = 0; c < 3; c++) {
                /* `fire.ts` spends the phase in the ramp's own sRGB bytes and
                   applies the transfer on the way into the buffer, so the
                   round trip here is the one it actually does */
                const got = 255 * toSRGB(toLinear((a[c] + (b[c] - a[c]) * p) / 255));
                const err = Math.abs(got - d[c]);
                if (err > worst) worst = err;
                sum += err;
                n++;
              }
            }
          }
        }
      }
    }
    /* MEASURED over this sweep: **max 0.013 of 255, mean 0.0014**, and the
       whole of it is `skylitN`. Lerping in the buffer's LINEAR space instead
       — which is the obvious way to do it and is what this shipped with for
       an hour — runs max 15.4 and mean 1.86 on the same sweep, over the
       reference's own bound. That is the measurement the byte-space lerp
       exists for and it is asserted here so it cannot quietly come back. */
    expect(n).toBe(15444);
    expect(worst).toBeLessThan(0.05);
    expect(sum / n).toBeLessThan(0.01);
  });
});
