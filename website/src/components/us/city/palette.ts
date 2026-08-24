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

/* The palettes themselves, for the same instrument `buildings.ts` §READ THE
 * VALUE OUT OF BOTH BUILDS exports `colourLUT` for: a table can only differ
 * through its inputs once its source matches, and these are the inputs.
 * Dev only. */
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityPAL?: unknown }).__cityPAL = {
    wallPalette,
    roofPalette,
    PAINT_C0,
    WA_M0,
    UMAT_WALL,
    UMAT_ROOF,
    legendTones,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   THE ROOF COVERING TIMELINE — the measured colour is the PRESENT, not the
   century.
   ════════════════════════════════════════════════════════════════════════

   `paintIdx` is the median colour of the published aerial pixels inside each
   footprint, **retrieved 2026-08-23** (`encode_city_chunks.py` `_bldg_prov`,
   which says so in the field's own `not_measured`: *"the roof from above
   TODAY … not the colour the building was in any past year"*). It reaches
   166,042 of 166,166 roofs and it overwrites every other roof rule in
   `decodeBld`. So before this table, **every building in every year wore its
   2026 roof** — a white single-ply membrane, a 1990s material, painted onto
   1906.

   MEASURED, `.parity/g1pal.py` over `paint/paint-data.js`, all 166,166:

   ```
     the 32 entries are used almost evenly — entropy 4.86 bits of 5,
     perplexity 29.0 of 32, the top five entries take 26.6 %
     ⇒ 32 IS NOT A COLLAPSE. The variety the quantiser could carry, it carries.

     mean chroma (max−min channel) of the 32 entries      14.6
     max chroma                                           43   (#ab9880)
     26 of 32 entries have chroma <= 16
     luminance runs 51.4 → 252.6, the WHOLE range
   ```

   **The palette is a luminance ramp with no hue in it.** That is not a defect
   in the sampler and not a defect in the quantiser: nadir imagery of San
   Francisco really is grey and white. The value variation Daniel is missing is
   already there and already full-range; **the hue variation is absent because
   the thing measured has none.** Which is why no amount of work on `paintIdx`
   could have fixed his complaint, and why the fix has to come from somewhere
   other than the photograph.

   ── THE RULE, DECLARED ────────────────────────────────────────────────────

   The measured colour is the TERMINAL state of a covering timeline, and
   earlier years are derived from **era and use class only**. Nothing here is
   per-building data and nothing here is randomised: it is one global table,
   read the same way by every building in the city, and the two columns it is
   read on — `use_definition` in seven classes and `year_property_built` — are
   the roll's own and are already on the wire.

   **The covering date.** A roof is not the age of its building; it is the age
   of its last re-covering. On a declared cycle of `REROOF_YEARS` from the
   build year:

   ```
     cover(b, Y) = b + REROOF_YEARS * floor((Y - b) / REROOF_YEARS)
   ```

   so `cover ∈ (Y - REROOF_YEARS, Y]` for every standing building, and TWO
   things follow that are the whole reason the rule has this shape:

   1. **At the present the picture is unchanged.** Every covering date at
      Y = 2025 falls in (2000, 2025], which is the last era, whose material IS
      the measured colour. The frame at the present year is the frame that
      ships today, building for building.
   2. **The change is staggered by the city's own build years, not by a
      random.** MEASURED over the 157,184 footprints this rule applies to: the
      worst single display-year re-covering cohort is **9,335 buildings,
      5.94 %** — and only the fraction of those that cross a material boundary
      changes colour at all. There is no frame on which San Francisco re-roofs
      itself at once, which is the failure mode BUGS §24 records for the trees.

   `REROOF_YEARS = 25` is DECLARED. It is inside the service life of every
   covering in the table below — asphalt shingle, built-up bitumen and
   single-ply membrane are all roughly 20–30 year products — and it is short
   enough that (Y − 25) is past the last era boundary at the present, which is
   what makes property 1 hold.

   ── THE MATERIALS ─────────────────────────────────────────────────────────

   Five eras, and each is a claim about San Francisco stated here rather than
   hidden in a constant. **DECLARED, not measured** — no published column
   records the covering material of a San Francisco building, which is why
   `sf_building_character.md`'s own audit puts SF Survey `Roof Form(s)` at
   0.35 % and OSM `roof:shape` at 0.19 % and rejects both:

   · **→1906 · redwood shingle.** The pre-fire city is a wood city: wood frame,
     wood siding, wood shingle roofs, which is the reason the fire behaved the
     way it did.
   · **1907–1929 · the rebuild.** Non-combustible covering becomes the norm as
     the city rebuilds — gravel-surfaced built-up roofing on the flat stock,
     and clay tile on the Mediterranean-revival institutions and hotels of the
     1920s. 52.6 % of the standing hotel/institutional stock dates from this
     band, which is why the terracotta lands where it does.
   · **1930–1959 · built-up bitumen with a mineral cap.** Darker and cooler
     than the gravel that preceded it.
   · **1960–1989 · smooth asphalt.** The darkest the city gets.
   · **1990→ · the cool-roof era, and it is MEASURED.** White and pale single-
     ply membrane; California's Title 24 cool-roof provisions make it a
     requirement rather than a preference in the 2000s. This era's "material"
     is not a table entry at all — it is `PAINT_C0 + paintIdx`, the roof the
     photograph actually shows.

   ── THE REFUSALS ──────────────────────────────────────────────────────────

   · **`mixed or not stated` (8,365 footprints, 5.03 %) gets no era.** The row
     is `null`, exactly as `UMAT_ROOF`'s is, and those buildings keep the
     measured colour in every year. Reading a material off a use class the
     roll does not state is inventing the class.
   · **`FLAG_NOYEAR` (2,916) gets no era**, for the same reason `faVocab` and
     the ochre tint refuse it: the roll dates those parcels to its own "not
     known" and `yr` holds a placeholder 1906. A covering date derived from a
     placeholder is a date the record does not hold.

   Together that is **8,982 buildings that keep exactly today's look**, and it
   is the same refusal the rest of this file already makes.                */

/** the covering-timeline era boundaries — see the note above */
export const ROOF_ERA_YEARS: readonly number[] = [1907, 1930, 1960, 1990];

/** the declared re-covering cycle, years */
export const REROOF_YEARS = 25;

/** the sentinel in `roofEraTable`: this (use, year) takes the MEASURED colour */
export const ERA_MEASURED = 255;

/**
 * `[use][era] -> WA_ROOF material index`, with the last era carrying
 * `ERA_MEASURED`. `null` is the honest bucket — no era claim at all.
 * Rows are `manifest.buildings.useNames`, in order.
 */
export const UROOF_ERA: readonly (readonly number[] | null)[] = [
  /* single family         */ [3, 13, 15, 11, ERA_MEASURED],
  /* multi-family          */ [3, 1, 15, 11, ERA_MEASURED],
  /* retail                */ [15, 1, 1, 11, ERA_MEASURED],
  /* office                */ [5, 6, 1, 6, ERA_MEASURED],
  /* industrial            */ [10, 10, 10, 6, ERA_MEASURED],
  /* hotel / institutional */ [5, 2, 1, 6, ERA_MEASURED],
  /* mixed or not stated   */ null,
];

/** the covering year: the last re-covering on the declared cycle, at or before `y` */
export function coveringYear(built: number, y: number): number {
  if (!(y > built)) return built;
  return built + REROOF_YEARS * Math.floor((y - built) / REROOF_YEARS);
}

/** which era a covering laid in year `c` belongs to */
export function coveringEra(c: number): number {
  let e = 0;
  while (e < ROOF_ERA_YEARS.length && c >= ROOF_ERA_YEARS[e]) e++;
  return e;
}

/** `yearBand`'s own byte layout: `bldg.yr` is `year - 1849`, one byte */
export const YR0 = 1849;
export const YR_N = 256;

/**
 * THE WHOLE RULE, RESOLVED ONCE PER DISPLAYED YEAR, AS A 7 x 256 BYTE TABLE.
 *
 * The draw loop reads one array element per building — `tab[use * 256 + yrByte]`
 * — and takes the building's own `ri` when it reads `ERA_MEASURED`. So a rule
 * that is a function of four things costs one indexed load per footprint, and
 * the table itself is 1,792 bytes rebuilt only when the year on the rail
 * changes. Nothing is added to the colour LUT: every material here is already
 * a `WA_ROOF` entry, so `roofF`/`roofNF` index it unchanged and the haze, the
 * ochre and the four `RSHADE` steps all still apply.
 */
export function roofEraTable(y: number): Uint8Array {
  const out = new Uint8Array(UROOF_ERA.length * YR_N);
  for (let u = 0; u < UROOF_ERA.length; u++) {
    const row = UROOF_ERA[u];
    const o = u * YR_N;
    if (!row) {
      out.fill(ERA_MEASURED, o, o + YR_N);
      continue;
    }
    for (let k = 0; k < YR_N; k++) {
      const built = YR0 + k;
      const m = row[coveringEra(coveringYear(built, y))] ?? ERA_MEASURED;
      out[o + k] = m === ERA_MEASURED ? ERA_MEASURED : WAM(m);
    }
  }
  return out;
}

/**
 * WHO IS PITCHED — the population, declared here beside the material timeline
 * it shares its two columns with.
 *
 * `roofs.ts` §THE PRE-FIRE CITY IS PITCHED has the measurement and the tower
 * control that keeps this a POPULATION rule rather than a per-building test.
 * The population is the pre-1907 wood-frame dwelling: **single family and
 * multi-family only**, dated by the roll to before the fire ordinance.
 *
 * What is deliberately NOT in it, and why:
 *
 * · **retail, office, industrial and hotel/institutional**, in every era. The
 *   downtown and South of Market stock is masonry with a parapet from the
 *   start; the measured table in `roofs.ts` is a single-family measurement and
 *   is not evidence about them.
 * · **everything from 1907 on**, which is the flat end of that same table —
 *   4 to 6 cm of modal offset, one plane with noise on it.
 * · **`mixed or not stated` and `FLAG_NOYEAR`**, refused here for the same
 *   reason the covering timeline refuses them: no class, or a placeholder date.
 *
 * MEASURED SIZE: 15,854 footprints are dated before 1907 and **14,555 of
 * those are single or multi family — 8.76 % of the city today**, against 84 %
 * of everything standing in the 1906 frame.
 */
export const PITCH_ERA_MAX = 1907;

export function isPitched(use: number, built: number, noYear: boolean): boolean {
  if (noYear) return false;
  if (use !== 0 && use !== 1) return false;
  return built < PITCH_ERA_MAX;
}
