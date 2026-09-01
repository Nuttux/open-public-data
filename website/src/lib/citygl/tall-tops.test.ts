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
  why?: string;
}
interface Doc {
  rule: { gap_min_m: number; area_band: [number, number] };
  measured: { register_rows: number; agree_within_gap_min: number; taken: number; refused: number };
  tops: { gid: number; topM: number }[];
  taken: Row[];
  refused: Row[];
}
const doc = JSON.parse(readFileSync(
  "public/data/us/sf/city/base/tall-tops.json", "utf8")) as Doc;

describe("the towers the 2023 scan did not see", () => {
  it("touches 7 of the register's 180 rows, and leaves 164 alone", () => {
    /* THE POINT OF THE FILE IS HOW LITTLE IT DOES. The scan is right about
       seven eighths of the towers in this city; if this ever starts rewriting
       a large share of them, the disagreement is with the scan and not with
       sixteen footprints, and that is a different finding needing a different
       file. */
    expect(doc.measured.register_rows).toBe(180);
    expect(doc.measured.agree_within_gap_min).toBe(164);
    expect(doc.measured.taken).toBe(7);
    expect(doc.measured.refused).toBe(9);
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

  it("every refusal says why, and the reasons are the three the gate has", () => {
    for (const r of doc.refused) {
      expect(r.why, r.name).toBeTruthy();
      expect(r.why, r.name).toMatch(/fragment|podium|no plan size|no footprint/);
    }
    /* the two everyone would ask about are refused, and refused for a reason
       that is about the FOOTPRINT rather than about the tower: 181 Fremont's
       is 30 % of its own tower plan and 340 Fremont's is 241 % of it */
    const by = new Map(doc.refused.map((r) => [r.name, r]));
    expect(by.get("181 Fremont")?.why).toMatch(/fragment/);
    expect(by.get("340 Fremont Street")?.why).toMatch(/podium/);
  });

  it("names the seven it does raise", () => {
    expect(doc.taken.map((r) => r.name).sort()).toEqual([
      "33 Tehama Street",
      "500 Folsom",
      "LUMINA I",
      "LUMINA II",
      "One Rincon Hill South",
      "Salesforce Tower",
      "Solaire (Transbay Block 6)",
    ]);
    /* and the tallest building in San Francisco is one of them */
    const sf = doc.taken.find((r) => r.name === "Salesforce Tower")!;
    expect(sf.drawnM).toBe(108);
    expect(sf.topM).toBeCloseTo(326.1, 1);
  });
});
