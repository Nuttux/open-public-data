import { describe, expect, it } from "vitest";

import {
  ARRQ,
  FRESH,
  FRESH_YEARS,
  HZL,
  NF1,
  colourLUT,
} from "@/lib/city/buildings";
import { LOOK, lerpHex, qTilt, skylit } from "@/lib/city/terrain";
import {
  riseOf as pageRiseOf,
  risePhase as pageRisePhase,
} from "@/lib/city/film";
import {
  BORN_UNDATED,
  FRESH_GAMMA,
  FRESH_ROOF,
  FRESH_WALL,
  JIT_SPAN,
  OFF_RANGE,
  RISE_LEAD,
  RISE_MIN,
  RISE_WIN,
  STAGGER_JITTER,
  freshness,
  packBorn,
  riseNodes,
  risePhase,
  riseOf,
} from "./rise";

/* ═══════════════════════════════════════════════════════════════════════
   THE WAVE IS NOT THIS FILE'S INVENTION, so the test is not this file's
   either: everything here that can be checked against the PUBLISHED page is
   checked against it rather than against a number retyped from it.

   `lib/city/film.ts` owns `riseOf` and `risePhase`; `lib/city/buildings.ts`
   owns `freshLUT` and ships its output as `colourLUT().roofF`. Both are
   imported and compared, so a change on either side fails here rather than
   drifting quietly — which is exactly how `roofF` came to ship for three
   rounds with nothing reading it.
   ═══════════════════════════════════════════════════════════════════════ */

describe("the wave agrees with the page that publishes it", () => {
  it("riseOf matches lib/city/film over the whole domain", () => {
    let worst = 0;
    for (let p = 0; p <= 20; p++)
      for (let d = 0; d <= 10; d++)
        for (let h = 0; h <= 10; h++) {
          const phase = p / 20, dn = d / 10, hash = h / 10;
          worst = Math.max(
            worst,
            Math.abs(riseOf(phase, dn, hash) - pageRiseOf(phase, dn, hash)),
          );
        }
    expect(worst).toBe(0);
  });

  it("carries the same three motion constants", () => {
    expect(RISE_WIN).toBe(0.385);
    expect(RISE_LEAD).toBe(0.55);
    expect(STAGGER_JITTER).toBe(0.18);
  });

  /* ── THE ONE DELIBERATE DIFFERENCE, AND IT IS A SUBTRACTION ────────────
     The page's `risePhase` takes a `playing` flag; this one does not, because
     `citygl/film.ts` already pins the year at `iy + 0.999` when the wave does
     not fit the run. So the two agree WHEREVER THE PAGE IS PLAYING, and the
     not-playing case is the pinned year, which both answer 1 to. */
  it("risePhase matches the page's whenever a clock is running", () => {
    for (let i = 0; i <= 100; i++) {
      const y = 1900 + i / 100;
      expect(risePhase(y)).toBeCloseTo(pageRisePhase(y, true), 12);
    }
  });

  it("answers 1 to everything that is not a running year", () => {
    expect(risePhase(undefined)).toBe(1);
    expect(risePhase(1906)).toBe(1);
    /* the film's own pin for a run the wave does not fit */
    expect(risePhase(1906.999)).toBe(1);
    /* and past the window, which is most of every year. `1906 + RISE_WIN`
       is NOT past it: 1906.385 has no float32 or float64 representation and
       the sum lands 2.4e-13 short, so the phase comes back 0.9999999999998.
       Written as the boundary and a step past it rather than pretending the
       sum is exact — the year the film hands out is a fraction of a second's
       worth of milliseconds and never sits on the edge. */
    expect(risePhase(1906 + RISE_WIN)).toBeCloseTo(1, 10);
    expect(risePhase(1906 + RISE_WIN + 1e-9)).toBe(1);
    expect(risePhase(1906.9)).toBe(1);
  });

  it("runs far edge to near edge", () => {
    /* `dn` 0 is the far edge, and it must be standing before the near one */
    for (let p = 1; p < 20; p++) {
      const phase = p / 20;
      expect(riseOf(phase, 0, 0.5)).toBeGreaterThanOrEqual(riseOf(phase, 1, 0.5));
    }
    /* and everything is up at the end of the window */
    for (let d = 0; d <= 10; d++)
      for (let h = 0; h <= 10; h++) expect(riseOf(1, d / 10, h / 10)).toBe(1);
  });

  it("never leaves a building standing before its own year opens", () => {
    for (let d = 0; d <= 10; d++)
      for (let h = 0; h <= 10; h++) expect(riseOf(0, d / 10, h / 10)).toBe(0);
  });
});

