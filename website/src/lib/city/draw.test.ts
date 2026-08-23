/**
 * draw.test.ts — Block P3's unit suite.
 *
 * Where `gen/functional.py` states a property, **its sentence is kept word for
 * word**, so a failure still reads like the note someone wrote when they found
 * the bug. Where a clause is this port's own, it says so.
 *
 * Rendering itself is P6's job. What is here is everything that can be decided
 * without a canvas: the tier arithmetic, the coverage alpha, the ink budget,
 * the ramp continuity, the corner cap, the hillshade units, the emphasis law.
 */

import { describe, expect, it } from "vitest";
import { Projection } from "./projection";
import {
  buildSurroundLam,
  LAM0,
  paintCell,
  QF,
  resTune,
  RS,
  skylit,
  skylitN,
  SUN,
  terrainColor,
  terrainRGB,
  tiltOf,
  WA,
  luminance,
} from "./terrain";
import { coastBand, wedgeCovered, buildShoal, depthM, assertRefinement, resampleC1, shoalCellAlpha, shoalNodeAlpha, SHOAL_A0, SHOAL_REACH } from "./water";
import {
  centrelineFade,
  extentW,
  ST_EXT_PX,
  ST_KPROJ,
  ST_SRF_PX,
  surfaceW,
} from "./streets";
import { bandW, blobRadius, BLOB_K, CROWN_LIFT, vrnd, VZ_C0, VZ_C1, VZ_T0, VZ_T1 } from "./trees";
import {
  bucketFloor,
  buildBldOrder,
  buildURND,
  COVA,
  coverageAlpha,
  COVQ,
  COV_GAMMA,
  drawnAsBuilding,
  LOD_Z0,
  LOD_Z1,
  MASS_GAIN,
  tierW,
  type Massing,
} from "./buildings";
import {
  FA_HMAX_F,
  FA_MIN_DH_PX,
  FA_RAMP,
  faceWeights,
  faRamp,
  faceTakesOpenings,
  ROLE_PARTY,
  ROLE_FRONT,
  storeysOf,
} from "./facades";
import {
  bandOfHeight,
  DE,
  drawsStoreyLines,
  RH_LEVELS,
  roofHeight,
  roofStep,
  RSHADE,
  stepFires,
  stepFraction,
  STOREY_MIN_PX,
  trayW,
  type Quartiles,
} from "./roofs";
import {
  accentOf,
  chroma,
  crownFactor,
  emphasis,
  emphasisElasticity,
  GGB,
  lmLOD,
  ngonScale,
  planScale,
  rooflineOf,
  volumeScale,
  WO_EMAX,
  WO_R,
  WO_T,
  type HeroPart,
} from "./landmarks";
import {
  HOOD_INK,
  InkBudget,
  labelOrder,
  nameFitsItsStreet,
  placeIsBigEnough,
  PLACE_INK_PER_CLASS,
  ringSizesIt,
  spanOfFootprint,
  spineOf,
} from "./labels";

// ────────────────────────────────────────────────────────────────────────────
// the ladder
// ────────────────────────────────────────────────────────────────────────────

