/**
 * The art palettes and the material tables, carried across from
 * `scratchpad/sf-city-anim/gen/part3.html` §5580–5880.
 *
 * These are NOT data. They are the renderer's own surfaces — VISUAL-SPEC §5
 * calls them "placeholder San Francisco surfaces: limestone, painted redwood,
 * stucco, brick, terracotta, granite, zinc, copper, tar and gravel, glass" —
 * and no entry here is a claim about what colour any one building is painted.
 *
 * **What is NOT placeholder is WHICH one a building gets.** `UMAT_WALL` and
 * `UMAT_ROOF` are indexed by four published columns and nothing else: the
 * roll's use class, the roll's `year_property_built`, the roll's storey count,
 * and the median LIDAR return over the footprint. That is the mock's own rule
 * and it is transcribed here unchanged.
 *
 * The one measured colour in the file is not in the file: `manifest.buildings
 * .palette`, the 32-entry aerial roof palette, is appended at runtime by
 * `roofPalette()` because it ships with the data and carries its own
 * provenance (`cityData.provenanceOf("bldg", "paintIdx")`).
 */

/* ── the eight-tone legend, part3.html §5581 (LOOK.palette → the B set) ── */
const WALL_B = [
  "#cdbc98", "#d5c9b0", "#c4ab7c", "#cbaf9f",
  "#b9c5aa", "#b2bfcb", "#bda06c", "#cfc1a2",
];
const ROOF_B = [
  "#a4977f", "#918a7d", "#ad7451", "#98907f",
  "#83907a", "#9b9078", "#b47c56", "#8b867b",
];

/* ── the sixteen materials, part3.html §5601 (WA.warm) ────────────────────
   Appended AFTER the eight-tone legend, so `WA_M0 = 8` is where they start
   and `WAM(k) = 8 + k` is the index a material table entry resolves to. */
export const WA_M0 = 8;
const WA_WALL = [
  "#e2d6bb", "#e9e1d0", "#d9c49a", "#ded2b4", "#c1cbb0", "#b0bec8",
  "#dab6a8", "#ac6a52", "#9e7559", "#d29d6e", "#b8b6b0", "#cdc9bf",
  "#7f8182", "#95aaad", "#a7a6a0", "#dabb7a",
];
const WA_ROOF = [
  "#b3a98f", "#6f6b61", "#a8613f", "#7d6a53", "#7d9a8c", "#7f8a94",
  "#5f6167", "#96543a", "#9a9385", "#c9c5b8", "#8d8c86", "#5c584f",
  "#8fa3a6", "#a8977a", "#6f8f80", "#726b5e",
];

/** `WAM` in the mock: a material table entry → a palette index. */
export const WAM = (k: number): number => WA_M0 + k;

/**
 * Where the measured aerial roof palette starts, once the sixteen materials
 * have been appended. `const PAINT_C0 = ROOF_A.length` executes in part3.html
 * AFTER the `WA.warm` push, so it is 24 and not 8 — a detail worth stating,
 * because getting it wrong shifts every measured roof by sixteen entries and
 * the city comes out in the wrong colours without erroring.
 */
export const PAINT_C0 = ROOF_B.length + WA_ROOF.length; // 24

export const wallPalette = (): string[] => [...WALL_B, ...WA_WALL];

/** The roof palette, with the manifest's 32 measured entries appended. */
export const roofPalette = (measured: readonly string[]): string[] => [
  ...ROOF_B,
  ...WA_ROOF,
  ...measured,
];

/* ── the material tables, part3.html §5799 ────────────────────────────────
   [use][yearBand*3 + storeyBand] → wall material
   [use][heightBand*2 + era]      → roof material
   `null` for "mixed or not stated", the honest bucket: 3.8 % of footprints
   join no roll row at all and are NOT given a material they have no claim to.
   Those fall through to the locale legend below. */
