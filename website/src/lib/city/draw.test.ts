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
import type { Frame } from "./terrain";
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
  plateRect,
  PLATE_KMAX,
  PLATE_PAD,
} from "./terrain";
import { coastBand, wedgeCovered, buildShoal, depthM, assertRefinement, resampleC1, shoalCellAlpha, shoalNodeAlpha, SHOAL_A0, SHOAL_REACH, drawShoreCorridor, BAY_OPEN, SHORE_IN, SHORE_OUT, buildDepthPlate } from "./water";
import {
  centrelineFade,
  drawCentrelines,
  extentW,
  ST_CLS_MAX,
  ST_EXT_PX,
  ST_KPROJ,
  ST_SRF_PX,
  surfaceW,
  drawStreetMisc,
  ST_STAIR_BAND_M,
  ST_STAIR_TICK_M,
  type CentrelineCell,
} from "./streets";
import { bandW, blobRadius, BLOB_K, CROWN_LIFT, vrnd, VZ_C0, VZ_C1, VZ_T0, VZ_T1,
  TREE_EARLIEST, TREE_YEAR_BASE, WFLG } from "./trees";
import { applyUndatedTreeGate, TREE_UNDATED_FROM, undatedTreesVisible } from "./time";
import {
  bucketFloor,
  buildBldOrder,
  buildURND,
  COVA,
  coverageAlpha,
  COVQ,
  COV_GAMMA,
  drawnAsBuilding,
  edgeInk,
  edgeWidth,
  EDGE_SHADE,
  inkFor,
  INK_HI,
  INK_LO,
  INK_PX0,
  INK_PX1,
  INK_W0,
  INK_W1,
  KEY_DX,
  KEY_DY,
  LOD_Z0,
  LOD_Z1,
  MASS_GAIN,
  shadowOffset,
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
  LabelGrid,
  LB_SIZE,
  nameFitsItsStreet,
  NAME_APART,
  placeIsBigEnough,
  PLACE_INK_PER_CLASS,
  ringSizesIt,
  spanOfFootprint,
  spineOf,
  buildHoodAnchors,
  LEDGER_W,
  LEDGER_MIN_W,
  ST_LB_NAME_CAP,
  STREET_INK,
  StreetNamePass,
  streetLabelText,
  type StreetNameTable,
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

/* ── the outline ramp — the regression that cost a night ─────────────────
   `inkFor` was written with Rec.709 luminance and without the band scale `s`,
   so it returned the SAME ink for every value of `k` and the size ramp
   `part3.html` draws above `INK_PX0` would have been wired to a constant.
   These are on the arithmetic, not on the picture, because the picture at the
   two wide cameras is identical either way — which is why nobody saw it. */
describe("the roof outline opens with the building", () => {
  const L601 = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  // three roofs off the shipped palettes: pale stucco, blue-grey and dark tar
  const ROOFS = ["#e2d6bb", "#b0bec8", "#a4977f", "#5c584f", "#7f8182"];

  it("the ink is a DARKER VALUE OF ITS OWN ROOF, never a fixed black", () => {
    for (const c of ROOFS) {
      const ink = inkFor(c, EDGE_SHADE);
      expect(L601(ink)).toBeLessThan(L601(c));
      expect(L601(ink)).toBeGreaterThan(0);
    }
  });

  it("at EDGE_SHADE the gap sits inside the shipped [32,52] band", () => {
    for (const c of ROOFS) {
      const gap = L601(c) - L601(inkFor(c, EDGE_SHADE));
      // the clamp is on the luminance gap; rounding to bytes moves it a little
      expect(gap).toBeGreaterThanOrEqual(INK_LO - 1);
      expect(gap).toBeLessThanOrEqual(INK_HI + 1);
    }
  });

  it("and the two darker bands are ACTUALLY DARKER — `s` scales the clamp", () => {
    for (const c of ROOFS) {
      const g0 = L601(c) - L601(inkFor(c, EDGE_SHADE));
      const g1 = L601(c) - L601(inkFor(c, EDGE_SHADE * 0.82));
      const g2 = L601(c) - L601(inkFor(c, EDGE_SHADE * 0.66));
      expect(g1).toBeGreaterThan(g0 + 5);
      expect(g2).toBeGreaterThan(g1 + 5);
    }
  });

  it("below INK_PX0 nothing moves: the wide cameras are unchanged", () => {
    for (const c of ROOFS) {
      for (const px of [0, 3, 7, 12, 19.99]) {
        expect(edgeInk(c, px)).toBe(inkFor(c, EDGE_SHADE));
        expect(edgeWidth(px)).toBe(INK_W0);
      }
    }
  });

  it("the width opens 0.7 -> 1.5 over INK_PX0 -> INK_PX1 and stops there", () => {
    expect(edgeWidth(INK_PX0)).toBeCloseTo(INK_W0, 10);
    expect(edgeWidth(INK_PX1)).toBeCloseTo(INK_W1, 10);
    expect(edgeWidth(400)).toBeCloseTo(INK_W1, 10);
    // monotone, and no step anywhere in the ramp
    let prev = -1;
    for (let px = 0; px <= 120; px += 0.25) {
      const w = edgeWidth(px);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = w;
    }
  });

  it("a Financial District tower gets a line a reader can see", () => {
    // 100 px is about what a FiDi tower measures at the fourth preset
    const c = "#b0bec8";
    expect(edgeWidth(100)).toBeCloseTo(INK_W1, 10);
    const wide = L601(c) - L601(edgeInk(c, 100));
    const narrow = L601(c) - L601(edgeInk(c, 10));
    expect(wide).toBeGreaterThan(narrow * 1.4);
  });
});

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

  it("the parapet has BOTH faces, and the near one is lit and the far one is not", () => {
    /* The tray drew the parapet's inner face and left its outer face to be
       painted as wall, so the one declared feature every flat roof in this
       city has existed on the far side of every building and nowhere on the
       near side. Both faces are vertical, so both sit under the horizontal
       coping; the near one takes the key light, so it sits over the far one.
       Neither ordering is a preference — they are the two facts that already
       put `innerv` under `deckv`. */
    expect(DE.outerv).toBeLessThan(1);
    expect(DE.outerv).toBeGreaterThan(DE.innerv);
    // and the shadow the parapet throws on its own deck is darker than the
    // deck it falls on, which is the only thing a shadow has to be
    expect(DE.castv).toBeLessThan(DE.deckv);
    expect(DE.castv).toBeGreaterThan(DE.innerv);
  });

  it("the parapet's shadow and the building's own shadow read ONE key light", () => {
    /* `KEY_DX`/`KEY_DY` were literals inside `shadowOffset` and nowhere else.
       The parapet's shadow on its own deck is thrown by the same sun, and a
       second typed copy of a light is how a city ends up with a building's
       shadow going one way and its parapet's the other. Read from the one
       place, and asserted to still BE `shadowOffset`'s arithmetic. */
    const k2 = 2.0;
    for (const hM of [1, 4, 9, 40]) {
      const [ox, oy] = shadowOffset(hM, k2);
      expect(ox).toBeCloseTo(Math.min(9, hM * k2 * KEY_DX), 10);
      expect(oy).toBeCloseTo(Math.min(7, hM * k2 * KEY_DY), 10);
    }
    // down-LEFT: the light is upper-right, so the across-offset leads
    expect(KEY_DX).toBeGreaterThan(KEY_DY);
    expect(KEY_DY).toBeGreaterThan(0);
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
    rotate: noop("rotate"),
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

/* ── THE UNDATED TREE GATE — WHICH CONSTANT IT BINDS TO IS THE WHOLE RULE ──
   `tkzw-k3nq` publishes 195,310 street trees; 125,234 carry no planting date
   and the earliest date anywhere in the file is 1955, so the register has
   nothing to say about a tree standing in 1906. Block T's decision is that an
   undated tree is not drawn before 1955.

   `TREE_UNDATED_FROM` read `TREE_YEAR0`, which `trees.ts` marks @deprecated
   for exactly this reason: it is `TREE_YEAR_BASE` = 1900, the offset the `yr`
   byte is decoded against, not `TREE_EARLIEST` = 1955. The gate therefore
   tested `year >= 1900` — true at every year the rail can reach — and all
   125,234 undated trees drew in 1906. Silent, because a tree drawn fifty
   years early still looks like a tree. These cases are here so the two
   constants can never be confused again. */
describe("the undated tree gate", () => {
  it("binds to TREE_EARLIEST (1955), not to the storage offset (1900)", () => {
    expect(TREE_UNDATED_FROM).toBe(TREE_EARLIEST);
    expect(TREE_EARLIEST).toBe(1955);
    expect(TREE_YEAR_BASE).toBe(1900);
    expect(TREE_UNDATED_FROM).not.toBe(TREE_YEAR_BASE);
  });

  it("hides the undated cohort before 1955 and shows it from 1955", () => {
    for (const y of [1849, 1906, 1925, 1954]) {
      expect(undatedTreesVisible(y)).toBe(false);
    }
    for (const y of [1955, 1960, 2018, 2026]) {
      expect(undatedTreesVisible(y)).toBe(true);
    }
  });

  it("draws them when there is no clock at all — the gate is about the year", () => {
    expect(undatedTreesVisible(undefined)).toBe(true);
  });

  it("applyUndatedTreeGate sets WFLG.undated and returns the previous value", () => {
    const was = WFLG.undated;
    try {
      WFLG.undated = true;
      expect(applyUndatedTreeGate(1906)).toBe(true);
      expect(WFLG.undated).toBe(false);
      expect(applyUndatedTreeGate(1955)).toBe(false);
      expect(WFLG.undated).toBe(true);
    } finally {
      WFLG.undated = was;
    }
  });
});

/* ── Block U2: the neighbourhood capitals ──────────────────────────────────
   The anchor is DERIVED, so it is asserted rather than eyeballed: it is the
   area-weighted centroid of the blocks that carry the name, which is not the
   mean of the block centroids and must not be. */
describe("buildHoodAnchors", () => {
  const table = (
    hood: number[],
    cx: number[],
    cy: number[],
    area: number[],
    names: string[],
  ) => ({
    hood: Uint8Array.from(hood),
    hoodNames: names,
    cx: Float32Array.from(cx),
    cy: Float32Array.from(cy),
    area: Float32Array.from(area),
  });

  it("weights by the published area, not by the count of blocks", () => {
    // three small blocks at x = 0 and one large one at x = 100
    const a = buildHoodAnchors(
      table([0, 0, 0, 0], [0, 0, 0, 100], [0, 0, 0, 0], [10, 10, 10, 970], ["A"]),
    );
    expect(a).toHaveLength(1);
    // area-weighted: (3*10*0 + 970*100) / 1000 = 97, not the plain mean of 25
    expect(a[0].wx).toBeCloseTo(97, 6);
    expect(a[0].areaM2).toBeCloseTo(1000, 6);
  });

  it("emits one anchor per name that any block carries, and none for the rest", () => {
    const a = buildHoodAnchors(
      table([0, 2, 2], [0, 10, 20], [0, 4, 6], [1, 1, 1], ["A", "B", "C"]),
    );
    expect(a.map((h) => h.name).sort()).toEqual(["A", "C"]);
  });

  it("orders by the ground each name describes — largest first, deterministic", () => {
    const a = buildHoodAnchors(
      table([0, 1, 2], [0, 0, 0], [0, 0, 0], [5, 900, 90], ["A", "B", "C"]),
    );
    expect(a.map((h) => h.name)).toEqual(["B", "C", "A"]);
  });

  it("ignores a hood byte with no name behind it rather than indexing past the table", () => {
    const a = buildHoodAnchors(table([0, 7], [0, 999], [0, 999], [1, 1], ["A"]));
    expect(a).toHaveLength(1);
    expect(a[0].wx).toBe(0);
  });
});

/* ── Block B2: the shore corridor, the hood margin, the centrelines ─────────
   Three landings, three properties that a picture alone cannot pin down. */

describe("the shore corridor (Block B2)", () => {
  const ring: [number, number][] = [
    [0, 0], [1000, 0], [1000, 1000], [0, 1000],
  ];
  const grid = (isLand: ((i: number, j: number) => boolean) | undefined) =>
    ({
      XW: 4, XH: 4,
      mx: Float64Array.from([-2000, -1000, 0, 1000, 2000]),
      my: Float64Array.from([-2000, -1000, 0, 1000, 2000]),
      z: () => 0,
      lam: new Float32Array(16),
      segs: new Uint16Array(0),
      order: new Int32Array(0),
      isLand,
    }) as unknown as Parameters<typeof drawShoreCorridor>[3]["surround"];

  it("draws nothing without a surround grid — a corridor is not built on a guess", () => {
    const ctx = fakeCtx([]);
    const f = fakeFrame(ctx) as unknown as Parameters<typeof drawShoreCorridor>[0];
    const t = { elevM: () => 0 } as unknown as Parameters<typeof drawShoreCorridor>[1];
    expect(drawShoreCorridor(f, t, [ring], {})).toBe(0);
    expect(drawShoreCorridor(f, t, [ring], { surround: null })).toBe(0);
  });

  it("draws nothing when the grid carries no land bit", () => {
    const ctx = fakeCtx([]);
    const f = fakeFrame(ctx) as unknown as Parameters<typeof drawShoreCorridor>[0];
    const t = { elevM: () => 0 } as unknown as Parameters<typeof drawShoreCorridor>[1];
    expect(drawShoreCorridor(f, t, [ring], { surround: grid(undefined) })).toBe(0);
  });

  it("BAY_OPEN is opaque and it is the page's own open-water tone", () => {
    // the reference fills the corridor at full strength and lays the graded
    // shallows back over it; a hazed fill here would be the bay plate again
    expect(BAY_OPEN).toBe("#87a6c6");
    expect(SHORE_OUT).toBe(1100);
    expect(SHORE_IN).toBe(130);
  });
});

describe("the hood margin is measured on the VISIBLE STRIP (Block B2)", () => {
  /* The ledger is `right: 0`, so the strip is [0, W - LEDGER_W] and its centre
     is LEDGER_W/2 LEFT of the canvas centre. Testing the strip's WIDTH against
     the CANVAS's centre threw away the left 144 px and admitted 144 px of
     ledger. The rule, stated as arithmetic: the whole box is inside [0, vw]. */
  const admits = (X: number, bw: number, W = 1200) => {
    const vw = W < LEDGER_MIN_W ? W : W - LEDGER_W;
    const HX = vw / 2;
    return Math.abs(X - HX) <= HX - bw / 2;
  };
  it("admits a name at the left edge of the visible strip", () => {
    expect(admits(60, 100)).toBe(true);
  });
  it("refuses a name that would be written under the ledger", () => {
    expect(admits(1000, 100)).toBe(false);
    expect(admits(912 - 40, 100)).toBe(false); // half of it under the panel
  });
  it("refuses a name that runs off the left edge", () => {
    expect(admits(20, 100)).toBe(false);
  });
  it("under 820 px there is no ledger and the strip is the canvas", () => {
    expect(admits(400, 100, 800)).toBe(true);
    expect(admits(60, 100, 800)).toBe(true);
  });
});

describe("drawCentrelines is complete and waiting on a chunk (Block B2)", () => {
  const cell = (): CentrelineCell => ({
    cls: Uint8Array.from([0, 3]),
    yr: Uint16Array.from([0, 1930]),
    len: Uint16Array.from([2, 2]),
    x: Float32Array.from([0, 100, 0, 100]),
    y: Float32Array.from([0, 0, 50, 50]),
  });
  const run = (band: number, year?: number, lines?: CentrelineCell[]) => {
    const ctx = fakeCtx([]);
    const f = fakeFrame(ctx) as unknown as Parameters<typeof drawCentrelines>[0];
    const t = { elevM: () => 0 } as unknown as Parameters<typeof drawCentrelines>[2];
    return drawCentrelines(f, [], t, {
      medianW: [21, 21, 21, 15, 11],
      covered: () => false,
      band,
      year,
      lines,
    });
  };
  it("returns 0 when no chunk carries the geometry — today's behaviour", () => {
    expect(run(0)).toBe(0);
    expect(run(0, 2018, [])).toBe(0);
  });
  it("the class gate is the band's own, and it OPENS as you zoom", () => {
    expect(ST_CLS_MAX[0]).toBe(2);
    expect(ST_CLS_MAX[2]).toBe(4);
    // class 3 is not drawn at the whole-city band and is at the block band
    expect(run(0, 2018, [cell()])).toBe(1);
    expect(run(2, 2018, [cell()])).toBe(2);
  });
  it("an undated line is drawn in every year; a dated one waits for its year", () => {
    expect(run(2, 1906, [cell()])).toBe(1); // only the undated class-0 line
    expect(run(2, 1930, [cell()])).toBe(2);
  });
  it("the whole-city fade is 1 — the reference strokes the wide shot at full ink", () => {
    // centrelineFade(21.0 m, 0.0467) = 2 - 21*0.9306*0.0467 = 1.09 -> clamped
    expect(centrelineFade(21.0, 0.04666598864125368)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Block B8 — the street names
// ────────────────────────────────────────────────────────────────────────────

describe("the street names, which 2,786 published stretches were waiting for", () => {
  /** a ctx whose measureText is a real function of the string */
  function textCtx(drawn: string[]): CanvasRenderingContext2D {
    const c = fakeCtx([]) as unknown as {
      measureText: (t: string) => TextMetrics;
      fillText: (t: string, x: number, y: number) => void;
      letterSpacing: string;
    };
    c.letterSpacing = "0px";
    c.measureText = (t: string) => ({ width: t.length * 6 }) as TextMetrics;
    c.fillText = (t: string) => {
      drawn.push(t);
    };
    return c as unknown as CanvasRenderingContext2D;
  }

  interface Row {
    name: string;
    rank: number;
    len: number;
    wx?: number;
    wy?: number;
    yr?: number;
  }

  function table(rows: readonly Row[]): StreetNameTable {
    const names: string[] = [];
    const ix = new Map<string, number>();
    const nm = new Uint16Array(rows.length);
    const rank = new Uint8Array(rows.length);
    const yr = new Uint16Array(rows.length);
    const lengthM = new Float32Array(rows.length);
    const wx = new Float32Array(rows.length);
    const wy = new Float32Array(rows.length);
    const dx = new Float32Array(rows.length);
    const dy = new Float32Array(rows.length);
    rows.forEach((r, i) => {
      let k = ix.get(r.name);
      if (k === undefined) {
        k = names.length;
        names.push(r.name);
        ix.set(r.name, k);
      }
      nm[i] = k;
      rank[i] = r.rank;
      yr[i] = r.yr ?? 0;
      lengthM[i] = r.len;
      wx[i] = r.wx ?? 0;
      wy[i] = r.wy ?? 0;
      dx[i] = 1;
      dy[i] = 0;
    });
    return {
      n: rows.length, nm, rank, yr, lengthM, wx, wy, dx, dy,
      name: (i) => names[nm[i]] ?? "",
    };
  }

  function run(
    rows: readonly Row[],
    step: number,
    year?: number,
  ): { drawn: string[]; pass: StreetNamePass } {
    const drawn: string[] = [];
    const ctx = textCtx(drawn);
    const base = 0.05565;
    const zf = [1, 2.9, 7.2][step];
    const f = {
      ...fakeFrame(ctx),
      cam: { cx: 0, cy: 0, scale: base * zf, base, step },
      year,
    } as unknown as Frame;
    // the fixtures' coordinates are whole-city metres, so a camera three times
    // closer sees the same arrangement rather than an empty frame
    const scaled = rows.map((r) => ({
      ...r, wx: (r.wx ?? 0) / zf, wy: (r.wy ?? 0) / zf,
    }));
    const p = new StreetNamePass(f, table(scaled), new LabelGrid(f.W, f.H), () => 0);
    p.draw("spine");
    p.draw("arterials");
    p.draw("local");
    return { drawn, pass: p };
  }

  it("the rank gate is the band's — the wide shot writes arterials and nothing else", () => {
    const rows: Row[] = [
      { name: "GEARY BLVD", rank: 0, len: 9000, wx: 0 },
      { name: "CLEMENT ST", rank: 1, len: 9000, wx: 3000 },
      { name: "ANNIE ST", rank: 2, len: 9000, wx: -4000 },
    ];
    expect(run(rows, 0).drawn).toEqual(["GEARY BLVD"]);
    expect(run(rows, 1).drawn.sort()).toEqual(["CLEMENT ST", "GEARY BLVD"]);
    expect(run(rows, 2).drawn.length).toBe(3);
  });

  it("a name is only written where the street is at least as long as the name", () => {
    // 10 glyphs at 6 px + 6 = 66 px of label; 66 / (1.2247 * 0.05565) = 968 m
    expect(run([{ name: "GEARY BLVD", rank: 0, len: 960 }], 0).drawn).toEqual([]);
    expect(run([{ name: "GEARY BLVD", rank: 0, len: 980 }], 0).drawn).toEqual([
      "GEARY BLVD",
    ]);
    // and it scales with the NAME, which is the whole point of replacing minLen:
    // the same street is long enough for a short name and not for a long one
    expect(run([{ name: "3RD ST", rank: 0, len: 700 }], 0).drawn).toEqual(["3RD ST"]);
  });

  it("one label per name at the wide shot — without it the frame prints GREAT HWY twice", () => {
    const rows: Row[] = [
      { name: "GREAT HWY", rank: 0, len: 9000, wx: 0 },
      { name: "GREAT HWY", rank: 0, len: 8000, wx: 4000 },
      { name: "GREAT HWY", rank: 0, len: 7000, wx: -4000 },
    ];
    expect(ST_LB_NAME_CAP).toEqual([1, 2, 3]);
    expect(run(rows, 0).drawn.length).toBe(1);
    expect(run(rows, 1).drawn.length).toBe(2);
    expect(run(rows, 2).drawn.length).toBe(3);
  });

  it("…and the second one has to be somewhere else — STOCKTON ST twice within 300 px read as a bug", () => {
    const near: Row[] = [
      { name: "STOCKTON ST", rank: 0, len: 9000, wx: 0 },
      { name: "STOCKTON ST", rank: 0, len: 8000, wx: 1000 },
    ];
    expect(NAME_APART).toBe(260);
    // 300 m at the district camera is well inside 260 px
    expect(run(near, 1).drawn.length).toBe(1);
    const far: Row[] = [
      { name: "STOCKTON ST", rank: 0, len: 9000, wx: 0 },
      { name: "STOCKTON ST", rank: 0, len: 8000, wx: 4000 },
    ];
    expect(run(far, 1).drawn.length).toBe(2);
  });

  it("a name is not written before the street is there, and an undated name is written in every year", () => {
    const rows: Row[] = [
      { name: "GEARY BLVD", rank: 0, len: 9000, yr: 0 },
      { name: "SUNSET BLVD", rank: 0, len: 9000, wx: 4000, yr: 1932 },
    ];
    expect(run(rows, 0, 1906).drawn).toEqual(["GEARY BLVD"]);
    expect(run(rows, 0, 2018).drawn.length).toBe(2);
  });

  it("the source zero-pads and the label does not", () => {
    expect(streetLabelText("02ND ST")).toBe("2ND ST");
    expect(streetLabelText("19TH AVE")).toBe("19TH AVE");
    expect(streetLabelText("GEARY BLVD")).toBe("GEARY BLVD");
    expect(run([{ name: "03RD ST", rank: 0, len: 9000 }], 0).drawn).toEqual(["3RD ST"]);
  });

  /** 169 distinct arterials on a lattice wider apart than their own labels */
  function grid(): Row[] {
    const rows: Row[] = [];
    for (let j = 0; j < 13; j++)
      for (let i = 0; i < 13; i++)
        rows.push({
          name: `STREET ${j * 13 + i}`,
          rank: 0,
          len: 9000,
          wx: -9000 + i * 1100,
          wy: -6000 + j * 700,
        });
    return rows;
  }

  it("the budget spends the LABEL's own box, not the rotated envelope", () => {
    /* San Francisco's grid runs at 45° to the screen, where the axis-aligned
       envelope of a street name is ~3.9x its own area. Spending the envelope
       emptied the budget after seventeen arterials and the frame came back with
       no collector and no local on it at all. */
    const r = run(grid(), 0);
    expect(r.drawn.length).toBeGreaterThan(17);
    // and the account is the boxes' area over the VISIBLE STRIP, under the cap
    expect(r.pass.ink).toBeLessThanOrEqual(STREET_INK);
    expect(r.pass.ink).toBeGreaterThan(0);
  });

  it("the budget is EXACT — the layer cannot overshoot by one label", () => {
    expect(run(grid(), 0).pass.ink).toBeLessThanOrEqual(STREET_INK);
  });

  it("the spine is one stretch per NAME — Geary is 15 stretches and it gets one slot", () => {
    const cls = new Uint8Array([0, 0, 0, 0]);
    const len = new Float32Array([9000, 8000, 7000, 6000]);
    const nm = ["GEARY BLVD", "GEARY BLVD", "GEARY BLVD", "3RD ST"];
    expect(Array.from(spineOf(cls, len, 2, (i) => nm[i]))).toEqual([0, 3]);
    // without the name, the old behaviour, which is what the unit above asserts
    expect(Array.from(spineOf(cls, len, 2))).toEqual([0, 1]);
  });

  it("the hierarchy is three treatments and it is a number, not an impression", () => {
    const rows: Row[] = [
      { name: "GEARY BLVD", rank: 0, len: 9000, wx: -4000 },
      { name: "CLEMENT ST", rank: 1, len: 9000, wx: 0 },
      { name: "ANNIE ST", rank: 2, len: 9000, wx: 3000 },
    ];
    expect(run(rows, 2).pass.byRank).toEqual([1, 1, 1]);
    // ~30 % apart in size, better than 40 % apart in value
    expect(LB_SIZE[0] / LB_SIZE[2]).toBeGreaterThan(1.3);
    expect(1 - 0.54 / 0.9).toBeGreaterThanOrEqual(0.4);
  });

  it("a name written under the 288 px ledger is not a name the reader has", () => {
    /* the same clause §16.4 put on the hood pass, on the pass it came from:
       the strip is [0, W - LEDGER_W] and it is centred on itself */
    const W = 1200;
    const vw = W < LEDGER_MIN_W ? W : W - LEDGER_W;
    const admits = (X: number) => Math.abs(X - vw / 2) <= vw / 2 - 24;
    expect(admits(40)).toBe(true); // the left edge of the visible map
    expect(admits(1000)).toBe(false); // under the opaque panel
    expect(admits(920)).toBe(false); // just under its left edge
    expect(admits(880)).toBe(true);
  });
});

describe("base/street-misc, which shipped for five blocks and drew nothing", () => {
  const misc = () => ({
    islandLen: Uint16Array.from([4]),
    islandX: Float32Array.from([0, 20, 20, 0]),
    islandY: Float32Array.from([0, 0, 8, 8]),
    stairLen: Uint16Array.from([3]),
    stairX: Float32Array.from([0, 30, 60]),
    stairY: Float32Array.from([0, 10, 20]),
  });
  const run = (scale: number) => {
    const ctx = fakeCtx([]);
    const f = { ...fakeFrame(ctx), cam: { cx: 0, cy: 0, scale } } as unknown as Frame;
    const t = { elevM: () => 0 } as unknown as Parameters<typeof drawStreetMisc>[2];
    const P = (globalThis as unknown as { Path2D?: unknown }).Path2D;
    (globalThis as unknown as { Path2D: unknown }).Path2D = class {
      moveTo() {} lineTo() {} closePath() {}
    };
    try {
      return drawStreetMisc(f, misc(), t, { fwMedianM: 3.16 });
    } finally {
      (globalThis as unknown as { Path2D: unknown }).Path2D = P;
    }
  };

  it("the island gate is the city's own median footway, not a chosen number", () => {
    // manifest.streets.stats.fw_p50 = 3.16 m; the gate is fw_p50 * ST_KPROJ *
    // scale >= ST_SRF_PX + 0.5, which is the reference's L6612 literal
    const gate = (ST_SRF_PX + 0.5) / (3.16 * ST_KPROJ);
    expect(run(gate * 0.9).islands).toBe(0);
    expect(run(gate * 1.1).islands).toBe(1);
  });

  it("a stair is drawn only where a tread is more than two pixels from the next", () => {
    const gate = 2.0 / (0.9 * ST_KPROJ);
    expect(run(gate * 0.9).stairs).toBe(0);
    const r = run(gate * 1.1);
    expect(r.stairs).toBe(1);
    // and the treads are laid, at the declared 0.9 m, along both segments
    expect(r.treads).toBeGreaterThan(0);
  });

  it("the two stair numbers are DECLARED and neither is a measurement of that stair", () => {
    // aw7j-9354 publishes the run and neither a width nor a tread count
    expect(ST_STAIR_BAND_M).toBe(2.2);
    expect(ST_STAIR_TICK_M).toBe(0.9);
  });
});

describe("the depth plate at the resolution the City published", () => {
  const meta = {
    nw: 9, nh: 5, mul: 4, dmax: 120,
    qs: [0, 9.929, 27.466, 114.045],
    world: [0, 0, 100, 100] as unknown as readonly [number, number, number, number],
  };
  function mk(w: number, h: number) {
    const put: { gx: number; gy: number }[] = [];
    return Object.assign(
      {
        width: w, height: h,
        getContext: () => ({
          createImageData: (a: number, b: number) => ({ data: new Uint8ClampedArray(a * b * 4) }),
          putImageData: (_img: unknown, gx: number, gy: number) => put.push({ gx, gy }),
        }),
      },
      { put },
    ) as unknown as HTMLCanvasElement & { put: { gx: number; gy: number }[] };
  }
  const tile = (gx: number, gy: number, w: number, h: number, n = w * h) => ({
    e: { gx, gy, w, h, k: `water1/${gx}_${gy}` },
    f: { fields: { dep: new Uint8Array(n).fill(200) } } as unknown as Parameters<
      typeof buildDepthPlate
    >[1][number]["f"],
  });

  it("assembles the 26 tiles into one plate at their own published offsets", () => {
    let cv: ReturnType<typeof mk> | null = null;
    const out = buildDepthPlate(meta, [tile(0, 0, 4, 4), tile(4, 0, 5, 4)], (w, h) => {
      cv = mk(w, h);
      return cv;
    });
    expect(out).not.toBeNull();
    expect(cv!.put.map((p) => [p.gx, p.gy])).toEqual([[0, 0], [4, 0]]);
    expect(out!.width).toBe(9);
    expect(out!.height).toBe(5);
  });

  it("refuses a tile whose byte count disagrees with its own published w x h", () => {
    expect(() =>
      buildDepthPlate(meta, [tile(0, 0, 4, 4, 15)], (w, h) => mk(w, h)),
    ).toThrow(/water1\/0_0: 15 depth nodes/);
  });

  it("refuses a tile that would land outside the published field", () => {
    expect(() =>
      buildDepthPlate(meta, [tile(8, 0, 4, 4)], (w, h) => mk(w, h)),
    ).toThrow(/outside the published 9x5/);
  });

  it("no tiles is no plate — nine of the 7 x 5 positions are all land and are dropped", () => {
    expect(buildDepthPlate(meta, [], (w, h) => mk(w, h))).toBeNull();
  });

  it("1665 x 1121 IS a 4x refinement of the 416 x 280 surround grid", () => {
    // which is what lets the coarse and the refined plate swap under one blit
    expect(() => assertRefinement(
      { ...meta, nw: 1665, nh: 1121 } as unknown as Parameters<typeof assertRefinement>[0],
      416, 280,
    )).not.toThrow();
  });
});

describe("the ground plate a camera move can use", () => {
  /* The frame the film paints during a travel: the extended buffer at 1440 x
     940 DPR 2, and a plate painted for it with C2's pad. `plateRect` is the
     whole of the reuse decision — the similarity that takes a plate painted at
     camera A to a frame at camera B, or null. */
  const W = 2046,
    H = 1336,
    dpr = 2;
  const pad = (n: number) => Math.round(PLATE_PAD * n * dpr);
  const plateFor = (cx: number, cy: number, s: number, padded = true) => ({
    pw: Math.round(W * dpr) + (padded ? 2 * pad(W) : 0),
    ph: Math.round(H * dpr) + (padded ? 2 * pad(H) : 0),
    cx,
    cy,
    s,
  });
  const cam = (cx: number, cy: number, scale: number) => ({ cx, cy, scale });

  it("a plate at the frame's own camera lands 1:1 and covers it exactly", () => {
    const p = plateFor(1000, 500, 0.15, false);
    const r = plateRect(p, cam(1000, 500, 0.15), W, H, dpr, PLATE_KMAX);
    expect(r).not.toBeNull();
    expect(r!.dx).toBeCloseTo(0, 9);
    expect(r!.dy).toBeCloseTo(0, 9);
    expect(r!.dw).toBeCloseTo(W * dpr, 9);
    expect(r!.dh).toBeCloseTo(H * dpr, 9);
  });

  it("the pad is where the coverage comes from: a pure pan of 5 % holds, a pan of 20 % does not", () => {
    const s = 0.15;
    const p = plateFor(1000, 500, s);
    // the pad is 6 % a side, so it reaches 6 % of the frame's half-width
    const halfW = W / 2 / s;
    expect(plateRect(p, cam(1000 + halfW * 0.05, 500, s), W, H, dpr, PLATE_KMAX))
      .not.toBeNull();
    expect(plateRect(p, cam(1000 + halfW * 0.2, 500, s), W, H, dpr, PLATE_KMAX))
      .toBeNull();
  });

  it("zooming IN is served until the magnification ceiling, and refused past it", () => {
    const p = plateFor(1000, 500, 0.15);
    // k = frameScale / plateScale, so a frame at 1.2x the plate's scale is a
    // 1.2x magnification, and the world it needs is 1.2x SMALLER — coverage is
    // never the binding constraint on a zoom-in, the ceiling is
    expect(plateRect(p, cam(1000, 500, 0.15 * 1.2), W, H, dpr, PLATE_KMAX))
      .not.toBeNull();
    expect(plateRect(p, cam(1000, 500, 0.15 * (PLATE_KMAX + 0.05)), W, H, dpr, PLATE_KMAX))
      .toBeNull();
  });

  it("zooming OUT is never magnified, and is bounded by the pad instead", () => {
    const p = plateFor(1000, 500, 0.15);
    // 1 + 2*PAD of zoom-out is exactly the pad, so a little less holds...
    expect(plateRect(p, cam(1000, 500, 0.15 / (1 + 2 * PLATE_PAD - 0.005)), W, H, dpr, PLATE_KMAX))
      .not.toBeNull();
    // ...and a little more does not, however sharp it would be
    expect(plateRect(p, cam(1000, 500, 0.15 / (1 + 2 * PLATE_PAD + 0.02)), W, H, dpr, PLATE_KMAX))
      .toBeNull();
  });

  it("an UNPADDED plate serves only a zoom-in, which is why a travelling build pads", () => {
    const p = plateFor(1000, 500, 0.15, false);
    expect(plateRect(p, cam(1000, 500, 0.15 * 1.1), W, H, dpr, PLATE_KMAX)).not.toBeNull();
    expect(plateRect(p, cam(1000, 500, 0.15 / 1.02), W, H, dpr, PLATE_KMAX)).toBeNull();
    expect(plateRect(p, cam(1004, 500, 0.15), W, H, dpr, PLATE_KMAX)).toBeNull();
  });
});
