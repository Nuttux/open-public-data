import { describe, expect, it } from "vitest";

import { HAZE, WA } from "@/lib/city/terrain";
import {
  bakeSky,
  skyLayer,
  skyOptionsFromSearch,
  veilAlpha,
  veilInnerR,
} from "./sky";

/**
 * The wash is a re-derivation of two published constants, not a taste, so the
 * thing worth testing is that it still IS one. Every expectation below is
 * computed from `WA.hazecap` and the ramp's own 3,400 / 15,000, so moving the
 * published cap moves the test with it — which is the point. A test that
 * hard-coded 10,150 would pass a cap change silently and that is exactly the
 * bug this layer exists to fix somewhere else.
 */
const R0 = 3400;
const SPAN = 15000;
const CAP = WA.hazecap;

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

describe("the wash is the published ramp, continued", () => {
  it("is zero everywhere the published haze has not yet capped", () => {
    for (const d of [0, 1000, R0, 6000, veilInnerR(CAP) - 1]) {
      expect(veilAlpha(d, CAP)).toBe(0);
    }
  });

  it("starts exactly where the cap binds and finishes where the ramp arrives", () => {
    expect(veilInnerR(CAP)).toBeCloseTo(R0 + SPAN * CAP, 6);
    expect(veilAlpha(veilInnerR(CAP), CAP)).toBeCloseTo(0, 9);
    expect(veilAlpha(R0 + SPAN, CAP)).toBeCloseTo(1, 9);
    expect(veilAlpha(R0 + SPAN * 4, CAP)).toBe(1);
  });

  /**
   * THE PROPERTY THE WHOLE FILE RESTS ON. The composite haze a far-field pixel
   * ends up with — the clamp, then this wash over it — is the UNCLAMPED
   * published ramp, to floating-point equality. If this ever fails, the layer
   * has stopped being a continuation and started being a second opinion.
   */
  it("puts no corner back: cap + a(1-cap) is the unclamped ramp", () => {
    for (let d = 0; d <= 24000; d += 137) {
      const capped = Math.min(CAP, Math.max(0, (d - R0) / SPAN));
      const composite = capped + veilAlpha(d, CAP) * (1 - capped);
      const unclamped = Math.min(1, Math.max(0, (d - R0) / SPAN));
      expect(composite).toBeCloseTo(unclamped, 12);
    }
  });

  it("is off entirely for a city whose haze does not cap", () => {
    expect(veilAlpha(50_000, 1)).toBe(0);
  });
});