export const UMAT_WALL: readonly (readonly number[] | null)[] = [
  /* single family   */ [3, 4, 5, 6, 3, 4, 1, 15, 2, 11, 1, 14, 11, 10, 14],
  /* multi-family    */ [7, 8, 0, 0, 2, 7, 1, 15, 9, 11, 10, 14, 10, 13, 11],
  /* retail          */ [8, 7, 0, 2, 0, 10, 10, 11, 14, 14, 11, 12, 12, 13, 10],
  /* office          */ [0, 2, 10, 0, 10, 11, 10, 11, 12, 12, 14, 13, 13, 12, 10],
  /* industrial      */ [8, 14, 7, 8, 14, 10, 14, 11, 10, 14, 10, 11, 14, 11, 10],
  /* hotel / instit. */ [0, 7, 2, 0, 2, 10, 1, 0, 11, 11, 10, 12, 10, 13, 12],
  /* mixed / unknown */ null,
];
export const UMAT_ROOF: readonly (readonly number[] | null)[] = [
  /* single family   */ [3, 15, 3, 8, 13, 8, 1, 11],
  /* multi-family    */ [2, 8, 2, 1, 1, 11, 1, 6],
  /* retail          */ [0, 9, 13, 8, 1, 10, 1, 6],
  /* office          */ [13, 10, 1, 10, 6, 5, 6, 12],
  /* industrial      */ [10, 10, 10, 1, 1, 11, 1, 11],
  /* hotel / instit. */ [2, 4, 2, 4, 6, 5, 6, 5],
  /* mixed / unknown */ null,
];

/**
 * The locale legend — the fallback for the 3.8 % of footprints that join no
 * roll row. `r` is the distance from downtown as a fraction of the furthest
 * footprint; `fr` is which side of the Ferry→Castro line the building sits on.
 * The bias by locale is what gives the wide shot a colour range instead of
 * one beige.
 */
export function legendTones(
  r: number,
  fr: number,
  u: number,
): { wall: number; roof: number } {
  const pick = (a: readonly number[], t: number): number =>
    a[Math.min(a.length - 1, Math.floor(t * a.length))];
  if (r < 0.14) return { wall: pick([1, 5, 7, 5], u), roof: pick([1, 7, 3, 1], ((u * 97) % 1)) };
  if (fr === 1 && r > 0.34)
    return { wall: pick([0, 1, 4, 5, 7], u), roof: pick([0, 3, 5, 7], ((u * 61) % 1)) };
  if (fr === 0)
    return { wall: pick([0, 2, 3, 6, 7], u), roof: pick([0, 2, 5, 6], ((u * 137) % 1)) };
  return { wall: pick([2, 3, 6, 0], u), roof: pick([2, 6, 0, 3, 5], ((u * 29) % 1)) };
}

/* ── the roll's own bit layout on `u` ─────────────────────────────────────
   `bldg.u` packs the use class in the low three bits and the roll's
   FLAG_NOYEAR in bit 4. 2,825 footprints carry a fabricated 1906 precisely so
   they can be drawn at all (bldg/build_bldg.py says so in the file), and
   colouring one of those by its year would paint a date the record does not
   hold. Those take the height band instead, and they are counted so the page
   can say how many. */
export const USE_MASK = 7;
export const FLAG_NOYEAR = 16;

/** the roll's year bands: 1906 / 1925 / 1950 / 1980 */
export function yearBand(y: number): number {
  return y < 1907 ? 0 : y < 1925 ? 1 : y < 1950 ? 2 : y < 1980 ? 3 : 4;
}
/** the assessor's own storey cross-check: ~2, ~4, ~7 storeys */
export function storeyBand(st: number): number {
  return st >= 6 ? 2 : st >= 3 ? 1 : 0;
}
/** the LIDAR height bands, 9 / 15 / 25 m */
export function heightBand(h: number): number {
  return h < 9 ? 0 : h < 15 ? 1 : h < 25 ? 2 : 3;
}