describe("the year and the draw ride in one float", () => {
  it("floor recovers the year byte for every byte and every draw", () => {
    for (let yb = 0; yb <= 200; yb++)
      for (let k = 0; k <= 32; k++) {
        const packed = packBorn(yb, k / 32);
        expect(Math.floor(packed)).toBe(yb);
        expect((packed - yb) / JIT_SPAN).toBeCloseTo(k / 32, 4);
      }
  });

  /* THE ROLL'S OWN "NOT KNOWN" IS NOT A YEAR. `BORN_UNDATED` has to sit far
     enough past any real year byte that it never joins a cohort (which needs
     |born - year| < 0.5) and never ages into the ochre (which needs
     0 <= year - born < FRESH_YEARS). A century and a half of years is 176. */
  it("the undated sentinel can never be mistaken for a year", () => {
    for (let y = 0; y <= 200; y++) {
      expect(Math.abs(BORN_UNDATED - y)).toBeGreaterThanOrEqual(0.5);
      expect(y - BORN_UNDATED).toBeLessThan(0);
    }
  });

  /* MEASURED on the published footprints: the largest distance any vertex
     sits from its own footprint's centroid is 202.1 m, read off
     `__cityGLMat.maxOff` over all 166,166. `OFF_RANGE` clears that tenfold,
     which is the headroom a city with longer sheds would spend. */
  it("the centroid offset has room for a footprint", () => {
    expect(OFF_RANGE).toBeGreaterThan(202.1 * 4);
    /* and a step is far below anything `dn` can see */
    expect(OFF_RANGE / 32767).toBeLessThan(0.1);
  });
});