describe("the bake", () => {
  const opts = {
    anchor: [0, 0] as const,
    reachM: 40_000,
    paper: HAZE,
    cap: CAP,
    sx: 1,
    sy: 0,
    strength: 1,
    tilt: 0.55,
    lift: 0,
    debug: false,
  };
  const N = 64;
  const at = (px: Uint8Array, i: number, j: number): number[] => {
    const k = (j * N + i) * 4;
    return [px[k], px[k + 1], px[k + 2], px[k + 3]];
  };

  it("is transparent at the anchor and opaque at the far corner", () => {
    const px = bakeSky(N, opts);
    expect(at(px, N / 2, N / 2)[3]).toBe(0);
    expect(at(px, 0, 0)[3]).toBe(255);
  });

  /**
   * With no tilt the wash must be the paper EXACTLY — not close to it. That
   * byte-for-byte equality with what the renderer clears to is what lets the
   * picture end in the sheet instead of at an edge.
   */
  it("converges on the paper itself when it is not tilted", () => {
    const px = bakeSky(N, { ...opts, tilt: 0, lift: 0 });
    const P = rgb(HAZE);
    for (const [i, j] of [
      [0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1], [N / 2, 2],
    ] as const) {
      expect(at(px, i, j).slice(0, 3)).toEqual(P);
    }
  });

  it("tilts warm toward the sun and cool away from it, holding luminance", () => {
    const px = bakeSky(N, opts);
    const sun = at(px, N - 1, N / 2);
    const far = at(px, 0, N / 2);
    // warm = more red, less blue
    expect(sun[0]).toBeGreaterThan(far[0]);
    expect(sun[2]).toBeLessThan(far[2]);
    // and `skylitN` renormalises, so the two are the same value
    const lum = (c: number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(Math.abs(lum(sun) - lum(far))).toBeLessThan(1.0);
    // ...and the axis at right angles to the sun is the untilted paper
    expect(at(px, N / 2, N - 1).slice(0, 3)).toEqual(rgb(HAZE));
  });

  it("follows the sun's bearing rather than a fixed axis", () => {
    const east = bakeSky(N, opts);
    const west = bakeSky(N, { ...opts, sx: -1, sy: 0 });
    expect(at(west, 0, N / 2).slice(0, 3)).toEqual(at(east, N - 1, N / 2).slice(0, 3));
  });

  it("carries the strength dial into the alpha and nothing else", () => {
    const full = bakeSky(N, opts);
    const half = bakeSky(N, { ...opts, strength: 0.5 });
    expect(at(half, 0, 0)[3]).toBe(Math.round(0.5 * 255));
    expect(at(half, 0, 0).slice(0, 3)).toEqual(at(full, 0, 0).slice(0, 3));
    expect(bakeSky(N, { ...opts, strength: 0 })[3]).toBe(0);
  });
});

describe("the query dials", () => {
  it("is on unless it is turned off", () => {
    expect(skyOptionsFromSearch("").on).toBe(true);
    expect(skyOptionsFromSearch("?q=low&aa=1").on).toBe(true);
    expect(skyOptionsFromSearch("?sky=0").on).toBe(false);
    expect(skyOptionsFromSearch("?a=1&sky=0&b=2").on).toBe(false);
  });

  it("moves one number at a time, and leaves the rest alone", () => {
    const q = skyOptionsFromSearch("?skyk=0.5");
    expect(q.strength).toBe(0.5);
    expect(q.tilt).toBeUndefined();
    expect(q.lift).toBeUndefined();
    const r = skyOptionsFromSearch("?skyw=1&skyv=0.03&skyq=256&skyd=1");
    expect(r.tilt).toBe(1);
    expect(r.lift).toBe(0.03);
    expect(r.size).toBe(256);
    expect(r.debug).toBe(true);
  });

  it("ignores a dial that is not a number", () => {
    expect(skyOptionsFromSearch("?skyk=none").strength).toBeUndefined();
  });
});

describe("the layer", () => {
  it("hangs one quad off the ground plane, last and depthless", () => {
    const layer = skyLayer({ anchor: [1000, 2000], size: 32 });
    expect(layer.mesh.renderOrder).toBeGreaterThan(0);
    const m = layer.mesh.material as { depthTest: boolean; depthWrite: boolean; transparent: boolean };
    expect(m.depthTest).toBe(false);
    expect(m.depthWrite).toBe(false);
    expect(m.transparent).toBe(true);
    expect(layer.mesh.castShadow).toBe(false);
    expect(layer.mesh.receiveShadow).toBe(false);
    const pos = layer.mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBe(0);
    layer.dispose();
  });

  it("reports the wash it would paint at a world point", () => {
    const layer = skyLayer({ anchor: [1000, 2000], size: 32 });
    expect(layer.alphaAt(1000, 2000)).toBe(0);
    expect(layer.alphaAt(1000 + veilInnerR(CAP), 2000)).toBeCloseTo(0, 9);
    expect(layer.alphaAt(1000 + R0 + SPAN, 2000)).toBeCloseTo(1, 9);
    layer.setParams({ strength: 0.25 });
    expect(layer.alphaAt(1000 + R0 + SPAN, 2000)).toBeCloseTo(0.25, 9);
    layer.dispose();
  });

  it("stops drawing when the whole frame is inside the cap radius", () => {
    const viewport = { W: 1440, H: 666 };
    const layer = skyLayer({ anchor: [0, 0], size: 32, viewport });
    /* a close camera: 1,440 px over a few hundred plane units of world */
    layer.onFrame?.({ cx: 0, cy: 0, scale: 4 }, 2);
    expect(layer.mesh.visible).toBe(false);
    /* and a wide one, where the corners are tens of kilometres out */
    layer.onFrame?.({ cx: 0, cy: 0, scale: 0.02 }, 0);
    expect(layer.mesh.visible).toBe(true);
    layer.dispose();
  });
});
