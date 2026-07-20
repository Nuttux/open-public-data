import { describe, expect, it } from "vitest";
import { fmtInt, fmtDec, fmtBillions, fmtMillions, fmtCompactEur, numLocale, fill, cap, sufOrdinal, makeFmtEur } from "./fmt";

// Intl.NumberFormat fr-FR uses U+202F (narrow NBSP) since Node 18+ for the
// thousands separator. Pin the constant so tests are explicit about which
// whitespace they expect.
const NNBSP = " ";

describe("fmtInt", () => {
  it("formats zero", () => {
    expect(fmtInt(0)).toBe("0");
  });
  it("uses fr-FR thousands separator", () => {
    expect(fmtInt(5495)).toBe(`5${NNBSP}495`);
    expect(fmtInt(1_000_000)).toBe(`1${NNBSP}000${NNBSP}000`);
  });
  it("handles negative", () => {
    expect(fmtInt(-1234)).toBe(`-1${NNBSP}234`);
  });
});

describe("fmtDec", () => {
  it("defaults to 2 decimals", () => {
    expect(fmtDec(15.06)).toBe("15,06");
  });
  it("respects custom digit count", () => {
    expect(fmtDec(3.14159, 4)).toBe("3,1416");
    expect(fmtDec(3.14159, 0)).toBe("3");
  });
});

describe("fmtBillions", () => {
  it("converts raw value to billions with 2 decimals", () => {
    expect(fmtBillions(11_722_400_172)).toBe("11,72");
  });
  it("handles negative billions", () => {
    expect(fmtBillions(-2_500_000_000)).toBe("-2,50");
  });
});

describe("fmtMillions", () => {
  it("defaults to 0 decimals", () => {
    expect(fmtMillions(312_000_000)).toBe("312");
  });
  it("rounds correctly at boundary", () => {
    expect(fmtMillions(1_499_999)).toBe("1");
    expect(fmtMillions(1_500_000)).toBe("2");
  });
});

describe("fmtCompactEur — unit thresholds", () => {
  it("under 1k stays in €", () => {
    expect(fmtCompactEur(0)).toEqual({ value: "0", unit: "€" });
    expect(fmtCompactEur(999)).toEqual({ value: "999", unit: "€" });
  });
  it("crosses to k € at 1_000", () => {
    expect(fmtCompactEur(1_000)).toEqual({ value: "1", unit: "k €" });
    expect(fmtCompactEur(999_999)).toEqual({ value: `1${NNBSP}000`, unit: "k €" });
  });
  it("crosses to M € at 1_000_000", () => {
    expect(fmtCompactEur(1_000_000)).toEqual({ value: "1", unit: "M €" });
    expect(fmtCompactEur(999_999_999)).toEqual({ value: `1${NNBSP}000`, unit: "M €" });
  });
  it("crosses to Md € at 1_000_000_000", () => {
    expect(fmtCompactEur(1_000_000_000)).toEqual({ value: "1,00", unit: "Md €" });
    expect(fmtCompactEur(11_722_400_172)).toEqual({ value: "11,72", unit: "Md €" });
  });
  it("uses absolute value for threshold but keeps sign in formatted value", () => {
    // -5M is "5 M €"-magnitude → bucket M €, sign carried by fmtDec.
    expect(fmtCompactEur(-5_000_000)).toEqual({ value: "-5", unit: "M €" });
    expect(fmtCompactEur(-1_000_000_000)).toEqual({ value: "-1,00", unit: "Md €" });
  });
});

describe("numLocale", () => {
  it("maps en → en-GB, everything else → fr-FR", () => {
    expect(numLocale("en")).toBe("en-GB");
    expect(numLocale("fr")).toBe("fr-FR");
  });
});

describe("fill", () => {
  it("replaces every occurrence of each placeholder", () => {
    expect(fill("{n} sur {n} en {year}", { n: 3, year: 2024 })).toBe("3 sur 3 en 2024");
  });
  it("leaves unknown placeholders intact", () => {
    expect(fill("{a} et {b}", { a: "x" })).toBe("x et {b}");
  });
});

describe("cap", () => {
  it("capitalises each sentence start", () => {
    expect(cap("la ville investit. elle construit.")).toBe("La ville investit. Elle construit.");
  });
  it("passes through null/undefined", () => {
    expect(cap(null)).toBeNull();
    expect(cap(undefined)).toBeUndefined();
  });
});

describe("sufOrdinal", () => {
  it("matches the historical inline behaviour in both locales", () => {
    expect(sufOrdinal(1, "fr")).toBe("er");
    expect(sufOrdinal(2, "fr")).toBe("ᵉ");
    expect(sufOrdinal(1, "en")).toBe("st");
    expect(sufOrdinal(2, "en")).toBe("th");
  });
});

describe("makeFmtEur", () => {
  const f = makeFmtEur("fr-FR", { md: "Md €", m: "M €" });
  it("tiers with the historical n >= comparisons and decimals", () => {
    expect(f(11_722_400_172)).toEqual({ v: "11,72", u: "Md €" });
    expect(f(312_400_000)).toEqual({ v: "312,4", u: "M €" });
    expect(f(45_600)).toEqual({ v: "46", u: "k €" });
    expect(f(950)).toEqual({ v: "950", u: "€" });
  });
  it("negative values fall through to the € tier (historical behaviour)", () => {
    expect(f(-2_000_000).u).toBe("€");
  });
});
