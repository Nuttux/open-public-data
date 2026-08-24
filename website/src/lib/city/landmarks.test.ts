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
  const TOP = 88.0, AREA = 11251.5, ZR = 26.0;
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
