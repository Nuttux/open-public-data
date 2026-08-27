import { describe, expect, it } from "vitest";

import { AIR_DERIVED, tiltWeight } from "./air";
import { SKYC, SUNC } from "@/lib/city/terrain";

const LUM = [0.2126, 0.7152, 0.0722] as const;
const luma = (c: readonly number[]): number =>
  LUM[0] * c[0] + LUM[1] * c[1] + LUM[2] * c[2];

/**
 * WHAT THIS FILE IS FOR.
 *
 * `air.ts` is TSL: almost all of it can only be judged on a frame, and it is,
 * by capture. What CAN be held here is the arithmetic the shader is built
 * FROM — the kernel correction, the two illuminants, and the ramp that turns
 * the published tilt-shift bands into one blur and a mix weight. Every one of
 * those is a number derived from something published, and every one of them
 * is a number a later edit could move without any frame looking obviously
 * wrong.
 */
describe("air: the tilt-shift ramp reproduces the published bands", () => {
  /**
   * `film-draw.ts` `drawTiltShift`, its five bands, at the MIDPOINT of each.
   * The mix converts by `sigma_eff = sigma_max * sqrt(w)` — the second moment
   * of `(1-w)·delta + w·G(sigma)` is `w·sigma²` — so this is the whole of the
   * claim that one blurred texture reproduces five blur radii.
   *
   * The top band's own midpoint is the ONE deliberate departure: the ramp
   * reaches 3.6 only at the frame's edge rather than holding it flat across
   * the top 9 %, which is the "no hard line where the focus ends" the
   * published comment asks for. It is asserted loosely for that reason.
   */
  const SIGMA = AIR_DERIVED.tiltSigmaPx;
  const sigmaAt = (y: number): number => SIGMA * Math.sqrt(tiltWeight(y));

  /* the residuals, written down rather than hidden behind a loose tolerance:
     2.005 against a published 2.0, and 0.850 against a published 0.9 — a
     quarter of one per cent and six per cent of a blur radius */
  /* ── THE RAMP IS THE PUBLISHED SHAPE AT HALF THE PUBLISHED SIZE ────────
     These asserted the published radii outright — 3.6 px at the top edge,
     2.0 and 0.9 at the interior bands, 2.4 at the foot — and on the page this
     is a port of, those are right. On this one they are not, and the reason is
     the framing rather than the arithmetic: the camera sits high enough that
     the FOOT of the frame is near ground a reader is rarely looking at, so the
     treatment only ever registered at the TOP, and a blur at one end of a
     frame is not a tilt-shift, it is a smear. Daniel: *"i just see the top of
     my frame looking blurry but not much else."*

     So `TILT_SIGMA_PX` is halved and `TILT_TOP` narrowed from 0.24 to 0.13.
     What must NOT change is the SHAPE — the published profile's own ratios
     between its bands — and that is what these now check: every radius is half
     its published value, sampled at the same FRACTION of the (narrower) top
     band, which is where the published band midpoints 0.13 and 0.205 land once
     0.24 becomes 0.13. */
  it("keeps the published interior bands at half their radius", () => {
    expect(Math.abs(sigmaAt(0.13 * (0.13 / 0.24)) - 1.0)).toBeLessThan(0.006);
    expect(Math.abs(sigmaAt(0.205 * (0.13 / 0.24)) - 0.45)).toBeLessThan(0.055);
  });

  it("reaches half the published widest at the top edge, and softens the very top", () => {
    expect(sigmaAt(0)).toBeCloseTo(1.8, 5);
    /* the published band is flat at its widest here; this one is still rising */
    expect(sigmaAt(0.045)).toBeGreaterThan(0.6);
    expect(sigmaAt(0.045)).toBeLessThan(1.8);
  });

  it("reaches half the published widest at the foot", () => {
    expect(sigmaAt(1)).toBeCloseTo(1.2, 1); // published 2.4 px, halved
  });

  /**
   * THE ONE PROPERTY THE BRIEF NAMES: the middle of the frame must not lose
   * its 1-px facade window lines. Not "loses little" — the weight is a clamp
   * and it is EXACTLY zero, which is what the capture then confirms on the
   * glass (`max |dRGB| = 0` over 0.26..0.82 at all four cameras).
   */
  it("is exactly zero across the whole sharp band", () => {
    for (let i = 0; i <= 120; i++) {
      const y = 0.24 + (i * (0.84 - 0.24)) / 120;
      /* `toBe(0)` at the two ends is a float trap and not a real one: at
         y = 0.24 the clamp's argument lands on 5.9e-15 instead of 0 and
         1.5 raises it to 9e-23. The claim is that nothing in the middle of
         the frame is blurred, and 9e-23 of a mix is not a blur. */
      expect(tiltWeight(y)).toBeLessThan(1e-15);
    }
    expect(tiltWeight(0.5)).toBe(0);
  });

  it("is monotone away from the sharp band in both directions", () => {
    for (let y = 0.005; y <= 0.24; y += 0.005) {
      expect(tiltWeight(y)).toBeLessThanOrEqual(tiltWeight(y - 0.005));
    }
    for (let y = 0.845; y <= 1; y += 0.005) {
      expect(tiltWeight(y)).toBeGreaterThanOrEqual(tiltWeight(y - 0.005));
    }
  });
});