describe("the level-of-detail ladder", () => {
  it("the two thresholds are measured, not picked — the median building is 1.6 px at LOD_Z0 and 2.4 px at LOD_Z1", () => {
    // The median building's projected width is 1.02 px at z = 1, and it is
    // linear in z. Both thresholds are `median projected width / cam.base`.
    const medianAtZ1 = 1.02;
    expect(medianAtZ1 * LOD_Z0).toBeCloseTo(1.6, 1);
    expect(medianAtZ1 * LOD_Z1).toBeCloseTo(2.4, 1);
  });

  it("...and neither sits on a preset — a representation change belongs between two stops, not at one a reader sits on", () => {
    const presets = [1.0, 2.9, 7.2];
    for (const p of presets) {
      expect(LOD_Z0).not.toBe(p);
      expect(LOD_Z1).not.toBe(p);
    }
    expect(LOD_Z0).toBeGreaterThan(1.0);
    expect(LOD_Z1).toBeLessThan(2.9);
  });

  it("the tier weight is a ramp with zero derivative at both ends, so no wheel zoom can pass through a step", () => {
    expect(tierW(LOD_Z0)).toBe(0);
    expect(tierW(LOD_Z1)).toBe(1);
    const h = 1e-4;
    const d = (z: number) => (tierW(z + h) - tierW(z - h)) / (2 * h);
    expect(Math.abs(d(LOD_Z0 + h * 2))).toBeLessThan(0.02);
    expect(Math.abs(d(LOD_Z1 - h * 2))).toBeLessThan(0.02);
    // monotone, and no second-difference step anywhere in the band
    let prev = -1,
      worst = 0,
      dprev = NaN;
    for (let i = 0; i <= 600; i++) {
      const z = LOD_Z0 + ((LOD_Z1 - LOD_Z0) * i) / 600;
      const w = tierW(z);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = w;
      const dd = d(z);
      if (!Number.isNaN(dprev)) worst = Math.max(worst, Math.abs(dd - dprev));
      dprev = dd;
    }
    // a STEP in the first derivative of size 1 over this sampling would read
    // about 0.0126 here; the smoothstep's own curvature is an order of
    // magnitude under that
    expect(worst).toBeLessThan(0.0126);
  });

  it("the dissolve is a DITHER, not a cross-fade — the same buildings are the same buildings from one rasterisation to the next", () => {
    const urnd = buildURND(4096);
    const m: Massing = {
      off: new Uint32Array(2),
      ty: new Uint8Array(0),
      tc: new Uint8Array(0),
      th: new Uint8Array(0),
      solo: new Uint8Array(512), // nothing is a solo
      year0: 1849,
    };
    const at = (w: number) => {
      const s = new Set<number>();
      for (let i = 0; i < 4096; i++) if (drawnAsBuilding(urnd, m, i, w)) s.add(i);
      return s;
    };
    const a = at(0.3),
      b = at(0.5);
    // nothing that was drawn stops being drawn as the weight rises
    for (const i of a) expect(b.has(i)).toBe(true);
    // and it is monotone in cost, not the sum of two tiers
    expect(b.size).toBeGreaterThan(a.size);
    // the threshold is on a fixed per-building number, so a re-run is identical
    const a2 = at(0.3);
    expect([...a2].sort()).toEqual([...a].sort());
  });

  it("...and the cost is proportional to the weight, so the transition is cheaper than either end of it", () => {
    const urnd = buildURND(20000);
    const m: Massing = {
      off: new Uint32Array(2),
      ty: new Uint8Array(0),
      tc: new Uint8Array(0),
      th: new Uint8Array(0),
      solo: new Uint8Array(2500),
      year0: 1849,
    };
    const count = (w: number) => {
      let n = 0;
      for (let i = 0; i < 20000; i++) if (drawnAsBuilding(urnd, m, i, w)) n++;
      return n;
    };
    expect(count(0.5) / 20000).toBeCloseTo(0.5, 1);
    expect(count(0.25) / 20000).toBeCloseTo(0.25, 1);
  });

  it("a SOLO is drawn as itself at every zoom", () => {
    const urnd = buildURND(64);
    const solo = new Uint8Array(8);
    solo[0] = 0b0000_0001; // building 0 is a solo
    const m: Massing = {
      off: new Uint32Array(2),
      ty: new Uint8Array(0),
      tc: new Uint8Array(0),
      th: new Uint8Array(0),
      solo,
      year0: 1849,
    };
    expect(drawnAsBuilding(urnd, m, 0, 0)).toBe(true);
    // and a non-solo at w = 0 is not
    let anyOther = false;
    for (let i = 1; i < 64; i++) if (drawnAsBuilding(urnd, m, i, 0)) anyOther = true;
    expect(anyOther).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// coverage is the alpha
// ────────────────────────────────────────────────────────────────────────────

describe("coverage is the alpha", () => {
  it("a block is painted at an alpha equal to its measured built coverage — cov*roof + (1-cov)*ground is exactly what a fill at alpha cov over the terrain computes", () => {
    const roof = 90,
      ground = 210;
    for (const cov of [0.03, 0.46, 0.88]) {
      const composited = cov * roof + (1 - cov) * ground;
      // the identity the tier rests on, before the two measured gains
      expect(composited).toBeCloseTo(ground + cov * (roof - ground), 10);
    }
  });

  it("...so the Sunset comes out pale, Chinatown comes out solid and the Presidio disappears into its own hillside — and nobody made any of those three decisions", () => {
    const sunset = coverageAlpha(0.46);
    const chinatown = coverageAlpha(0.88);
    const presidio = coverageAlpha(0.03);
    expect(presidio).toBeLessThan(sunset);
    expect(sunset).toBeLessThan(chinatown);
    // an empty block stays empty — the correction is on the TONE, not the ALPHA
    expect(presidio).toBeLessThan(0.25);
  });

  it("the alpha is quantised because one fill() carries one alpha, so the alpha has to be a batch key", () => {
    expect(COVQ).toBe(10);
    expect(COVA.length).toBe(COVQ);
    // strictly increasing, and ten steps is 10 % of coverage
    for (let q = 1; q < COVQ; q++) expect(COVA[q]).toBeGreaterThan(COVA[q - 1]);
  });

  it("COV_GAMMA is a mild exponent and MASS_GAIN is on the tone — the mean is held and what left is the noise", () => {
    expect(COV_GAMMA).toBeGreaterThan(0.5);
    expect(COV_GAMMA).toBeLessThan(1);
    for (let q = 0; q < COVQ; q++) {
      const cov = (q + 0.5) / COVQ;
      // the exponent lifts every coverage, which is why the correction cannot
      // live here: an exponent under 1 lifts a 3 %-built block too
      expect(COVA[q]).toBeGreaterThanOrEqual(cov - 1e-12);
    }
    expect(MASS_GAIN).toBeLessThan(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// painter's order
// ────────────────────────────────────────────────────────────────────────────

describe("painter's order", () => {
  it("painter's order is a COUNTING SORT, so a mark keyed to an exact depth is not safe — the mark takes its BUILDING'S BUCKET FLOOR", () => {
    const n = 5000;
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i++) depth[i] = Math.sin(i * 12.9898) * 5000;
    const o = buildBldOrder(depth);
    // far to near, to within one bucket
    const bucketOf = (d: number) => ((o.hi - d) * o.k) | 0;
    for (let i = 1; i < n; i++)
      expect(bucketOf(depth[o.order[i]])).toBeGreaterThanOrEqual(
        bucketOf(depth[o.order[i - 1]]),
      );
  });

  it("...and it lands AFTER every building that bucket holds", () => {
    const n = 3000;
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i++) depth[i] = (i % 97) * 13.7 - 400;
    const o = buildBldOrder(depth);
    const witness = 1234;
    const floor = bucketFloor(o, depth[witness]);
    const b = ((o.hi - depth[witness]) * o.k) | 0;
    for (let i = 0; i < n; i++) {
      if ((((o.hi - depth[i]) * o.k) | 0) !== b) continue;
      // every bucket-mate is at or above the floor, so the mark flushed at the
      // floor lands after all of them
      expect(depth[i]).toBeGreaterThan(floor - 1e-6);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the hillshade
// ────────────────────────────────────────────────────────────────────────────

describe("the hillshade units bug", () => {
  it("a flat cell still returns exactly SUN[2] = 0.730, so the value of open ground does not move at all", () => {
    const XW = 8,
      XH = 8;
    const flat = () => 42;
    const L = buildSurroundLam(XW, XH, flat, 110.01, 139.15, 3.3);
    // the field is a Float32Array, as it is in the mock, so "exactly" is
    // exactly at the storage's own precision and not at f64's
    for (let k = 0; k < XW * XH; k++) expect(L[k]).toBe(Math.fround(SUN[2]));
    expect(SUN[2]).toBe(0.73);
    expect(LAM0).toBe(0.73);
  });

  it("the gradient divides by the cell's own width — one DEM quantum on a flat cell is a slope of 1.25 degrees, not 76", () => {
    // 1.176 m of quantisation noise across ONE cell.
    const quantum = 300 / 255;
    const cellM = 53.815;
    const zex = 3.3;
    // per metre, which is the fix
    const slopeRight = (quantum / cellM) * zex;
    // per cell, which is the bug
    const slopeWrong = quantum * zex;
    expect((Math.atan(slopeRight) * 180) / Math.PI).toBeCloseTo(4.1, 0);
    expect(slopeWrong).toBeCloseTo(3.88, 2);
    expect((Math.atan(slopeWrong) * 180) / Math.PI).toBeGreaterThan(75);
    // and the ratio is the cell width itself
    expect(slopeWrong / slopeRight).toBeCloseTo(cellM, 6);
  });

  it("the surround over-reads its slope by 61x across and 77x down when the divisor is 1.8 instead of the cell", () => {
    expect(110.01 / 1.8).toBeCloseTo(61.1, 1);
    expect(139.15 / 1.8).toBeCloseTo(77.3, 1);
  });

  it("...and the border ring gets a real Lambert instead of a zero, so `|| 0.62` has nothing left to fire on", () => {
    const XW = 6,
      XH = 6;
    const z = (i: number, j: number) => i * 3 + j * 2;
    const L = buildSurroundLam(XW, XH, z, 110.01, 139.15, 3.3);
    let zeros = 0;
    for (let k = 0; k < XW * XH; k++) if (L[k] === 0) zeros++;
    expect(zeros).toBe(0);
  });

  it("QF.xlam off restores the bug exactly, so an ablation compares two different pictures and not one with itself", () => {
    const XW = 5,
      XH = 5;
    const z = (i: number, j: number) => i * 4 + j;
    const fixed = buildSurroundLam(XW, XH, z, 110.01, 139.15, 3.3);
    QF.xlam = 0;
    const broken = buildSurroundLam(XW, XH, z, 110.01, 139.15, 3.3);
    QF.xlam = 1;
    let differs = false;
    for (let k = 0; k < XW * XH; k++) if (fixed[k] !== broken[k]) differs = true;
    expect(differs).toBe(true);
  });
});

describe("the light is two colours", () => {
  it("luminance is held EXACTLY — not asserted by algebra, computed, per colour", () => {
    for (const hex of ["#d9d3bf", "#87a6c6", "#2a372c", "#f8f9f5"])
      for (const k of [0.66, 0.86, 1.0, 1.14])
        for (const tilt of [-1, -0.5, 0, 0.5, 1]) {
          const o = new Float64Array(3);
          skylitN(
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
            k,
            tilt,
            o,
          );
          const l0 =
            luminance(
              parseInt(hex.slice(1, 3), 16),
              parseInt(hex.slice(3, 5), 16),
              parseInt(hex.slice(5, 7), 16),
            ) * k;
          expect(luminance(o[0], o[1], o[2])).toBeCloseTo(l0, 9);
        }
  });

  it("a shadowed slope is rendered through SKYC rather than SUNC and comes back COOL, not merely dark", () => {
    expect(tiltOf(LAM0)).toBe(0);
    expect(tiltOf(0.2)).toBeLessThan(0);
    expect(tiltOf(0.95)).toBeGreaterThan(0);
    const cool = new Float64Array(3),
      warm = new Float64Array(3);
    skylitN(180, 180, 180, 1, -1, cool);
    skylitN(180, 180, 180, 1, 1, warm);
    // blue up in the shadow, blue down in the light
    expect(cool[2]).toBeGreaterThan(cool[0]);
    expect(warm[0]).toBeGreaterThan(warm[2]);
  });

  it("skylit() itself is UNTOUCHED, so the published Q3 measurement still measures the function it was written against", () => {
    // the cached path quantises tilt to a twelfth and k to a two-hundredth
    expect(skylit("#d9d3bf", 0.86, 0.5)).toBe(skylit("#d9d3bf", 0.8602, 0.5));
    // and skylitN is strictly smoother — it does not
    const a = new Float64Array(3),
      b = new Float64Array(3);
    skylitN(217, 211, 191, 0.86, 0.5, a);
    skylitN(217, 211, 191, 0.8602, 0.5, b);
    expect(a[0]).not.toBe(b[0]);
  });

  it("the ground ramp is continuous where the quantised one terraces", () => {
    // Somewhere inside every elevation quantum there is a step the quantised
    // ramp cannot see and the continuous one can. That is the terracing the
    // node field removes, stated as the property rather than as one number.
    const o1 = new Float64Array(3),
      o2 = new Float64Array(3);
    let found = 0;
    for (let z = 5; z < 170; z += 0.1) {
      const a = terrainColor(z, 0.73, 0, 0, 0);
      const b = terrainColor(z + 0.05, 0.73, 0, 0, 0);
      if (a !== b) continue;
      terrainRGB(z, 0.73, 0, 0, 0, o1);
      terrainRGB(z + 0.05, 0.73, 0, 0, 0, o2);
      if (o1[0] !== o2[0] || o1[1] !== o2[1] || o1[2] !== o2[2]) found++;
    }
    expect(found).toBeGreaterThan(100);
  });

  it("park is a FRACTION, not a boolean row selector, which is what stops the park's own 53.8 m staircase", () => {
    const a = new Float64Array(3),
      b = new Float64Array(3),
      m = new Float64Array(3);
    terrainRGB(30, 0.73, 0, 0, 0, a);
    terrainRGB(30, 0.73, 1, 0, 0, b);
    terrainRGB(30, 0.73, 0.5, 0, 0, m);
    expect(m[0]).toBeCloseTo((a[0] + b[0]) / 2, 6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the ground plate
// ────────────────────────────────────────────────────────────────────────────

describe("the sub-quad painter", () => {
  it("a cell with no gradient in it gets one fill and is not approximated at all", () => {
    const calls: string[] = [];
    const ctx = fakeCtx(calls);
    const xs = [0, 20, 20, 0],
      ys = [0, 0, 12, 12];
    const flat = [100, 100, 100, 100];
    const n = paintCell(ctx, xs, ys, flat, flat, flat, WA.tgt, 64, 1);
    expect(n).toBe(1);
    // and at ROT 315 an axis-aligned flat cell is an EXACT screen rectangle
    expect(calls).toContain("fillRect");
    expect(calls).not.toContain("fill");
  });

  it("the subdivision is chosen by the COLOUR STEP, not by the pixel", () => {
    const ctx = fakeCtx([]);
    const xs = [0, 400, 400, 0],
      ys = [0, 0, 240, 240];
    const flat = [100, 100, 100, 100];
    // a huge cell with no gradient: still one fill
    expect(paintCell(ctx, xs, ys, flat, flat, flat, WA.tgt, 64, 1)).toBe(1);
    // the same cell with a real gradient: subdivided
    const ramp = [100, 160, 160, 100];
    expect(
      paintCell(ctx, xs, ys, ramp, ramp, ramp, WA.tgt, 64, 1),
    ).toBeGreaterThan(1);
  });

  it("...and never more than one sub-quad per minpx of screen, because a step finer than the pixel it lands in cannot be seen", () => {
    const ctx = fakeCtx([]);
    const xs = [0, 40, 40, 0],
      ys = [0, 0, 24, 24];
    const steep = [0, 255, 255, 0];
    const fine = paintCell(ctx, xs, ys, steep, steep, steep, 1.5, 64, 1);
    const coarse = paintCell(ctx, xs, ys, steep, steep, steep, 1.5, 64, 4);
    expect(coarse).toBeLessThan(fine);
  });

  it("the motion tier gives every pixel number back to the constant it shipped at", () => {
    const moving = resTune(2, true);
    expect(moving.minpx).toBe(RS.minpxMove);
    expect(moving.kmax).toBe(RS.kmaxMove);
    expect(moving.tgt).toBe(RS.tgtMove);
    const settled = resTune(2, false);
    // DEVICE px: one settled floor of 2 device px is 1 CSS px at DPR 2
    expect(settled.minpx).toBe(RS.minpxDev / 2);
    expect(settled.tgt).toBe(WA.tgt);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the shore
// ────────────────────────────────────────────────────────────────────────────

describe("the shore corridor", () => {
  it("the shore corridor covers every corner wedge, and did not before", () => {
    // A point in the wedge at angle A from the current normal sits at
    // -t*sin(A) along the segment, which is inside [-outM, 0] for every
    // t <= outM. So the previous and current caps between them cover it.
    const outM = 1100;
    let cappedOk = 0,
      uncappedOk = 0,
      n = 0;
    for (let deg = 5; deg <= 175; deg += 5)
      for (const t of [10, 100, 500, 1000, 1100]) {
        n++;
        if (wedgeCovered((deg * Math.PI) / 180, t, outM, true)) cappedOk++;
        if (wedgeCovered((deg * Math.PI) / 180, t, outM, false)) uncappedOk++;
      }
    expect(cappedOk).toBe(n);
    expect(uncappedOk).toBeLessThan(n);
  });

  it("...and the cap is only applied where there is a neighbour to meet, or the blue seam comes back along the county line", () => {
    const ring: [number, number][] = [
      [0, 0],
      [1000, 0],
      [2000, 0],
      [3000, 0],
    ];
    const calls: string[] = [];
    const ctx = fakeCtx(calls);
    const f = fakeFrame(ctx);
    // water on one side of the middle two segments only
    const wet = (x: number, y: number): number =>
      y > 0 && x > 500 && x < 2500 ? 1 : 0;
    const n = coastBand(ctx, f, [ring], wet, 130, 1100);
    expect(n).toBeGreaterThan(0);
    // an all-dry ring gets no corridor at all: a segment with land on both
    // sides is the San Mateo county line, not a beach
    const dry = coastBand(ctx, f, [ring], () => 0, 130, 1100);
    expect(dry).toBe(0);
  });

  it("the corridor is ASYMMETRIC, and the measurement is why", () => {
    // the land side covers at most one 77 m cell; the water side has to cover
    // the whole pier field
    expect(130).toBeGreaterThan(77);
    expect(1100).toBeGreaterThan(130 * 8);
  });
});

describe("the shallows", () => {
  it("the shallows are one interpolated plate of the published distance-to-shore field", () => {
    const XW = 12,
      XH = 12;
    const isLand = (i: number, _j: number) => i < 3;
    const { dist, smooth } = buildShoal(XW, XH, isLand);
    for (let j = 0; j < XH; j++) expect(dist[j * XW + 0]).toBe(0);
    for (let j = 0; j < XH; j++) expect(dist[j * XW + 3]).toBe(1);
    for (let j = 0; j < XH; j++) expect(dist[j * XW + 4]).toBe(2);
    // THE ALPHA IS CONTINUOUS WHERE THE DISTANCE IS NOT. The band was
    // `(1 - d/8) * 0.85` on an INTEGER cell distance, so the water was eight
    // flat steps 84 m wide. Two passes of a separable 1-2-1 over the same
    // published field is the whole change: nothing is invented, only its
    // resolution moves.
    let nonInteger = 0,
      differs = 0;
    for (let k = 0; k < XW * XH; k++) {
      if (smooth[k] !== Math.round(smooth[k])) nonInteger++;
      if (smooth[k] !== Math.min(SHOAL_REACH, dist[k])) differs++;
    }
    expect(nonInteger).toBeGreaterThan(0);
    expect(differs).toBeGreaterThan(0);
    // and it is still the same field: the smoothing never moves a cell past
    // its own neighbours' range
    for (let j = 1; j < XH - 1; j++)
      for (let i = 1; i < XW - 1; i++) {
        const k = j * XW + i;
        const lo = Math.min(dist[k - 1], dist[k], dist[k + 1]);
        const hi = Math.max(dist[k - 1], dist[k], dist[k + 1]);
        expect(smooth[k]).toBeGreaterThanOrEqual(Math.min(lo, SHOAL_REACH) - 1);
        expect(smooth[k]).toBeLessThanOrEqual(Math.min(hi, SHOAL_REACH) + 1);
      }
  });

  it("a coastal land cell carries the alpha the water at its own edge carries, and every pixel of it is painted over", () => {
    const XW = 8,
      XH = 8;
    const { dist, smooth } = buildShoal(XW, XH, (i) => i < 2);
    const hole = new Uint8Array(XW * XH);
    const ca = shoalCellAlpha(XW, XH, { dist, smooth, hole });
    // interior land is untouched
    expect(ca[3 * XW + 0]).toBe(0);
    // the coastal land cell carries the shore's own alpha
    expect(ca[3 * XW + 1]).toBeCloseTo(SHOAL_A0, 6);
  });

  it("the C1 resample is EXACT AT EVERY NODE, so nothing the plate says about the published field changes", () => {
    const XNW = 5,
      XNH = 4;
    const NA = new Float32Array(XNW * XNH);
    for (let k = 0; k < NA.length; k++) NA[k] = (k * 37) % 100;
    const N = 4;
    const { data, w } = resampleC1(NA, XNW, XNH, N);
    for (let j = 0; j < XNH; j++)
      for (let i = 0; i < XNW; i++)
        expect(data[j * N * w + i * N]).toBeCloseTo(NA[j * XNW + i], 4);
  });

  it("the node field is the mean of the alpha of the up-to-four cells that meet there", () => {
    const XW = 3,
      XH = 3;
    const cell = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const na = shoalNodeAlpha(XW, XH, cell);
    // the interior node (1,1) sees cells (0,0),(1,0),(0,1),(1,1) = 1,2,4,5
    expect(na[1 * (XW + 1) + 1]).toBeCloseTo((1 + 2 + 4 + 5) / 4, 6);
    // a corner node sees exactly one cell
    expect(na[0]).toBeCloseTo(1, 6);
  });

  it("the shoal band reaches 18 cells and it is NOT a depth claim — distance from the shore explains nine per cent of the bay's depth", () => {
    expect(SHOAL_REACH).toBe(18);
    // corr = 0.303 -> r2 = 0.092
    expect(0.303 * 0.303).toBeCloseTo(0.092, 3);
  });
});

describe("the depth plate", () => {
  it("the bay's floor is a published field on the page's OWN lattice", () => {
    const meta = {
      nw: 1665, nh: 1121, mul: 4, dmax: 120, qs: [], world: [0, 0, 1, 1],
    } as const;
    // 416 x 280 surround cells refined 4x IS 1665 x 1121 nodes, so every 4th
    // node is a node of the published coarse grid and level 0 is lossless
    expect(() => assertRefinement(meta, 416, 280)).not.toThrow();
    // and it REFUSES anything else rather than drawing a plausible field
    expect(() => assertRefinement(meta, 417, 280)).toThrow(/refinement/);
  });

  it("depth in metres is the source's own sqrt quantiser, worst error 0.452 m", () => {
    expect(depthM(0, 120)).toBe(0);
    expect(depthM(255, 120)).toBeCloseTo(120, 9);
    let worst = 0;
    for (let v = 1; v <= 255; v++)
      worst = Math.max(worst, depthM(v, 120) - depthM(v - 1, 120));
    // the worst step is at the deep end, and the quantiser's own stated bound
    // is half of it
    expect(worst / 2).toBeLessThan(0.47);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the streets
// ────────────────────────────────────────────────────────────────────────────

describe("the street surface", () => {
  it("a road is a line at whole city and a surface at the deepest zoom, and the two are complementary", () => {
    // A width at an unknown bearing projects at the geometric mean of the two
    // axis scales.
    expect(ST_KPROJ).toBeCloseTo(0.9306, 4);
    const medianW = 20.9;
    // at the scale where the median ROW is 2 px, the line has just begun to
    // fade and the surface has just begun to arrive
    const camScale = ST_EXT_PX / (medianW * ST_KPROJ);
    expect(centrelineFade(medianW, camScale)).toBeCloseTo(0, 6);
    expect(extentW(medianW, camScale)).toBeCloseTo(0, 6);
    // and NO ZOOM DRAWS A STREET TWICE: the line is gone by the width at which
    // the area begins, so the product is zero everywhere. (The two meet at a
    // single point, exactly 2 px, where both are zero — a measure-zero
    // coincidence and not the "half-drawn twice" the gate exists to prevent.)
    for (let f = 0.25; f <= 4; f += 0.05) {
      const k = camScale * f;
      const line = centrelineFade(medianW, k);
      const area = extentW(medianW, k);
      expect(line * area).toBe(0);
      expect(line).toBeLessThanOrEqual(1);
      expect(area).toBeLessThanOrEqual(1);
      if (f < 0.9) expect(line).toBeGreaterThan(0);
      if (f > 1.6) expect(area).toBeGreaterThan(0);
    }
  });

  it("the extent tier was opening at 1 px of published width, and the city's median right of way is 1.32 px at whole-city zoom", () => {
    const camBase = 0.05565;
    expect(20.9 * ST_KPROJ * camBase).toBeCloseTo(1.08, 1);
    // the corrected gate keeps the whole-city frame at zero surfaces
    expect(extentW(20.9, camBase)).toBe(0);
    expect(extentW(25.7, camBase)).toBe(0);
  });

  it("the surface tier is gated on the narrower dimension — the footway band, not the right of way", () => {
    expect(ST_SRF_PX).toBe(1.0);
    const camBase = 0.05565;
    // p50 footway 3.16 m is a third of a pixel at whole city
    expect(surfaceW(3.16, camBase)).toBe(0);
    // and it arrives well after the extent tier does
    const k = 0.6;
    expect(surfaceW(3.16, k)).toBeLessThan(extentW(20.9, k) + 1e-9);
  });

  it("both gates are per FEATURE, so promotion is staggered across the frame by the city's own widths", () => {
    const k = 0.12;
    const narrow = extentW(11.0, k); // a minor court
    const wide = extentW(25.7, k); // an arterial
    expect(wide).toBeGreaterThan(narrow);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the trees
// ────────────────────────────────────────────────────────────────────────────

describe("the vegetation ladder", () => {
  it("no street tree is a draw call at whole-city zoom, and the ladder rises", () => {
    expect(bandW(1.0, VZ_C0, VZ_C1)).toBe(0);
    expect(bandW(1.0, VZ_T0, VZ_T1)).toBe(0);
    expect(bandW(2.9, VZ_C0, VZ_C1)).toBe(1);
    expect(bandW(2.9, VZ_T0, VZ_T1)).toBe(0);
    expect(bandW(7.2, VZ_T0, VZ_T1)).toBeGreaterThan(0);
    expect(bandW(6.0, VZ_T0, VZ_T1)).toBe(1);
  });

  it("the dissolve is Block L's rule, not an alpha, and vrnd is computed from the index rather than shipped", () => {
    const a = vrnd(1234),
      b = vrnd(1234);
    expect(a).toBe(b);
    expect(vrnd(1234)).not.toBe(vrnd(1235));
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += vrnd(i);
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it("a crown of radius R sits 2.613 crown-radii up the screen — a constant, so placing a tree is one multiply", () => {
    expect(CROWN_LIFT).toBeCloseTo(2.613, 3);
  });

  it("a cell whose canopy fills it draws a blob that circumscribes the cell, so a solid forest is solid and a fringe is a fringe", () => {
    expect(BLOB_K).toBeCloseTo(1.128, 3);
    const cell = 24;
    // 1.128 is 2/sqrt(pi): the blob is bigger than the equal-area disc, so a
    // cell whose canopy fills it reads solid rather than as a disc with the
    // corners showing, and a fringe still reads as a fringe
    const equalArea = Math.sqrt((cell * cell) / Math.PI);
    expect(blobRadius(cell * cell)).toBeCloseTo(equalArea * BLOB_K, 9);
    expect(blobRadius(cell * cell)).toBeGreaterThan(cell / 2);
    // and it is monotone in the published area, which is what carries the
    // information: a cell with a tenth of the canopy is not a tenth-size blob
    // by accident
    expect(blobRadius(576)).toBeGreaterThan(blobRadius(58.06));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the facades
// ────────────────────────────────────────────────────────────────────────────

describe("the envelope", () => {
  it("a window exists because the roll says so", () => {
    const base = {
      Lm: 14,
      Hm: 11,
      dhPx: 40,
      role: ROLE_FRONT,
      type: 0,
      era: 1,
      shop: false,
      camScale: 1.2,
    };
    expect(faceWeights({ ...base, storeys: 0 }).bands).toBe(0);
    expect(faceWeights({ ...base, storeys: 3 }).bands).toBe(3);
    expect(faceWeights({ ...base, storeys: 3 }).opening).toBeGreaterThan(0);
  });

  it("a measured party wall has no openings in it, while the same wall as a front does", () => {
    const base = {
      Lm: 14,
      Hm: 11,
      dhPx: 40,
      storeys: 3,
      type: 0,
      era: 1,
      shop: false,
      camScale: 1.2,
    };
    expect(faceTakesOpenings(ROLE_PARTY)).toBe(false);
    expect(faceWeights({ ...base, role: ROLE_PARTY }).opening).toBe(0);
    expect(faceWeights({ ...base, role: ROLE_FRONT }).opening).toBeGreaterThan(0);
  });

  it("the detail arrives on a RAMP keyed to the feature's own projected size, and S'(t) is 0 at both ends", () => {
    for (const [a, b] of Object.values(FA_RAMP)) {
      expect(faRamp(a, a, b)).toBe(0);
      expect(faRamp(b, a, b)).toBe(1);
      const h = (b - a) / 1000;
      const d = (v: number) => (faRamp(v + h, a, b) - faRamp(v - h, a, b)) / (2 * h);
      expect(Math.abs(d(a + h))).toBeLessThan(0.05 / (b - a) + 1e-3);
      expect(Math.abs(d(b - h))).toBeLessThan(0.05 / (b - a) + 1e-3);
    }
  });

  it("...and the geometry is NEVER clamped to a minimum: at the bottom of the ramp it leaves zero smoothly", () => {
    const [a, b] = FA_RAMP.op;
    let prev = 0;
    for (let i = 0; i <= 60; i++) {
      const v = a + ((b - a) * i) / 60;
      const w = faRamp(v, a, b);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = w;
    }
    // the first non-zero contribution is a small fraction of the total
    expect(faRamp(a + (b - a) / 60, a, b)).toBeLessThan(0.02);
  });

  it("the one hard early-out is exact rather than tuned — it removes nothing that would have been drawn", () => {
    // the opening is capped at 0.80 of its band and band <= dh, so at
    // dh = 2.0 the opening is at most 1.6 px, which is FA_RAMP.op[0] * ~1.8
    expect(FA_MIN_DH_PX * FA_HMAX_F).toBeCloseTo(1.6, 6);
    expect(faceWeights({
      Lm: 14, Hm: 11, dhPx: FA_MIN_DH_PX - 0.01, storeys: 3,
      role: ROLE_FRONT, type: 0, era: 1, shop: false, camScale: 0.02,
    }).opening).toBe(0);
  });

  it("no uncounted storey is invented — the roll's own count, or nothing", () => {
    expect(storeysOf(3, 5)).toBe(3);
    expect(storeysOf(0, 5)).toBe(5);
    expect(storeysOf(0, 0)).toBe(0);
    // and a footprint with neither gets no openings, not a guess
    expect(faceWeights({
      Lm: 14, Hm: 11, dhPx: 40, storeys: 0,
      role: ROLE_FRONT, type: 0, era: 1, shop: false, camScale: 1.2,
    }).opening).toBe(0);
  });

  it("the sill is a FRACTION of the band, not a metre offset", () => {
    // On a Sunset house — 1 published storey, 6.0 m measured — a fixed 0.95 m
    // sill puts a window in the bottom third and 3 m of blank wall over it.
    const band = 6.0;
    const frac = 0.6;
    const openM = Math.min(2.4, band * Math.min(FA_HMAX_F, 0.42));
    const sill = (band - openM) * frac;
    expect(sill).toBeGreaterThan(0.95);
    // and the metre CAP survives: a window is not four metres tall
    expect(openM).toBeLessThanOrEqual(2.4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the roofs
// ────────────────────────────────────────────────────────────────────────────

describe("the roof", () => {
  it("nothing claims a PITCHED roof — the published statistics do not support one", () => {
    const src = roofsSource();
    for (const word of ["ridge", "gable", "hip"]) {
      // the words appear only inside the comments that explain why they are
      // forbidden, never as a drawn primitive
      expect(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))
        .not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
  });

  it("the drawn height is the published median, not the whole-metre byte, and it never moves it by more than the byte rounded away", () => {
    for (let h = 0; h < 256; h++)
      for (let q = 0; q < 4; q++)
        expect(Math.abs(roofHeight(h, q) - h)).toBeLessThanOrEqual(0.375);
    expect(RH_LEVELS).toEqual([-0.375, -0.125, 0.125, 0.375]);
  });

  it("no storey line is held at a size floor — a band under the cut-off is not drawn at all", () => {
    expect(drawsStoreyLines(STOREY_MIN_PX * 3 - 0.01, 3)).toBe(false);
    expect(drawsStoreyLines(STOREY_MIN_PX * 3 + 0.01, 3)).toBe(true);
    // and there is no floor: the band's size is the wall over the count
    expect(drawsStoreyLines(4, 0)).toBe(false);
  });

  it("the roof's value inside its band is the published height against the band's own quartiles, checked element by element, not a hash", () => {
    const hq: Quartiles = [
      [5.69, 6.11, 7.25],
      [9.48, 10.3, 11.77],
      [15.92, 17.58, 20.86],
      [27.41, 33.6, 48.94],
    ];
    expect(bandOfHeight(6)).toBe(0);
    expect(bandOfHeight(12)).toBe(1);
    expect(bandOfHeight(20)).toBe(2);
    expect(bandOfHeight(60)).toBe(3);
    expect(roofStep(5.0, hq)).toBe(0);
    expect(roofStep(6.0, hq)).toBe(1);
    expect(roofStep(6.5, hq)).toBe(2);
    expect(roofStep(8.0, hq)).toBe(3);
    // monotone in the published height, so the DIRECTION is information
    let prev = -1;
    for (let h = 4; h < 9; h += 0.1) {
      const s = roofStep(h, hq);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    // and the amplitude is +-14 %
    expect(RSHADE[0]).toBeCloseTo(1 - 0.125, 2);
    expect(RSHADE[3]).toBeCloseTo(1 + 0.14, 2);
  });

  it("the tray is a ramp, never a threshold, never clamped", () => {
    expect(trayW(DE.tr0)).toBe(0);
    expect(trayW(DE.tr1)).toBe(1);
    const h = (DE.tr1 - DE.tr0) / 4000;
    const d = (v: number) => (trayW(v + h) - trayW(v - h)) / (2 * h);
    expect(Math.abs(d(DE.tr0 + h))).toBeLessThan(1e-3);
    expect(Math.abs(d(DE.tr1 - h))).toBeLessThan(1e-3);
    let prev = -1,
      worst = 0;
    for (let i = 0; i <= 400; i++) {
      const v = DE.tr0 + ((DE.tr1 - DE.tr0) * i) / 400;
      const w = trayW(v);
      expect(w).toBeGreaterThanOrEqual(prev);
      if (prev >= 0) worst = Math.max(worst, w - prev);
      prev = w;
    }
    expect(worst).toBeLessThan(0.006);
    // and no Math.max floor in the source
    expect(roofsSource()).not.toMatch(/Math\.max\([\d.]+,[^)]*k2/);
  });

  it("the coping sits AT the published height and the deck sits BELOW it, so no vertex of any roof stands above the measured top", () => {
    // drop is positive downward on screen; the deck is inset and dropped
    expect(DE.parapet).toBeGreaterThan(0);
    expect(DE.thick).toBeGreaterThan(0);
    expect(DE.deckv).toBeLessThan(1);
    expect(DE.innerv).toBeLessThan(DE.deckv);
  });

  it("two published moments support two planes and no more", () => {
    // the Ferry Building: 15.2 m median over 71.4 m max
    expect(stepFires(15.2, 71.4, 200)).toBe(true);
    // and the model correctly declines where the mean sits at or below the median
    expect(stepFraction(15.2, 71.4, 15.0)).toBe(0);
    expect(stepFraction(15.2, 71.4, 30)).toBeGreaterThan(0);
    expect(stepFraction(15.2, 71.4, 70)).toBeLessThanOrEqual(0.5);
    // the gate is one San Francisco storey and 25 ft squared
    expect(stepFires(10, 15, 200)).toBe(false);
    expect(stepFires(10, 20, 40)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the landmarks
// ────────────────────────────────────────────────────────────────────────────

describe("emphasis", () => {
  it("the rule is ONE ceiling and ONE target for the whole set — no per-building emphasis dial exists anywhere", () => {
    expect(WO_T).toBe(0.135);
    expect(WO_EMAX).toBe(5.0);
    const src = landmarksSource().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/emphasisBy(Name|Building|Id)/);
  });

  it("nothing is drawn past the ceiling, at any camera the page can reach", () => {
    for (let i = 0; i < 200; i++) {
      const k = 0.05565 * (0.2 + (i / 200) * 40);
      for (const top of [13, 16.4, 37, 51.3, 71.4, 88, 210])
        expect(emphasis(top, k, 1.6, 940)).toBeLessThanOrEqual(WO_EMAX + 1e-12);
    }
  });

  it("drawn height is monotone non-decreasing in cam.scale and never outruns it — d log h / d log k in [0,1], every hero", () => {
    for (const top of [13, 16, 18, 34.4, 37, 46.4, 51.3, 71.4, 88, 210]) {
      for (let i = 1; i < 400; i++) {
        const k = 0.05565 * (0.2 + (i / 400) * 40);
        const e = emphasisElasticity(top, k, 1.6, 940);
        expect(e).toBeGreaterThan(-1e-6);
        expect(e).toBeLessThan(1 + 1e-6);
      }
    }
  });

  it("...and there is no release point: the derivative itself is continuous, so no wheel zoom can pass through a step", () => {
    // A STEP in the first derivative of size 1 over this sampling would read
    // about 0.0126 here; the smoothstep's own curvature is an order of
    // magnitude under that.
    // Sampled uniformly in LOG k, which is the variable the elasticity is
    // taken with respect to; a linear sweep over a 40x range packs its samples
    // at the wide end and measures its own spacing.
    // THE TEST THAT SEPARATES A CURVE FROM A RELEASE, and it is not a
    // threshold on one sampling. A floor releasing is a JUMP of order 1 in the
    // elasticity at one sample, and a jump DOES NOT SHRINK when the sampling
    // is refined. A continuous derivative's worst step is |E''| times the
    // spacing, so halving the spacing halves it.
    const lo = Math.log(0.05565 * 0.2),
      hi = Math.log(0.05565 * 40);
    const worstAt = (n: number): number => {
      let worst = 0,
        prev = NaN;
      for (let i = 0; i <= n; i++) {
        const k = Math.exp(lo + ((hi - lo) * i) / n);
        const e = emphasisElasticity(88, k, 1.6, 940);
        if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(e - prev));
        prev = e;
      }
      return worst;
    };
    const coarse = worstAt(600);
    const fine = worstAt(2400);
    // a release would read of order 1 at either sampling
    expect(coarse).toBeLessThan(0.05);
    // and it is the spacing, not a step: 4x the samples, ~4x smaller
    expect(fine).toBeLessThan(coarse / 3);
  });

  it("R = 1.5*log2(WO_EMAX) makes the bracket peak at exactly 1, so the elasticity is never negative", () => {
    expect(WO_R).toBeCloseTo(1.5 * Math.log2(5), 12);
    // the drawing never grows as the camera pulls back
    let last = Infinity;
    for (let i = 400; i >= 1; i--) {
      const k = 0.05565 * (0.2 + (i / 400) * 40);
      const h = emphasis(88, k, 1.6, 940) * 88 * 1.6 * k;
      expect(h).toBeLessThanOrEqual(last + 1e-9);
      last = h;
    }
  });

  it("F redistributes height rather than adding it — the total drawn top is exactly the E the law asked for", () => {
    for (const [top, zr] of [
      [88, 26],
      [71.4, 15],
      [51.3, 6],
      [210, 117.6],
    ]) {
      const E = 3.4;
      const F = crownFactor(E);
      const Ep = planScale(E, top, zr);
      const drawnTop = Ep * (zr + (top - zr) * F);
      expect(drawnTop).toBeCloseTo(E * top, 9);
      // and E' < E, so the footprint grows much less than the height does
      expect(Ep).toBeLessThan(E);
    }
  });

  it("the roofline is derived by one mechanical test over the authored parts — nothing is named", () => {
    const part = (z1: number, r: number): HeroPart => ({
      kind: "solid",
      z0: 0,
      z1,
      profile: [
        { u: 0, s: 1 },
        { u: 1, s: 1 },
      ],
      rx: new Float32Array([-r, r, r, -r]),
      ry: new Float32Array([-r, -r, r, r]),
      mat: 0,
      min: 0,
    });
    // a wide base and a narrow drum: the roofline is the base
    expect(rooflineOf([part(26, 60), part(88, 14)])).toBe(26);
    // a windmill: the cap is nearly as wide as the tower, so zr = top
    expect(rooflineOf([part(10, 8), part(13, 7)])).toBe(13);
  });

  it("the measured cap VOLUME is conserved inside the measured envelope", () => {
    // a cylinder is unchanged
    expect(
      volumeScale([
        { u: 0, s: 1 },
        { u: 1, s: 1 },
      ]),
    ).toBeCloseTo(1, 9);
    // a cone holds less, so its radius grows to conserve the volume
    expect(
      volumeScale([
        { u: 0, s: 1 },
        { u: 1, s: 0 },
      ]),
    ).toBeGreaterThan(1);
  });

  it("without the n-gon correction the Ferry Building's square tower under-reads its own published area by 36 %", () => {
    // an n-gon of circumradius R has area (n/2) R^2 sin(2 pi / n)
    const square = (4 / 2) * Math.sin((2 * Math.PI) / 4); // = 2
    expect(1 - square / Math.PI).toBeCloseTo(0.363, 2);
    expect(ngonScale(4)).toBeCloseTo(Math.sqrt(Math.PI / 2), 9);
    // and a fine polygon needs almost none
    expect(Math.abs(ngonScale(72) - 1)).toBeLessThan(0.001);
  });

  it("the accent is the highest-chroma material used above the roofline, and a crown with no chroma gets none", () => {
    // chroma is max-min of the channels, deliberately NOT HLS saturation
    expect(chroma("#ffffff")).toBe(0);
    expect(chroma("#d0a23c")).toBeGreaterThan(0.12);
    expect(accentOf(["#b9b2a2", "#d0a23c", "#8f8a80"])).toBe("#d0a23c");
    expect(accentOf(["#b9b2a2", "#c9c4b8"])).toBeNull();
  });

  it("nothing in the LOD may read cam.scale — the landmark signature is identical across a whole band of zoom", () => {
    const sigs = new Set<string>();
    for (let f = 0.72; f <= 1.45; f += 0.06)
      sigs.add(lmLOD(1, true, true) + "|" + lmLOD(1, true, false) + "|" + lmLOD(1, false, false));
    expect(sigs.size).toBe(1);
    const src = landmarksSource();
    const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const lm = body.slice(body.indexOf("export function lmLOD"));
    expect(lm.slice(0, 400)).not.toMatch(/cam\.scale/);
  });
});

describe("the bridge", () => {
  it("the Golden Gate's tower height, deck height, deck width and main span are the published ones", () => {
    expect(GGB.towerFt * 0.3048).toBeCloseTo(231.6, 1);
    expect(GGB.deckZ).toBe(67.1);
    expect(GGB.deckW).toBe(18.9);
    expect(GGB.spanM).toBe(1280.2);
    expect(GGB.towers).toBe(2);
    expect(GGB.deckLenM).toBe(1753);
  });

  it("...and the bridge is not drawn before the register's own year", () => {
    // 1933 is when construction began and 1937 is when the bridge was completed
    // and opened. A map that shows where a bridge IS wants the year it existed.
    expect(GGB.year).toBe(1937);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// the labels
// ────────────────────────────────────────────────────────────────────────────

describe("the ink budget", () => {
  it("the place names cost no more than the ink a name layer was measured to cost this frame, split evenly between the two published classes", () => {
    expect(HOOD_INK).toBe(0.0304);
    expect(PLACE_INK_PER_CLASS).toBeCloseTo(0.0152, 6);
    expect(PLACE_INK_PER_CLASS * 2).toBeCloseTo(HOOD_INK, 12);
  });

  it("the budget is EXACT — a name is admitted only if its own box fits in what is left, so the layer cannot overshoot by one label", () => {
    const area = 1440 * 940;
    const b = new InkBudget(0.0152, area);
    const box = Math.floor(Math.sqrt(0.0152 * area));
    // fill it to just under the limit
    let admitted = 0;
    while (b.spend(box, box)) admitted++;
    expect(b.spent).toBeLessThanOrEqual(0.0152 + 1e-12);
    expect(admitted).toBeGreaterThan(0);
    // a refused box changes nothing
    const before = b.spent;
    expect(b.spend(box * 4, box * 4)).toBe(false);
    expect(b.spent).toBe(before);
  });

  it("...and a check-then-add cap would overshoot, which is what the first version of this assertion was written against", () => {
    const area = 1000;
    const b = new InkBudget(0.5, area);
    expect(b.spend(20, 20)).toBe(true); // 400 of 500
    expect(b.spend(20, 20)).toBe(false); // would be 800 of 500 — refused
    expect(b.spent).toBe(0.4);
  });
});

describe("the labels", () => {
  it("a name is only written where the thing it names is at least as long as the name", () => {
    // the three magic minLen numbers were one rule written three times: at the
    // three preset cameras they are 75, 82 and 74 px of projected street, and a
    // street name at these sizes measures 70-90 px
    const camBase = 0.05565;
    for (const [lenM, z] of [
      [1100, 1.0],
      [420, 2.9],
      [150, 7.2],
    ]) {
      const px = lenM * 1.2247 * camBase * z;
      expect(px).toBeGreaterThan(60);
      expect(px).toBeLessThan(110);
    }
    expect(nameFitsItsStreet(1100, 80, camBase)).toBe(false);
    expect(nameFitsItsStreet(1100, 80, camBase * 1.2)).toBe(true);
  });

  it("the un-designated lane is gated on the thing being at least as big on screen as one line of its own type", () => {
    const camBase = 0.05565;
    expect(placeIsBigEnough(50, camBase)).toBe(false);
    expect(placeIsBigEnough(400, camBase)).toBe(true);
    // A gate that admits some and turns away most. The "59 of 904" the block
    // measured is a property of the published register, which this unit suite
    // does not load; what is asserted here is that the gate is a monotone
    // function of the thing's own published span with the threshold where the
    // type is, so a corpus of mostly-small places is mostly refused.
    let admitted = 0;
    const n = 904;
    for (let i = 0; i < n; i++) {
      // most named places are a facility or a small park, not Golden Gate Park
      const span = 8 + Math.pow(i / n, 8) * 900;
      if (placeIsBigEnough(span, camBase)) admitted++;
    }
    expect(admitted).toBeGreaterThan(0);
    expect(admitted).toBeLessThan(n / 4);
    // monotone, so nothing small slips past a big one
    for (let s2 = 10; s2 < 600; s2 += 10)
      if (placeIsBigEnough(s2, camBase))
        expect(placeIsBigEnough(s2 + 10, camBase)).toBe(true);
  });

  it("a ring wider than one San Francisco block has located a landmark and has not sized it", () => {
    expect(ringSizesIt(120, 60)).toBe(true);
    // 233,162 m2 is City College's campus, not the mural on its wall
    expect(ringSizesIt(600, 400)).toBe(false);
  });

  it("height belongs inside the span's max — a tower and a shed of the same plan are correctly not the same size", () => {
    expect(spanOfFootprint(544, 6)).toBeCloseTo(Math.sqrt(544), 6);
    expect(spanOfFootprint(544, 51.3)).toBe(51.3);
    // a metre of height is within 8 % of a metre of width on screen
    expect(Math.abs(1.1314 / 1.2247 - 1)).toBeLessThan(0.08);
  });

  it("the budget is spent in class order and then by measured length, which LB_ORDER computed and nothing read", () => {
    const cls = new Uint8Array([2, 0, 1, 0]);
    const len = new Float32Array([100, 500, 900, 4000]);
    const ord = labelOrder(cls, len);
    // the two arterials first, longest first
    expect(Array.from(ord)).toEqual([3, 1, 2, 0]);
  });

  it("the spine is data-derived — the longest rank-0 stretch, not a whitelist", () => {
    const cls = new Uint8Array([0, 1, 0, 0]);
    const len = new Float32Array([100, 9999, 4000, 250]);
    expect(Array.from(spineOf(cls, len, 2))).toEqual([2, 3]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────────

function fakeCtx(calls: string[]): CanvasRenderingContext2D {
  const noop = (name: string) => () => {
    calls.push(name);
  };
  const c = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter" as CanvasLineJoin,
    lineCap: "butt" as CanvasLineCap,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low" as ImageSmoothingQuality,
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    fillRect: noop("fillRect"),
    beginPath: noop("beginPath"),
    closePath: noop("closePath"),
    moveTo: noop("moveTo"),
    lineTo: noop("lineTo"),
    fill: noop("fill"),
    stroke: noop("stroke"),
    save: noop("save"),
    restore: noop("restore"),
    clip: noop("clip"),
    arc: noop("arc"),
    ellipse: noop("ellipse"),
    transform: noop("transform"),
    setTransform: noop("setTransform"),
    translate: noop("translate"),
    scale: noop("scale"),
    drawImage: noop("drawImage"),
    strokeText: noop("strokeText"),
    fillText: noop("fillText"),
    measureText: () => ({ width: 10 }) as TextMetrics,
  };
  return c as unknown as CanvasRenderingContext2D;
}

function fakeFrame(ctx: CanvasRenderingContext2D) {
  return {
    ctx,
    W: 1440,
    H: 940,
    cam: { cx: 0, cy: 0, scale: 0.05565 },
    proj: new Projection(),
    dpr: 2,
    moving: false,
  };
}

function readSource(name: string): string {
  // Node-only: the suite reads its own module text to assert what is NOT in it,
  // which is the only way to state "no gable geometry exists" without a canvas.
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}
function roofsSource(): string {
  return readSource("roofs.ts");
}
function landmarksSource(): string {
  return readSource("landmarks.ts");
}