describe("the ochre is freshLUT's ochre", () => {
  const pal = {
    roof: ["#3a3730", "#6f6b61", "#9a9384", "#c9c0ab", "#ded4bd"],
    wall: ["#c9bfa8", "#a8987f", "#b7ae99"],
  };
  /* camStep 2 is the band whose `COVER_GAIN` is 1, so the table is the
     colours themselves rather than the colours times a coverage correction —
     which is what makes the two sides comparable at all */
  const t = colourLUT({ roof: pal.roof, wall: pal.wall }, 0, 2);

  it("decays over exactly six years, on the published curve", () => {
    for (let age = 0; age < FRESH_YEARS; age++) {
      expect(freshness(age)).toBeCloseTo(
        Math.pow(1 - age / FRESH_YEARS, FRESH_GAMMA),
        12,
      );
    }
    expect(freshness(FRESH_YEARS)).toBe(0);
    expect(freshness(-1)).toBe(0);
    expect(freshness(0)).toBe(1);
  });

  /* THE COEFFICIENT ITSELF, AGAINST THE SHIPPED TABLE. `roofF` at tint index
     0 is the roof's own colour and at `age + 1` is that colour mixed toward
     `FRESH`; if `FRESH_ROOF.freshK` were anything but the table's own number
     these would not be the same string. */
  it("a roof goes exactly as far toward the ochre as roofF does", () => {
    for (let c = 0; c < pal.roof.length; c++) {
      const base = t.roofF[(c * HZL + 0) * NF1];
      for (let age = 0; age < FRESH_YEARS; age++) {
        expect(lerpHex(base, FRESH, freshness(age) * FRESH_ROOF.freshK)).toBe(
          t.roofF[(c * HZL + 0) * NF1 + age + 1],
        );
      }
    }
  });

  /* AND THE PALE A MID-RISE ROOF LANDS ON, against the same table's arrival
     ramp. The ramp is five quantised steps there because a table index was a
     `fill()` batch key; the shader's is the continuous function those five
     steps sample, so the check is at the five points they sample it AT. */
  it("a rising roof lands on roofF's own pale", () => {
    for (let c = 0; c < pal.roof.length; c++) {
      const base = t.roofF[(c * HZL + 0) * NF1];
      for (let a = 0; a < ARRQ; a++) {
        const tt = (a + 0.5) / ARRQ;
        expect(
          lerpHex(
            lerpHex(base, FRESH_ROOF.pale, tt * FRESH_ROOF.paleK),
            FRESH,
            FRESH_ROOF.freshK,
          ),
        ).toBe(t.roofF[(c * HZL + 0) * NF1 + FRESH_YEARS + 1 + a]);
      }
    }
  });

  /* A WALL IS NOT A ROOF, and `wallF` proves it: the same two mixes with
     different numbers, then `skylit` for the face's own tilt. Checked through
     `skylit` rather than around it, so the pair being compared is the pair
     the renderer paints. */
  it("a wall goes exactly as far as wallF does, on all four faces", () => {
    /* READ OFF THE SAME SWITCH THE TABLE IS BUILT WITH. `wallK` is private
       to `lib/city/buildings.ts` and branches on `LOOK.facek`; hardcoding one
       branch here would fail the day that dial moved, for a reason that has
       nothing to do with the ochre. */
    const wallK = (q: number): number =>
      LOOK.facek ? 0.50 + 0.18 * q : 0.66 + 0.1 * q;
    for (let c = 0; c < pal.wall.length; c++) {
      for (let age = 0; age < FRESH_YEARS; age++) {
        const mixed = lerpHex(
          pal.wall[c],
          FRESH,
          freshness(age) * FRESH_WALL.freshK,
        );
        for (let q = 0; q < 4; q++) {
          expect(skylit(mixed, wallK(q), qTilt(q))).toBe(
            t.wallF[((c * HZL + 0) * NF1 + age + 1) * 4 + q],
          );
        }
      }
    }
  });
});

describe("the nodes", () => {
  it("build, and the uniforms move", () => {
    const r = riseNodes();
    expect(r.state()).toEqual({ year: -1000, phase: 1, wave: 0, zexb: 1, zex: 1 });
    r.setYear(59);
    r.setPhase(0.4);
    r.setZexb(1.6);
    /* THE GROUND'S EXAGGERATION IS A UNIFORM NOW, and it belongs in this
       assertion for the same reason the others do: it is the whole of what a
       band change hands the fabric — see `layers/buildings.ts` §THE GROUND IS
       A UNIFORM, NOT A REWRITE — so a setter that silently stopped reaching
       the shader would draw the entire city at the wrong exaggeration with
       nothing else to notice. */
    r.setZex(3.3);
    expect(r.state()).toEqual({
      year: 59, phase: 0.4, wave: 1, zexb: 1.6, zex: 3.3,
    });
    /* THE SETTLED PRESENT IS AN EXACT ZERO, not a small number. The position
       node subtracts its deficit multiplied by `wave`, so this is what makes
       a frame outside a cohort's window one the wave has not touched at all. */
    r.setPhase(1);
    expect(r.state().wave).toBe(0);
    r.setYear(undefined);
    expect(r.state().year).toBe(-1000);
  });

  it("hands out the position and the three colour nodes", () => {
    const r = riseNodes();
    expect(r.position).toBeTruthy();
    expect(r.colour(FRESH_ROOF)).toBeTruthy();
    expect(r.colour(FRESH_WALL)).toBeTruthy();
    expect(r.inkColour).toBeTruthy();
  });

  it("keeps the page's own threshold for a building that has not started", () => {
    expect(RISE_MIN).toBe(0.001);
  });
});
