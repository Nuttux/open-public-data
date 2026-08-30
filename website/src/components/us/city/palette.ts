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
/* ── AUTHORED 2026-08-28, REPLACING THE MOCK'S PLACEHOLDER ────────────────
   THE STATUS OF THESE VALUES HAS NOT CHANGED and the header above still
   holds: they are NOT data, and no entry is a claim about what colour any one
   building is painted. What changed is that they are now CHOSEN rather than
   inherited. The set they replace came across from the `part3.html` mock,
   which called them "placeholder San Francisco surfaces", and nobody had ever
   looked at them as a picture.

   Daniel, on the shipped set: *"buildings look like colored cardboard boxes
   not like real buildings"*. Measured against that complaint, the old set was
   sixteen desaturated warm neutrals inside a span of about twenty points of
   chroma — creams, tans and taupes with one terracotta. A city built out of
   it can only read as grey, whatever the light does.

   The direction is San Francisco's own residential colour, which is the one
   thing about this city's houses everybody already knows: ochre, rose, sage,
   bay blue, mustard, brick and redwood, over masonry that stays honest. Three
   directions were rendered at the same camera and Daniel picked this one.
   Kept from the old set: the MATERIAL each slot means, in the header's own
   order, so `UMAT_WALL`'s published rule maps to the same material it always
   did and only the pigment moved.

   The ROOF palettes below are deliberately untouched. `WA_ROOF` is a fallback,
   and the roof a reader actually sees is `manifest.buildings.palette` — the
   32-entry palette MEASURED off aerial imagery, which carries its own
   provenance and is not ours to art-direct. */
