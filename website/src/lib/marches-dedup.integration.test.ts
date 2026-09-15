import { describe, expect, it } from "vitest";
import { loadMarchesPageData, marchesDomainesOfYear, marchesYearTotal } from "./fusion-data";

describe("2024, the year published by both sources", () => {
  it("counts a contract published twice once, and every reader quotes the same total", () => {
    const d = loadMarchesPageData(2024);
    expect(d.dedup.dropped).toBeGreaterThanOrEqual(10);
    expect(d.dedup.amount).toBeGreaterThan(400e6);
    expect(d.total).toBeLessThan(2.9e9);
    expect(Math.round(marchesYearTotal("paris", 2024))).toBe(Math.round(d.total));
    expect(d.yearsSummary.find((y) => y.year === 2024)?.total).toBeCloseTo(d.total, -3);
  });
  it("keeps single-source years untouched", () => {
    const d = loadMarchesPageData(2025);
    expect(d.dedup.dropped).toBe(0);
  });
});

describe("the domain axis", () => {
  it("sums to the page's number and reads the same in 2013 and 2025", () => {
    for (const year of [2013, 2020, 2024, 2025]) {
      const d = loadMarchesPageData(year);
      const sum = d.byDomaine.reduce((a, x) => a + x.amount, 0);
      expect(sum).toBeCloseTo(d.total, -3);
      const autres = d.byDomaine.find((x) => x.slug === "autres")?.amount ?? 0;
      expect(autres / d.total).toBeLessThan(0.05);
      expect(marchesDomainesOfYear("paris", year).map((x) => x.slug)).toEqual(d.byDomaine.map((x) => x.slug));
    }
  });
});