describe("air: the blur's gain corrects the kernel it is built from", () => {
  /**
   * `GaussianBlurNode` builds `kernelSize = 3 + 2·sigma` coefficients from
   * the Gaussian's own values and never normalises them, so a blurred pixel
   * comes back short. This recomputes the node's formula independently and
   * asserts the correction is its reciprocal, squared for the two passes.
   */
  it("matches an independent sum of the node's own coefficients", () => {
    const kernel = 3 + 2 * AIR_DERIVED.blurSigmaArg;
    const sigma = kernel / 3;
    let sum = 0;
    for (let i = 0; i < kernel; i++) {
      const c = (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma;
      sum += i === 0 ? c : 2 * c;
    }
    expect(sum).toBeLessThan(1); // it IS short, which is why the gain exists
    expect(AIR_DERIVED.blurGain).toBeCloseTo(1 / (sum * sum), 10);
    /* ── AND THE GAIN GREW WHEN THE SIGMA SHRANK ────────────────────────
       This was 1.003 to 1.005 — 0.39 % over the two passes — at the published
       3.6 px sigma. Halving the sigma shortens the kernel (`3 + 2 * sigmaArg`),
       so a larger share of the Gaussian's tail falls outside it, and the gain
       that corrects for the missing tail is correspondingly larger: 1.0070,
       about 0.7 % over the two passes. The bound moves with the kernel because
       it is a property OF the kernel, not a target. */
    expect(AIR_DERIVED.blurGain).toBeGreaterThan(1.006);
    expect(AIR_DERIVED.blurGain).toBeLessThan(1.008);
  });

  it("sets the kernel so one texel is 2 CSS px whatever the sigma is", () => {
    expect(AIR_DERIVED.blurSigmaTexels * 2).toBeCloseTo(AIR_DERIVED.tiltSigmaPx, 10);
  });
});

describe("air: the grade's two colours are the published pair, in linear light", () => {
  /**
   * `terrain.ts` §the light is two colours normalises `SUNC` and `SKYC` to
   * Rec.709 luminance 1 *"so on a neutral base they change hue and nothing
   * else"*. Those numbers multiply sRGB CODE VALUES; this chain multiplies
   * linear light, so they are raised to 2.2 and renormalised. Both halves of
   * that are asserted: the luminance and the direction.
   */
  it("is exactly luminance-preserving, so the grade cannot move the value ladder", () => {
    expect(luma(AIR_DERIVED.warm)).toBeCloseTo(1, 12);
    expect(luma(AIR_DERIVED.cool)).toBeCloseTo(1, 12);
    /* and so is anything on the walk between them */
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const g = [0, 1, 2].map(
        (i) => AIR_DERIVED.cool[i] + (AIR_DERIVED.warm[i] - AIR_DERIVED.cool[i]) * t,
      );
      expect(luma(g)).toBeCloseTo(1, 12);
    }
  });

  it("keeps the published direction — the sun warm, the sky cool", () => {
    expect(AIR_DERIVED.warm[0]).toBeGreaterThan(AIR_DERIVED.warm[2]);
    expect(AIR_DERIVED.cool[2]).toBeGreaterThan(AIR_DERIVED.cool[0]);
    expect(SUNC[0]).toBeGreaterThan(SUNC[2]);
    expect(SKYC[2]).toBeGreaterThan(SKYC[0]);
  });

  it("is a STRONGER tilt than the published numbers, which is the whole point of the conversion", () => {
    /* linear x1.054 is only x1.024 in code value — half the published tilt.
       Raising to 2.2 is what makes the linear multiply land on it. */
    const warmSpread = AIR_DERIVED.warm[0] / AIR_DERIVED.warm[2];
    expect(warmSpread).toBeGreaterThan(SUNC[0] / SUNC[2]);
    expect(warmSpread ** (1 / 2.2)).toBeCloseTo(SUNC[0] / SUNC[2], 3);
  });
});
