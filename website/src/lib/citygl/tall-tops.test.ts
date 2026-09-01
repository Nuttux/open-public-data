import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE SHIPPED SURVEYED TOPS, AND THE GATE THAT LET THEM IN.
 *
 * `build_tall_tops.py` overrides a MEASUREMENT — the median laser return over
 * a footprint — with another measurement, the Tall Building Inventory's
 * surveyed height. That is a strong thing to do and it is only defensible
 * while the gate holds, so the gate is asserted here rather than trusted.
 */
interface Row {
  gid: number; name: string; topM: number; drawnM: number;
  gapM: number; areaM2: number; planM2: number | null; frac: number | null;
  coverage?: number; polyM2?: number; why?: string;
}
interface Doc {
  rule: { gap_min_m: number; area_band: [number, number] };
  clad: { counts: Record<string, number>; rows: { gid: number; clad: string }[];
          audit: { gid: number; clad: string; raw: string; name: string }[] };
  measured: { register_rows: number; agree_within_gap_min: number; taken: number; refused: number };
  tops: { gid: number; topM: number }[];
  taken: Row[];
  refused: Row[];
}
const doc = JSON.parse(readFileSync(
  "public/data/us/sf/city/base/tall-tops.json", "utf8")) as Doc;

describe("the towers the 2023 scan did not see", () => {
  it("touches 7 of the register's 180 rows, and leaves 156 alone", () => {
    /* THE POINT OF THE FILE IS HOW LITTLE IT DOES. The scan is right about
       seven eighths of the towers in this city; if this ever starts rewriting
       a large share of them, the disagreement is with the scan and not with
       sixteen footprints, and that is a different finding needing a different
       file. */
    expect(doc.measured.register_rows).toBe(180);
    expect(doc.measured.agree_within_gap_min).toBe(156);
    expect(doc.measured.taken).toBe(7);
    expect(doc.measured.refused).toBe(17);
    expect(doc.tops.length).toBe(doc.taken.length);
  });

  it("only ever raises a building, never lowers one", () => {
    for (const r of doc.taken) {
      expect(r.topM, r.name).toBeGreaterThan(r.drawnM);
      expect(r.gapM, r.name).toBeGreaterThan(doc.rule.gap_min_m);
    }
  });

  it("every taken row's footprint could BE that tower's plan", () => {
    const [lo, hi] = doc.rule.area_band;
    for (const r of doc.taken) {
      expect(r.frac, r.name).not.toBeNull();
      expect(r.frac!, r.name).toBeGreaterThanOrEqual(lo);
      expect(r.frac!, r.name).toBeLessThanOrEqual(hi);
    }
  });

  it("every refusal says why, and names the towers that are simply not there", () => {
    for (const r of doc.refused) {
      expect(r.why, r.name).toBeTruthy();
      expect(r.why, r.name).toMatch(/fragment|podium|no plan size|no shipped footprint|too little/);
    }
    /* SEVEN TOWERS IN THIS REGISTER HAVE NO FOOTPRINT IN THE SHIPPED DATA.
       Not a bad join and not a near miss: their register polygons are sampled
       at 2 m and every sample is over open ground. Salesforce Tower's polygon
       is 3,268 m2 and 100 % of it is uncovered. Seven of them. This is asserted by NAME
       because it is the map's own honest limit and a reader who asks "where
       is Salesforce Tower" deserves an answer that is not silence. */
    const gone = doc.refused
      .filter((r) => r.coverage === 0)
      .map((r) => r.name).sort();
    expect(gone).toEqual([
      "33 8th at Trinity Place Apartments",
      "33 Tehama Street",
      "450 Folsom [Transbay Block 8]",
      "500 Folsom",
      "706 Mission Street",
      "Oceanwide Center II",
      "Salesforce Tower",
    ]);
  });

  it("names the seven it does raise, and every one of them really is there", () => {
    expect(doc.taken.map((r) => r.name).sort()).toEqual([
      "1500 Mission - Residential",
      "181 Fremont",
      "Infinity (B) North",
      "LUMINA I",
      "LUMINA II",
      "Solaire (Transbay Block 6)",
      "Steuart Tower",
    ]);
    /* THE JOIN THAT PRODUCED THIS HAS NO FALLBACK, and that is what the
       coverage column is for. The version before it took the nearest
       footprint within 80 m when nothing contained the register's centroid,
       and four of its seven rows came out on a different building — Salesforce
       Tower's 326 m landed on a 103 m tower 70 m away. A join that cannot fail
       is not a join. */
    for (const r of doc.taken) {
      expect(r.coverage, r.name).toBeGreaterThanOrEqual(0.30);
    }
    const tall = doc.taken.find((r) => r.name === "181 Fremont")!;
    expect(tall.drawnM).toBe(5);
    expect(tall.topM).toBeCloseTo(227.4, 1);
  });
});

describe("what the register says these towers are clad in", () => {
  it("collapses 41 free-text spellings into five families, over 171 towers", () => {
    /* `facade_material` is filled on all 180 rows and a person typed each one,
       so the raw field has 41 distinct spellings — 'concrete panel',
       'concrete panels', 'precast concrete panels', 'garnite panel'. The
       families are what the drawing acts on and the raw string is kept beside
       every row so a reader can check the collapse rather than trust it. */
    expect(doc.clad.counts).toEqual({
      concrete: 82, glass: 42, mixed: 24, stone: 18, terracotta: 5,
    });
    expect(doc.clad.rows.length).toBe(171);
    expect(doc.clad.audit.length).toBe(171);
  });

  it("puts glass named BESIDE a solid in `mixed`, not in `glass`", () => {
    /* the distinction the register took the trouble to make: a wall it calls
       concrete AND glass is a frame with lights in it, and drawing that as a
       curtain would say the whole face is glazed. */
    const by = new Map(doc.clad.audit.map((r) => [r.name, r]));
    const mixed = doc.clad.audit.filter((r) => r.clad === "mixed");
    for (const r of mixed) {
      expect(r.raw.toLowerCase(), r.name).toMatch(/glass|glazing|alumini?um/);
      expect(r.raw.toLowerCase(), r.name).toMatch(/concrete|precast|gfrc|panel|brick/);
    }
    /* and every `glass` row names no solid at all */
    for (const r of doc.clad.audit.filter((x) => x.clad === "glass")) {
      expect(r.raw.toLowerCase(), r.name).not.toMatch(/concrete|precast|gfrc|brick/);
    }
    expect(by.get("Salesforce Tower")).toBeUndefined();
  });

  it("names the five terra cotta towers, because they are the ones a reader knows", () => {
    const terra = doc.clad.audit
      .filter((r) => r.clad === "terracotta").map((r) => r.name).sort();
    expect(terra).toEqual([
      "555 Market [Market Center]",
      "Hobart Building",
      "Humboldt Bank Building",
      "PG&E Headquarters",
      "Ritz-Carlton Club and Residences",
    ]);
  });
});
