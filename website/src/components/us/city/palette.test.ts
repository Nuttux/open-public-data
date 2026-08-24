/**
 * The roof covering timeline's two load-bearing properties, asserted rather
 * than described. `DRAW.md` §38 has the measurements these guard.
 *
 * There is no test file for `palette.ts` before this one, and these two are
 * the properties the whole design rests on: if either breaks, the page draws a
 * different present or a table entry that is not a colour.
 */
import { describe, expect, it } from "vitest";
import {
  ERA_MEASURED,
  PAINT_BUCKETS,
  UROOF_ERA,
  UROOF_BLOCK,
  WA_M0,
  YR_N,
  coveringEra,
  coveringYear,
  frameYearByte,
  roofEraTable,
} from "./palette";

describe("the roof covering timeline", () => {
  it("leaves the PRESENT frame exactly as it was — every use, every build year", () => {
    // §34.4 property 1: at 2025 every covering date falls in the last era,
    // whose material IS the measured colour, so the table is the sentinel
    // throughout and the draw loop falls through to `ri`.
    const tab = roofEraTable(2025);
    expect(tab.length).toBe(UROOF_ERA.length * YR_N * PAINT_BUCKETS);
    for (let k = 0; k < tab.length; k++) expect(tab[k]).toBe(ERA_MEASURED);
    // and an UNDATED footprint, which reads the frame's own year, lands there too
    expect(coveringEra(coveringYear(2025, 2025))).toBe(4);
    expect(frameYearByte(2025)).toBe(2025 - 1849);
  });

  it("resolves every family member to a real material index, not a hole", () => {
    // a family shorter than PAINT_BUCKETS would write WAM(undefined) -> NaN,
    // which a Uint8Array stores as 0 — a silent wrong colour, not an error.
    for (const row of UROOF_ERA) {
      if (!row) continue;
      expect(row.length).toBe(4); // four eras; the fifth is the measurement
      for (const fam of row) {
        expect(fam.length).toBe(PAINT_BUCKETS);
        for (const m of fam) expect(Number.isInteger(m) && m >= 0 && m < 16).toBe(true);
      }
    }
    expect(UROOF_BLOCK.length).toBe(4);
    for (const fam of UROOF_BLOCK) expect(fam.length).toBe(PAINT_BUCKETS);
    // and a mid-century year really does resolve to materials
    const tab = roofEraTable(1950);
    const at = (u: number, built: number, b: number) =>
      tab[((u * YR_N + (built - 1849)) << 2) + b];
    for (let b = 0; b < PAINT_BUCKETS; b++) {
      expect(at(0, 1900, b)).toBeGreaterThanOrEqual(WA_M0);
      expect(at(0, 1900, b)).toBeLessThan(WA_M0 + 16);
    }
    // the null row — `mixed or not stated` — keeps the measured colour
    expect(at(6, 1900, 0)).toBe(ERA_MEASURED);
  });

  it("advances by CALENDAR, not by how many coverings have happened", () => {
    // a 1906 building's third re-covering is a 1981 covering, which is the
    // 1960-89 era — not three steps toward the terminal one. DRAW.md §38.1.
    expect(coveringYear(1906, 1985)).toBe(1981);
    expect(coveringEra(1981)).toBe(3);
    expect(coveringEra(coveringYear(1906, 1985))).toBe(coveringEra(coveringYear(1975, 1985)));
  });
});