const WALL_B = [
  "#ddc9a0", "#e6dcc4", "#d4b378", "#dcb4a4",
  "#b6c9a4", "#a8bfd0", "#c9a35e", "#e0d4b4",
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
  "#f0e4c8", "#f7f1e2", "#e8c894", "#e3d5a8", "#a8c49a", "#8fb3c9",
  "#e6a8a0", "#a85a42", "#8a5f42", "#dc9251", "#bdbab2", "#d6d2c6",
  "#6e7276", "#7fa3ad", "#a5a49c", "#deb865",
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

/* ════════════════════════════════════════════════════════════════════════
   THE PHOTOGRAPH AND THE PALETTE ARE TWO SCALES, AND THE PICTURE IS DRAWN ON
   ONE OF THEM — §39
   ════════════════════════════════════════════════════════════════════════

   Daniel, on North Beach in two years: *"1989 is a dark charcoal-and-grey
   roofscape, varied and frankly the better picture. 2015 is near-white across
   almost the whole frame — brighter than any real roof."*

   THE HYPOTHESIS THAT WAS REFUTED FIRST, because it is the one that would have
   been easiest to believe: that the render lights the photograph a second time.
   MEASURED (`.parity/g1lit.py`, production build, camera asserted, the median
   of a 5 x 5 patch at each roof's own projected centroid, against the palette
   entry that roof was assigned):

   ```
     block zoom, 2025, 9,396 measured roofs   screen − palette   p50  +3.7
     North Beach block, 2015, 4,439 roofs     screen − palette   p50 −14.9
     North Beach street, 2015,   679 roofs    screen − palette   p50  −7.0
   ```

   **The screen is not brighter than the sampled value; it is slightly darker.**
   Nothing in the render path is adding light. The roof's top face is filled at
   the palette value and the only multipliers on it are haze, `COVER_GAIN`
   (0.8/0.9/1.0 — a darkening), and `RSHADE` (0.875-1.14, centred on 1).

   THE SECOND HYPOTHESIS, ALSO REFUTED: that the 1.5 m erosion is catching
   sunlit parapet copings and kerb. `.parity/g1erode.py` re-samples the same
   footprints off the same cached tiles at 1.5 / 3.0 / 4.5 / 6.0 m:

   ```
     erode m     1.5    3.0    4.5    6.0
     mean lum  167.6  169.0  169.8  169.5      +1.9 at four times the erosion
   ```

   **Deeper erosion makes the sample BRIGHTER, not darker.** The edges are the
   dark part — kerb and self-shadow — so the sampler is right and 1.5 m is
   enough.

   THE THIRD, PARTLY TRUE: the imagery is clipped at the top. 120 random tiles,
   7.86 M pixels — the luminance histogram RISES into the ceiling (0.15 % at
   246, 0.94 % at 254), which is saturation, and 5.6 % of footprint medians sit
   at 250 or above. Those roofs are not measured "white"; they are "at least
   this bright". It is real and it is a minority.

   WHAT IT ACTUALLY IS. The published palette and the reference's own declared
   materials are **two descriptions of the same 166,166 roofs**, and they do
   not sit on the same scale:

   ```
     the reference's own roof rule, UMAT_ROOF[use][band*2+era],
       area-weighted over the 157,184 footprints it covers      120.79
     the photograph, over the same 157,184                      170.83
                                                        ratio    1.414
   ```

   A roof photographed from directly overhead is a surface **under full
   sunlight**; `WA_ROOF` is a table of pigment values. Everything else in this
   frame — the terrain, the walls, the streets, the trees, the massing solid —
   is drawn from the declared scale. The photograph was the only input arriving
   on the other one, and at Daniel's own camera that is exactly the step he is
   looking at: **the same 4,439 roofs are drawn at screen 127.0 in 1989 and
   153.9 in 2015.**

   So the photograph is divided onto the picture's own scale by ONE declared
   factor. **The factor is MEASURED — it is the ratio above — and what is
   DECLARED is the decision to move the photograph onto the renderer's scale
   rather than the reverse**, which follows from every other surface already
   being on it. Nothing is tuned by eye and nothing is per-building: it is one
   multiplication, applied to all 32 entries, hue preserved because all three
   channels take the same factor.

   What it is NOT: it is not a claim that the roofs of San Francisco are darker
   than the photograph shows. The photograph is right about the roofs. This is
   a change of units, and the relative ORDER of all 166,166 roofs — which is
   the information the measurement actually carries — is untouched.

   One consequence worth naming: after it, the brightest entry is 179 instead
   of 253, so `roofFineLUT`'s gamut headroom no longer clips the top of the
   ramp (BUGS §4), and the four published `RSHADE` steps are visible on the
   pale roofs for the first time.                                          */

/**
 * The photograph → picture scale. MEASURED: 120.79 / 170.83, the area-weighted
 * mean luminance of the reference's own declared roof rule over the same
 * footprints, divided by the photograph's. `.parity/g1fab.py`.
 */
export const PAINT_TO_PICTURE = 0.7071;

/** apply a single factor to a hex, all three channels, so the hue is kept */
function scaleHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** The roof palette, with the manifest's 32 measured entries appended — on the
 *  picture's scale. See §39 above. */
export const roofPalette = (measured: readonly string[]): string[] => [
  ...ROOF_B,
  ...WA_ROOF,
  ...measured.map((h) => scaleHex(h, PAINT_TO_PICTURE)),
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
/**
 * `bldg-data.js` `meta.yearFlags`, bit 3, **20,571 footprints**: the year is
 * the 25th-percentile year of the OTHER parcels on this building's own
 * published assessor block. A real year, but not this building's.
 *
 * DATA-TRUTH.md §5b flagged it as reaching the browser unread, and it was —
 * those 20,571 arrived indistinguishably from the 142,679 dated by their own
 * parcel, and one of them is 174 m on a block whose lower quartile is 1906.
 * `layers/buildings.ts` §THE BORROWED YEAR MAY NOT OUTRUN THE REGISTER is
 * what reads it now.
 */
export const FLAG_BLOCKYEAR = 8;
/**
 * `bldg-data.js` `meta.heightFlags`, bit 6, **541 footprints**: the roll dates
 * this building AFTER the 2010 LiDAR flight, so `h` is whatever stood on the
 * lot when the plane went over — not necessarily this building, and not
 * necessarily a building. Anything that reads a MEASUREMENT off the height
 * rather than just drawing it has to refuse these: `facades.ts` `derivedBands`
 * is the first to, and DRAW.md §35.4 is where the flight date was recorded.
 */
export const FLAG_HEIGHT_STALE = 64;

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
      worst single display-year re-covering cohort is **9,088 buildings,
      5.78 %** at `REROOF_YEARS = 30` (9,335 and 5.94 % at 25) — and only the fraction of those that cross a material boundary
      changes colour at all. There is no frame on which San Francisco re-roofs
      itself at once, which is the failure mode BUGS §24 records for the trees.

   `REROOF_YEARS` is DECLARED, and it shipped at 25 here; §38.8 moved it to 30
   and says why. Either way it is inside the service life of every covering in
   the table below — asphalt shingle, built-up bitumen and single-ply membrane
   are all roughly 20–30 year products — and short enough that
   (Y − REROOF_YEARS) is past the last era boundary at the present, which is
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

/**
 * The declared re-covering cycle, years. **30, not 25**, and §38.8 has the
 * measurement: the cycle is also the width of the window every standing
 * building's covering date sits in, so it is the single number that controls
 * how many eras the city wears at once AND how fast the fabric converts to the
 * measured present. At 25 the whole city had converted by 2014; at 30 it
 * converts by 2020, which spreads the thing Daniel actually described — *"at
 * some point in time more and more of them become white"* — over the decades
 * California's cool-roof provisions actually landed in, and lifts the 1985
 * fabric from 29.5 to 34.4 effective colours as a side effect.
 *
 * It stays inside the service life of every covering in the table below —
 * asphalt shingle, built-up bitumen and single-ply membrane are all roughly
 * 20-30 year products, and a real re-covering interval is a service life plus
 * whatever deferral the owner can stand. It is also short enough that
 * `Y − REROOF_YEARS` is past the last era boundary at the present, which is
 * what keeps the 2025 frame identical.
 */
export const REROOF_YEARS = 30;

/** the sentinel in `roofEraTable`: this (use, year) takes the MEASURED colour */
export const ERA_MEASURED = 255;

/* ════════════════════════════════════════════════════════════════════════
   §38's CORRECTION — AN ERA IS A FAMILY, NOT A COLOUR, AND THE PHOTOGRAPH
   SAYS WHICH MEMBER
   ════════════════════════════════════════════════════════════════════════

   The first version of this table was `[use][era] -> one material`, and
   `DRAW.md` §38 has what that measured. Area-weighted over the standing stock,
   in effective colours (material x the published height-quartile shade step):

   ```
     the measured present                       113.7
     the mock's OWN roof rule, which this
       table replaced — UMAT_ROOF[use][band*2+era]  30.7
     this table, at 1985                          11.4   <- 
   ```

   **It was a quarter of the variety of the rule it generalised**, because it
   generalised the era dimension from two to five and DELETED the height-band
   dimension that rule carries — and the arithmetic then guarantees the
   collapse: `cover ∈ (Y − REROOF, Y]` for every standing building, so the
   whole city's coverings always fall inside ONE 25-year window, and a 25-year
   window can overlap at most two of the four era bands. Every roof in San
   Francisco was the same age to within twenty-five years, in every frame.
   The mean roof luminance ran **155 → 98 → 169** across the century: a city
   that darkens for eighty years to a value darker than any part of the
   measured present, then climbs 71 levels in twenty-five. Daniel, watching the
   second half of that: *"the roof is ok but then at some point in time more
   and more of them become white."*

   So each (use, era) cell is now a FAMILY of four materials, ordered dark to
   light, and **which member a roof takes is read off the roof's own measured
   brightness** — `paintIdx >> 3`, the building's position in the 32-entry
   aerial palette, which `manifest.buildings.palette` documents as ordered dark
   to light and which is a MEASUREMENT of that roof.

   What that claims and what it does not:

   · It does NOT claim the roof was that colour in 1915. The material is the
     era's, declared, exactly as before.
   · It DOES carry the one per-building fact about roof value that exists —
     that this roof is darker than its neighbour — across the whole timeline
     instead of only into the present. A big pale shed stays the pale member of
     whatever its era's fabric is; a dark house stays the dark one.
   · It costs **no new byte**: `paintIdx` is already on the `bldg` tier and
     already decoded, and the table stays a per-year rebuild of 7 x 256 x 4 =
     7,168 bytes read with one indexed load per footprint.

   MEASURED, the same instrument (`.parity/g1fam2.py`), effective colours and
   the mean the frame carries:

   ```
        Y     before   after      meanLum before -> after
     1915       50.8    68.7          133.6 -> 134.1
     1950       20.1    40.4          119.4 -> 128.6
     1985       11.4    29.5           97.8 -> 116.2
     2025      113.7   113.7          168.7 -> 168.7   (unchanged, by construction)
   ```

   The mid-century now carries **as much variety as the mock's own rule** and
   the luminance V is 39 levels deep instead of 71. **The present frame does not
   move at all**: era 4 is `ERA_MEASURED` for every family, so 2014-2025 is
   byte-identical to what shipped, which is the property §34.4 was built around.

   ── THE UNDATED BUILDING IS DATED BY THE FRAME ────────────────────────────

   §34.5 refused `FLAG_NOYEAR` — the roll dates those parcels to its own "not
   known" and `yr` holds a placeholder 1906 — and gave them the measured colour
   in every year. MEASURED: that is **19.2 % of the roof area standing in
   1915**, wearing a photograph taken in 2026. It is the largest single
   anachronism left on the map and §34.2's own argument says so.

   The refusal was of the wrong thing. What the record does not hold is the
   BUILDING's date; the FRAME's date is known exactly. So an undated building
   takes the covering era **of the year being displayed** — its roof is a roof
   of that year, which is the only thing anyone can say about it — and its use
   class, which the roll does state, is read as usual. Nothing is derived from
   the placeholder. At 2025 that lands in era 4, so the present frame is again
   unchanged.

   **`mixed or not stated` keeps its refusal**, and now for a second reason as
   well as the first: the class is genuinely absent, AND giving those 6,066
   footprints a class-generic family measured WORSE — 32.6 effective colours at
   1915 against 68.7 — because for them the photograph is the only thing
   carrying any variety at all. Refusing is both the honest answer and the
   better-looking one, which is not usually how it goes.                    */

/** how many members an era family has, and the shift that picks one */
export const PAINT_BUCKET_SHIFT = 3;
export const PAINT_BUCKETS = 4;

/**
 * `[use][era][measured-brightness bucket] -> WA_ROOF material index`, dark to
 * light within each family. Rows are `manifest.buildings.useNames`, in order;
 * `null` is the honest bucket — no era claim at all. The fifth era is
 * `ERA_MEASURED` for every family and is not in this table.
 *
 * The families, and each is a claim about San Francisco stated here rather
 * than hidden in a constant:
 *
 * · **→1906 · redwood shingle**, which is why the fire behaved as it did. A
 *   shingle roof weathers from dark red-brown to silver, so the family is a
 *   real range and not a decoration.
 * · **1907–1929 · the rebuild** — gravel-surfaced built-up roofing on the flat
 *   stock, clay tile on the Mediterranean-revival institutions and hotels
 *   (52.6 % of the standing hotel/institutional stock dates from this band).
 * · **1930–1959 · built-up bitumen with a mineral cap**, darker and cooler
 *   than the gravel before it; the cap came in a range of granule colours.
 * · **1960–1989 · smooth asphalt**, the darkest the city gets, with ballasted
 *   gravel on the big flat commercial roofs at the light end.
 */
export const UROOF_ERA: readonly (readonly (readonly number[])[] | null)[] = [
  /* single family         */ [[11, 3, 13, 0], [15, 3, 8, 13], [11, 15, 8, 13], [11, 1, 15, 10]],
  /* multi-family          */ [[11, 3, 13, 0], [1, 15, 8, 13], [11, 1, 8, 13], [11, 1, 15, 10]],
  /* retail                */ [[11, 15, 8, 0], [1, 10, 8, 0], [11, 1, 10, 8], [11, 6, 1, 10]],
  /* office                */ [[6, 5, 10, 12], [6, 5, 10, 8], [6, 1, 10, 12], [11, 6, 1, 12]],
  /* industrial            */ [[11, 1, 10, 8], [11, 1, 10, 8], [11, 1, 10, 8], [11, 6, 1, 10]],
  /* hotel / institutional */ [[6, 5, 10, 12], [7, 2, 13, 0], [6, 1, 10, 12], [11, 6, 1, 12]],
  /* mixed or not stated   */ null,
];

/**
 * THE CLASS-GENERIC FAMILY, for a thing that carries no use class — the block
 * at the massing tier. Four eras, dark to light within each, indexed by the
 * block's own measured brightness (`bidx >> 3`). The fifth era is the
 * measurement itself and is not in this table.
 *
 * It is deliberately NOT used for the 6,066 footprints the roll leaves as
 * `mixed or not stated`: there the photograph is per BUILDING and carries the
 * variety, and substituting a generic family measured worse (32.6 effective
 * colours at 1915 against 68.7, `.parity/g1fam2.py`). A block's `bidx` is
 * already an area-weighted mean over its own buildings, so there is no such
 * per-building variety left to lose.
 */
export const UROOF_BLOCK: readonly (readonly number[])[] = [
  [11, 3, 13, 0],
  [1, 15, 8, 13],
  [11, 1, 10, 8],
  [11, 6, 1, 10],
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
 * The year byte an UNDATED footprint is read at: the displayed year itself,
 * clamped into the byte. See the note above — the record does not hold the
 * building's date, but it holds the frame's.
 */
export function frameYearByte(y: number): number {
  return Math.max(0, Math.min(YR_N - 1, Math.floor(y) - YR0));
}

/**
 * THE WHOLE RULE, RESOLVED ONCE PER DISPLAYED YEAR, AS A 7 x 256 x 4 BYTE TABLE.
 *
 * The draw loop reads one array element per building —
 * `tab[((use * 256 + yrByte) << 2) + (paintIdx >> 3)]` — and takes the
 * building's own `ri` when it reads `ERA_MEASURED`. So a rule that is a
 * function of five things costs one indexed load per footprint, and the table
 * itself is 7,168 bytes rebuilt only when the year on the rail changes.
 * Nothing is added to the colour LUT: every material here is already a
 * `WA_ROOF` entry, so `roofF`/`roofNF` index it unchanged and the haze, the
 * ochre and the four `RSHADE` steps all still apply.
 */
export function roofEraTable(y: number): Uint8Array {
  const out = new Uint8Array(UROOF_ERA.length * YR_N * PAINT_BUCKETS);
  for (let u = 0; u < UROOF_ERA.length; u++) {
    const row = UROOF_ERA[u];
    const o = u * YR_N * PAINT_BUCKETS;
    if (!row) {
      out.fill(ERA_MEASURED, o, o + YR_N * PAINT_BUCKETS);
      continue;
    }
    for (let k = 0; k < YR_N; k++) {
      const built = YR0 + k;
      const fam = row[coveringEra(coveringYear(built, y))];
      const p = o + (k << 2);
      if (!fam) {
        out.fill(ERA_MEASURED, p, p + PAINT_BUCKETS);
        continue;
      }
      for (let b = 0; b < PAINT_BUCKETS; b++) out[p + b] = WAM(fam[b]);
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
