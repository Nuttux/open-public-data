/**
 * THE EMPHASIS LAW'S VERTICAL — the one constant that decides whether a
 * landmark behaves like a building.
 *
 * A separate file on purpose: `draw.test.ts` tests `emphasis` as a pure
 * function, passing it 1.6 explicitly, and those tests are properties of the
 * curve and must not move. What is locked here is the CALL SITE — which
 * vertical `drawHero` hands it — because that is what DRAW.md §21.29–21.30
 * measured and what Daniel decided on.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  emphasis, recognisableTop, crownFactor, WO_ZEXB, WO_EMAX, WO_R,
  GGB, GGB_TOWER_TOL_M,
} from "./landmarks";
import { ZEXB_DEFAULT } from "./projection";

const src = fs.readFileSync(path.join(__dirname, "landmarks.ts"), "utf8");
const nocomment = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** the whole-city / district / block presets: cam.base x ZSTEPS */
const BASE = 0.046665988641253695;
const PRESETS = [1.0, 2.9, 7.2].map((z) => BASE * z);
/** the canonical stage `capture.py` judges every camera at */
const H = 678;

describe("the emphasis law's vertical", () => {
  it("is 3.3 — the single dial the reference applied to terrain and buildings together", () => {
    expect(WO_ZEXB).toBe(3.3);
    // and it is NOT the built-height dial, which is what shifted the curve
    expect(WO_ZEXB).not.toBe(ZEXB_DEFAULT);
  });

  it("is the same 3.30 emit_heroes.py fits the mock's shipped `em` values to", () => {
    const py = fs.readFileSync(
      path.join(__dirname, "../../../../pipeline/scripts/us_sf_places/emit_heroes.py"),
      "utf8");
    const m = py.match(/^EM_ZEXB\s*=\s*([\d.]+)/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(WO_ZEXB);
  });

  it("`drawHero` hands the law WO_ZEXB and never the camera's own dial", () => {
    const call = nocomment.match(/const E = emphasis\([\s\S]*?\);/);
    expect(call).not.toBeNull();
    expect(call![0]).toContain("WO_ZEXB");
    expect(call![0]).not.toContain("proj.zexb");
    // BOTH arguments have to be the same dial: `recognisableTop` converts a
    // plan span into the units the shortfall is measured in.
    expect(call![0].match(/WO_ZEXB/g)!.length).toBe(2);
  });

  it("`landmarks.ts` still reads no camera-dependent vertical — ZEX_BY_STEP would put a step back in", () => {
    expect(nocomment).not.toContain("ZEX_BY_STEP");
  });
});

describe("what the vertical buys, at the three presets", () => {
  // City Hall: 11,251.5 m2 of published footprint, top 88.0 m, roofline 26 m
  const TOP = 88.0, AREA = 11251.5;
  const E = () => PRESETS.map((k) =>
    emphasis(recognisableTop(TOP, AREA, WO_ZEXB), k, WO_ZEXB, H));

  it("City Hall reads 4.17 / 1.57 / 1.00, not 5.00 / 3.18 / 1.34", () => {
    const [whole, district, block] = E();
    expect(whole).toBeCloseTo(4.170, 2);
    expect(district).toBeCloseTo(1.574, 2);
    expect(block).toBeCloseTo(1.000, 3);
    // the old call site, for the record: pinned at the ceiling at whole-city
    // and still 34 % over true size at the CLOSEST camera the page can reach.
    const old = PRESETS.map((k) =>
      emphasis(recognisableTop(TOP, AREA, ZEXB_DEFAULT), k, ZEXB_DEFAULT, H));
    expect(old[0]).toBeCloseTo(WO_EMAX, 6);
    expect(old[2]).toBeGreaterThan(1.3);
  });

  it("the landmark REACHES true size inside the page's own zoom range, which is what stops the stall", () => {
    // E = 1 exactly means the elasticity is 1: from here in it scales with the
    // city and behaves like a building. Under the old call site it never did.
    expect(E()[2]).toBe(1);
  });

  it("and the crown stops deflating there too — F reaches 1 with it", () => {
    // crownFactor is a pure function of E, so a hero that reaches E = 1 has
    // finished deflating; one that stalls at E = 1.34 is still shrinking its
    // own dome at the closest camera. DRAW.md §21.30.
    expect(crownFactor(E()[2])).toBe(1);
    const oldE = emphasis(recognisableTop(TOP, AREA, ZEXB_DEFAULT),
                          PRESETS[2], ZEXB_DEFAULT, H);
    expect(crownFactor(oldE)).toBeGreaterThan(1.15);
  });

  it("nothing moved in the curve itself — the ceiling and the ramp length are untouched", () => {
    expect(WO_EMAX).toBe(5.0);
    expect(WO_R).toBeCloseTo(1.5 * Math.log2(5), 12);
    for (const k of PRESETS)
      expect(emphasis(88, k, WO_ZEXB, H)).toBeLessThanOrEqual(WO_EMAX + 1e-12);
  });
});

/**
 * THE BAY BRIDGE — the west crossing, built from the same three published files
 * the Golden Gate is built from. What is asserted here is the RECORD and the
 * ALGEBRA; that the pixels land is a screenshot, not a unit test.
 */
describe("the second bridge", () => {
  const man = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../../../public/data/us/sf/city/manifest.json"), "utf8"));
  const ch = man.chunks.find((c: { k: string }) => c.k === "base/bridge");
  const A = ch.authoredHere;

  it("the chunk carries two bridges and the Golden Gate is still the first", () => {
    expect(ch.bridges).toHaveLength(2);
    expect(ch.bridges[0].k).toBe("golden-gate");
    expect(ch.bridges[0].year).toBe(1937);
    expect(ch.bridges[0].towers).toBe(2);
    expect(ch.bridges[1].k).toBe("bay-west");
    expect(ch.bridges[1].towers).toBe(4);
  });

  it("it opens in 1936 — a year BEFORE the Golden Gate, which is what happened", () => {
    expect(ch.bridges[1].year).toBe(1936);
    expect(ch.bridges[1].year).toBeLessThan(ch.bridges[0].year);
  });

  it("all four towers fall on the published deck line inside the FAA file's own precision", () => {
    // GGB_TOWER_TOL_M = 31.0: the obstacle file gives whole arc-seconds, which
    // is 31 m of latitude here. The emitter refuses anything further out.
    expect(A.towers.tolM).toBe(GGB_TOWER_TOL_M);
    expect(ch.bridges[1].towerOff).toHaveLength(4);
    for (const off of ch.bridges[1].towerOff)
      expect(off).toBeLessThanOrEqual(GGB_TOWER_TOL_M);
  });

  it("THE CROSS-CHECK: two federal files, nothing fitted, 0.4 % apart", () => {
    // The FAA's tower positions are whole arc-seconds from an aviation file.
    // The FHWA's max span is a highway inventory field. Nobody reconciled them.
    const seps: number[] = A.crossCheck.towerSepM;
    const span: number = A.crossCheck.nbiMaxSpanM;
    expect(seps).toHaveLength(3);
    const main = seps.filter((s) => Math.abs(s - span) / span < 0.02);
    expect(main.length).toBeGreaterThanOrEqual(2);
    for (const s of main) expect(Math.abs(s - span) / span).toBeLessThan(0.005);
    // and the middle gap is the WIDER one — it carries the central anchorage
    // the two suspension spans share, which is why the cable touches deck there
    expect(seps[1]).toBeGreaterThan(seps[0]);
    expect(seps[1]).toBeGreaterThan(seps[2]);
  });

  it("a quad may stand for 17 vertices, and that is measured rather than assumed", () => {
    expect(A.alignment.verts).toBe(17);
    expect(A.alignment.straightness).toBeLessThan(1.005);
    expect(A.alignment.pathM - A.alignment.chordM).toBeLessThan(2);
  });

  it("the east span is declared NOT DRAWN rather than quietly missing", () => {
    expect(A.eastSpan.year).toBe(2013);
    expect(String(A.eastSpan.what)).toMatch(/NOT DRAWN/);
    expect(String(man.sources["bay-nbi"].not_measured)).toMatch(/IS NOT\s+DRAWN/);
  });

  it("the three new fields each name a source that exists and carries its SHA-256", () => {
    const k = man.kinds.bridge;
    for (const n of ["rn", "tn", "tz"]) {
      expect(k.fields.some((f: { n: string }) => f.n === n), n).toBe(true);
      const src = man.sources[k.provenance[n]];
      expect(src, n).toBeDefined();
      expect(String(src.sha256)).toMatch(/^[0-9a-f]{64}$/);
      expect(String(src.url)).toMatch(/^https:\/\//);
    }
  });

  it("the ring is DERIVED and the manifest says so — this bridge has no published ring", () => {
    // The Golden Gate has a City landmark ring. The Bay Bridge is Caltrans's
    // and is in no City register, so the quad is the published centreline
    // offset by half the published deck width. That has to be stated.
    expect(String(man.sources["bay-align"].not_measured))
      .toMatch(/DECK RING is not published/);
    expect(ch.bridges[1].deckW).toBe(19.1);
  });
});

describe("the cable is a generalisation, not a second bridge's branch", () => {
  /** what `drawSpan` computes now: one parabola per gap between towers */
  const piecewise = (tt: number[], th: number[], dz: number) => (t: number) => {
    const t0 = tt[0], t1 = tt[tt.length - 1];
    if (t <= t0) { const u = (t0 - t) / (t0 || 1e-6); return th[0] - (th[0] - dz) * u * u; }
    if (t >= t1) {
      const e = th.length - 1, u = (t - t1) / (1 - t1 || 1e-6);
      return th[e] - (th[e] - dz) * u * u;
    }
    let i = 0;
    while (i < tt.length - 2 && t > tt[i + 1]) i++;
    const hw = (tt[i + 1] - tt[i]) / 2 || 1e-6;
    const u = (t - (tt[i] + tt[i + 1]) / 2) / hw;
    return Math.max(dz, dz + u * u * ((th[i] + th[i + 1]) / 2 - dz)
                          + u * ((th[i + 1] - th[i]) / 2));
  };
  /** what it computed before, for two towers of equal height */
  const single = (t0: number, t1: number, th: number, dz: number) => (t: number) => {
    if (t >= t0 && t <= t1) {
      const u = (t - (t0 + t1) / 2) / ((t1 - t0) / 2 || 1e-6);
      return dz + (th - dz) * u * u;
    }
    if (t < t0) { const u = (t0 - t) / (t0 || 1e-6); return th - (th - dz) * u * u; }
    const u = (t - t1) / (1 - t1 || 1e-6);
    return th - (th - dz) * u * u;
  };

  it("with the Golden Gate's own two towers the two expressions agree everywhere", () => {
    const dz = GGB.deckZ, th = GGB.towerFt * 0.3048;
    // the shipped towers land at these fractions of the published ring
    for (const [t0, t1] of [[0.09, 0.83], [0.02, 0.98], [0.25, 0.75]]) {
      const a = piecewise([t0, t1], [th, th], dz);
      const b = single(t0, t1, th, dz);
      for (let i = 0; i <= 400; i++) {
        const t = i / 400;
        expect(a(t)).toBeCloseTo(b(t), 9);
      }
    }
  });

  it("with four towers it touches the deck in every gap — including the central anchorage", () => {
    const dz = 56.4, th = [158.5, 158.5, 158.5, 141.1];
    const tt = [0.09, 0.31, 0.55, 0.77];
    const c = piecewise(tt, th, dz);
    for (let i = 0; i < tt.length - 1; i++)
      expect(c((tt[i] + tt[i + 1]) / 2)).toBeCloseTo(dz, 9);
    // and it is AT each tower head, per tower, including the shorter fourth
    for (let i = 0; i < tt.length; i++) expect(c(tt[i])).toBeCloseTo(th[i], 6);
    // NEVER BELOW THE DECK. Unequal heads put the raw parabola's minimum off
    // centre and 0.20 m under the roadway; the clamp is what stops a cable
    // being drawn below the deck it holds up.
    for (let i = 0; i <= 800; i++) expect(c(i / 800)).toBeGreaterThanOrEqual(dz);
    const raw = (t: number) => {
      const hw = (tt[3] - tt[2]) / 2, u = (t - (tt[2] + tt[3]) / 2) / hw;
      return dz + u * u * ((th[2] + th[3]) / 2 - dz) + u * ((th[3] - th[2]) / 2);
    };
    let worst = 0;
    for (let i = 0; i <= 800; i++) {
      const t = tt[2] + (tt[3] - tt[2]) * (i / 800);
      worst = Math.min(worst, raw(t) - dz);
    }
    expect(worst).toBeLessThan(-0.1);
    expect(worst).toBeGreaterThan(-0.3);
  });
});
