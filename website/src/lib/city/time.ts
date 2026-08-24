/* ═══════════════════════════════════════════════════════════════════════
   src/lib/city/time.ts — THE CITY ON ITS OWN CLOCK.

   Ported from `scratchpad/sf-city-anim/time/BLOCK-T.md`. Pure: no DOM, no
   canvas, no data fetch. It holds the ONE RULE the century scrub runs on, the
   years that rule reaches, and the honest arithmetic of what it does not.

   ── THE ONE RULE ─────────────────────────────────────────────────────────
   **A thing is drawn from the first year a published source can put it there.
   Where no source can, it is declared as undated, counted, and put behind a
   flag.** That is this map's own `FLAG_NOYEAR` precedent. No date anywhere in
   this file is invented.

   ── THE DEFECT IT ANSWERS ────────────────────────────────────────────────
   The buildings already did this. Nothing else did. The 1906 Sunset was bare
   sand with the complete twentieth-century street plan ruled across it — MORAGA
   ST, PACHECO ST, RIVERA ST, 25TH AVE lettered on streets that were not there —
   Sunset Reservoir, a 1930s work, as a blue slab in the middle of it, and
   several thousand crowns out of a tree file whose earliest date is 1955.

   ── WHAT THE MAP THEREFORE CLAIMS, AND NOTHING MORE ──────────────────────
   *Before this year, nothing published — no vote in the Journal, no building in
   the roll — puts anything on this street.* It is a "was there by" statement,
   not a construction date, and the copy says **accepted** and never **built**.

   The draw modules already carry most of this and it is deliberately not
   restated here: `streets.ts` §periodOf gates a right of way on the year the
   Board is recorded accepting, paving and kerbing it; `trees.ts` gates a tree on
   its published planting year; `labels.ts` gates a place name on the year a
   register gives it; `scene.ts` gates the massing on the block's own (block,
   year) row and the heroes on the year a published register gives each one.
   What is here is the part that had nowhere else to live: the SPAN, the two
   cohorts the record cannot date, and the counts the page has to be able to say
   out loud.
   ═══════════════════════════════════════════════════════════════════════ */

import { WFLG } from "./trees";

/**
 * THE SPAN, and both ends are published.
 *
 * The low end is the corpus's own first year: the Journal of Proceedings
 * resumes five days after the fire, so April 1906 is the earliest moment
 * anything in this record can speak to, and the 1906 burned district
 * (`ff3a-iqhv`) is what the map draws there.
 *
 * The high end is the secured assessor roll's own year, 2025 — the file the
 * fabric's dates come from. It is NOT the year of the last thing that happened
 * in San Francisco and the page must not say it is.
 */
export const SCRUB_MIN = 1906;
export const SCRUB_MAX = 2025;

/**
 * ── THE UNDATED TREES: THE RULE CHANGED, 2026-08-24, AND HERE IS WHY ──────
 *
 * `tkzw-k3nq` publishes 195,310 street trees. 70,076 carry a planting date over
 * 61 distinct years, 1955–2026. **125,234 carry none**, and the earliest date
 * anywhere in the file is 1955, so the file has nothing whatever to say about a
 * tree standing in 1919.
 *
 * WHAT THIS FILE USED TO DO: hold the undated cohort back until 1955. It stated
 * the consequence in the open — *"1954 has no street trees and 1955 has
 * 125,234"* — and called it one honest moment rather than a smear of invented
 * ones. The reasoning was sound and the frame was not.
 *
 * **MEASURED** (`.parity/g2cliff.py`, driving the page's own rail with a real
 * pointer event and reading the live gate off `globalThis.__cityWFLG`; blurred
 * frame delta, DRAW.md §33.2). Every camera shot 1954 twice before it shot
 * 1955, so the step is read against this tree's own noise floor:
 *
 *     block, Mission   1954→1954   0.000  control
 *     block, Mission   1954→1955   6.006     ← 7.6× the whole of 1955→1960
 *     block, Sunset    1954→1955   2.697
 *     street, Civic    1954→1955   3.417
 *     building, dtwn   1954→1955   3.366
 *
 * Four of the five zooms show it. The fifth (district) hides it only because
 * `bandW(z, VZ_T0=2.9, …)` weights street trees to zero there. Those five
 * years 1955→1960 move the count by **four trees**, because 178 rows in the
 * whole file are dated in them: the pop is the treatment, not the planting.
 *
 * THE CONTRADICTION THAT SETTLED IT, and it is on a single frame. At 1954 the
 * Mission block carries **3,254 canopy blobs and 0 street trees.** Both cohorts
 * are undated. The canopy has no date because its source is one 2013 aerial
 * (`base/canopy` ships cellKey, pos and area and no year, so it has no gate);
 * the street trees have no date because `plantdate` is null on 62 % of the
 * register. Same ignorance, opposite treatments, decided in two different
 * files — and this map's own stated rule, three paragraphs up, is that a thing
 * the record cannot date is *declared, counted, and drawn in every year*.
 *
 * **TAKEN, and this is the change: an undated street tree is drawn in every
 * year, exactly like the canopy and exactly like an undated street centreline
 * (`streets.ts` §the year gate) and the 2,916 `FLAG_NOYEAR` footprints.** The
 * 1955 pop is gone and the two vegetation files now agree.
 *
 * **THE COST, STATED RATHER THAN BURIED: an undated tree now appears in 1906**,
 * which the canopy has always done. That is a claim about `tkzw-k3nq` — it does
 * not know when this tree was planted — and not a claim that the tree was there.
 * The rail's caption says so at every year: `us.sf.thecity.scrub.undated` reads
 * *"…carry no date in any published file, and are drawn in every year"*, and it
 * has said that about these 125,234 trees the whole time. Under the old gate the
 * caption and the gate contradicted each other; they no longer do.
 *
 * STILL TRUE, AND UNCHANGED: **a tree that carries a date keeps it.** The 70,076
 * dated rows are gated on their own planting year in `trees.ts` and nothing here
 * touches that. Only the cohort the file does not date changes treatment.
 *
 * AND 1955 IS REAL, WHICH IS WHY IT SURVIVES AS `TREE_EARLIEST`. Traced rather
 * than assumed (DRAW.md §33.5): the earliest rows carry permit numbers 11, 12,
 * 14, 15, 16 in date order from October 1955, so `plantdate` is the date of the
 * street-tree **planting permit** and 1955 is the year San Francisco's permit
 * register opens. It is not a survey date and not a load stamp — median trunk
 * diameter falls monotonically with plant decade across 40,000 rows that carry
 * both (1950s 11.5 in → 2000s 3.0 in), and the largest single date in the file
 * is 319 trees, a planting crew's week rather than a migration.
 *
 * ONE THING THE FILE DOES THAT NO COPY ON THIS PAGE SAYS: the dated curve has a
 * **twelve-year hole**. 1955 (10 rows), 1956 (168), then **nothing at all from
 * 1957 to 1968**, resuming 1969 (332), 1970 (72), 1971 (1), 1972 (1,465).
 * Whatever the register did in those twelve years did not survive into this
 * file, so anything calling 1955–2026 a planting curve is describing a curve
 * with a decade missing out of the first third of it. It costs nothing on the
 * frame — those years simply add no trees — and it is recorded here because it
 * is the kind of gap that gets mistaken for a fact about the city.
 *
 * REJECTED, AND STILL REJECTED: spreading the undated cohort across the dated
 * cohort's own planting curve, so the 1906 frame carries the share the measured
 * curve implies. It would put a date on 125,234 trees that no file gives one to.
 * Drawing them in every year claims nothing about any of them.
 */
export function undatedTreesVisible(_year: number | undefined): boolean {
  return true;
}

/**
 * `trees.ts` ships `WFLG.undated` as a LOOK ablation switch — "draw the trees
 * whose planting date is not published" — and its own default is to draw them in
 * every year. This function used to turn that switch into a function of the
 * clock. **It no longer does**, for the reason above, and it is kept rather than
 * deleted because it is the one place the clock and that flag meet: if the
 * undated cohort ever goes back on the clock — a permit-date backfill, a second
 * register — this is the seam, and there is exactly one of it.
 *
 * It still returns the previous value, so the film's save/restore contract holds
 * for an ablation run that flips `WFLG.undated` by hand.
 */
export function applyUndatedTreeGate(year: number | undefined): boolean {
  const was = WFLG.undated;
  WFLG.undated = undatedTreesVisible(year);
  return was;
}

/**
 * ── WHAT THE RECORD CANNOT DATE, COUNTED ─────────────────────────────────
 *
 * Every figure here is measured, and every one of them is a cohort the record
 * does not date. The page has to be able to say so; a scrub that silently draws
 * undated things as if they were dated is the defect this whole block exists to
 * fix.
 *
 * `n` is the size of the cohort, `of` the population it comes out of, and
 * `everyYear` is the part of `n` that carries no date **at all** and is
 * therefore drawn in every year. The two are not the same claim and the copy on
 * screen must not treat them as one.
 *
 * ── THE BUILDINGS FIGURE WAS A PARCEL COUNT, AND IT WAS PUBLISHED ────────
 *
 * This shipped `n: 12594, of: 166166` under *"footprints the assessor's roll
 * does not date"*, and `CityScrub`'s caption prints the sum of this table to a
 * reader. **12,594 is not a footprint count.** It is the number of PARCELS
 * carrying the 1900 dump value, out of `ingest.py`'s own comment, put next to a
 * denominator of 166,166 footprints — two different units in one ratio. The
 * error propagated into nine files before anybody looked.
 *
 * The footprint figures were already measured and already shipped, and nothing
 * read them. `gen/bldg-data.js` now carries `meta.yearFlags` — bit, mask,
 * count, meaning and draw behaviour per flag — for exactly this reason:
 *
 *     FLAG_BLOCKYEAR  bit 3  20,571  the 25th-percentile year of the other
 *                                    parcels on this building's own published
 *                                    assessor block. A real year, not its own.
 *                                    → arrives once, on a year that is not its own
 *     FLAG_NOYEAR     bit 4   2,916  no published source dates it, on its parcel
 *                                    or anywhere on its block. `yr` holds 1906,
 *                                    a placeholder and not a date.
 *                                    → no year gate at all, drawn in every year
 *
 * **23,487 of 166,166 — 14.1 % — arrive on a year that is not their own**, and
 * that is what this row carries. Only the 2,916 are drawn in every year; the
 * 20,571 arrive once, in the wrong year, which is why `everyYear` exists rather
 * than one number doing two jobs. The 23,487 is a property of the assessor
 * roll, so the block-key fix moved 534 buildings between the two flags and did
 * not move the total.
 *
 * ── AND THESE NUMBERS ARE A FALLBACK, NOT THE SOURCE ─────────────────────
 *
 * A number typed into a source file is a number that will be wrong after the
 * next pipeline change, and nobody will notice — which is the whole story
 * above, twice. `fromYearFlags` derives this row from the shipped
 * `meta.yearFlags` the moment the manifest carries it; until the encoder
 * re-run lands, `BLDG_FALLBACK` stands in, and `.parity/m1flags.py` asserts it
 * against `bldg-data.js` so the next change fails a script rather than a
 * reader.
 *
 * WITHDRAWN, and it was mine to withdraw: an earlier revision of this comment
 * said `FLAG_NOYEAR` reaches the browser unread. It does not — `scene.ts`
 * honours it in four places, which is why bit 4 means *no year gate* and those
 * 2,916 already draw in every year, exactly as `everyYear` claims. What is
 * genuinely unread is `FLAG_BLOCKYEAR`, it is another block's file, and its
 * treatment is a decision for Daniel rather than something to design around
 * here.
 *
 * Measured by the data block, `pipeline/scripts/us_sf_city/DATA-TRUTH.md` §1.9.
 */
export interface UndatedCohort {
  readonly key: string;
  readonly n: number;
  readonly of: number;
  readonly what: string;
  readonly source: string;
  /** of `n`, how many carry no date at all and are drawn in EVERY year.
   *  Absent means the whole cohort is. */
  readonly everyYear?: number;
}

/** The shape `bldg-data.js` / `manifest.buildings` publishes per year flag. */
export interface YearFlag {
  readonly name: string;
  readonly bit: number;
  readonly n: number;
  readonly means?: string;
  readonly drawnAs?: string;
}

/**
 * The buildings row, derived rather than transcribed.
 *
 * `everyYear` is the flag whose own `drawnAs` says it has no year gate, read
 * off the payload's words instead of matched on a name — a renamed flag should
 * change the number, not silently keep the old one.
 */
export function fromYearFlags(
  flags: readonly YearFlag[],
  of: number,
): UndatedCohort {
  const n = flags.reduce((a, f) => a + f.n, 0);
  const everyYear = flags
    .filter((f) => /every year|no year gate/i.test(f.drawnAs ?? ""))
    .reduce((a, f) => a + f.n, 0);
  const say = flags
    .map((f) => `${f.n.toLocaleString("en-US")} ${f.name === "FLAG_NOYEAR" ? "on a 1906 constant" : "on their block's estimate"}`)
    .join(", ");
  return {
    key: "buildings",
    n,
    of,
    everyYear,
    what: `footprints the assessor's roll does not date on their own parcel — ${say}`,
    source: "DataSF wv5m-vpq2, secured roll 2025 · bldg-data.js meta.yearFlags",
  };
}

/** What `fromYearFlags` would return, for the payload that ships today.
 *  Asserted against `bldg-data.js` by `.parity/m1flags.py`. */
export const BLDG_YEAR_FLAGS: readonly YearFlag[] = [
  { name: "FLAG_BLOCKYEAR", bit: 3, n: 20571,
    drawnAs: "arrives once, on a year that is not its own" },
  { name: "FLAG_NOYEAR", bit: 4, n: 2916,
    drawnAs: "no year gate — drawn in every year" },
];

export const UNDATED: readonly UndatedCohort[] = [
  {
    key: "trees",
    n: 125234,
    of: 195310,
    what: "street trees with no planting date",
    source: "DataSF tkzw-k3nq",
  },
  {
    key: "streets",
    n: 424,
    of: 4895,
    what: "drawn centrelines with neither a vote in the Journal nor a dated building on them",
    source: "DataSF street centrelines · Journal of Proceedings",
  },
  fromYearFlags(BLDG_YEAR_FLAGS, 166166),
  {
    key: "places",
    n: 116,
    of: 1243,
    what: "named places no register dates",
    source: "DataSF 97yj-54sx · gtr9-ntp6 · nc68-ngbr",
  },
];

/**
 * One line of chrome, and it has to be the line the copy actually says.
 *
 * `n` is everything the record does not date — 149,261 of 367,614. `everyYear`
 * is the part of it that is drawn in EVERY year: **128,690**, which is
 * 125,234 undated trees + 424 undated centrelines + 2,916 `FLAG_NOYEAR`
 * footprints + 116 undated places. The difference from `n` is exactly the
 * **20,571** `FLAG_BLOCKYEAR` footprints, which arrive once, on their block's
 * p25 estimate rather than their own parcel's roll year.
 *
 * (This paragraph read 128,599 and 20,662 until 2026-08-24. Neither figure was
 * the sum of the table below it — the table is what the caption prints, so the
 * screen was right and the comment was stale by 91. Recomputed from `UNDATED`
 * rather than retyped.)
 */
export function undatedTotal(): { n: number; of: number; everyYear: number } {
  return UNDATED.reduce(
    (a, c) => ({
      n: a.n + c.n,
      of: a.of + c.of,
      everyYear: a.everyYear + (c.everyYear ?? c.n),
    }),
    { n: 0, of: 0, everyYear: 0 },
  );
}

/**
 * ── THE YEARS WITH NO VOLUME ─────────────────────────────────────────────
 *
 * Thirteen years in the film's own span have no ingested volume at all, so the
 * accepted-street curve sits flat through them. **That is a gap in what has been
 * swept, not a year the city accepted nothing**, and the difference is the whole
 * of whether the picture is honest.
 *
 * Measured over `film/out/accept-lines.json`'s 27 volumes.
 */
export const YEARS_WITH_NO_VOLUME: readonly number[] = [
  1907, 1908, 1910, 1911, 1914, 1916, 1919, 1921, 1924, 1931, 1937, 1942, 1943,
];

export function hasVolume(year: number): boolean {
  return !YEARS_WITH_NO_VOLUME.includes(year);
}

/**
 * ── WHAT THE MAP DOES *NOT* UN-BUILD, AND SAYS SO ────────────────────────
 *
 * The fabric is the roll, and the roll is a survivorship record: it dates the
 * building STANDING TODAY on each parcel. So wherever the city rebuilt — the
 * Western Addition, the produce district, Yerba Buena — the fabric arrives on
 * the replacement's date and the thing that was cleared was never on the map at
 * all. Nothing here corrects for that, and nothing could without a file that
 * says what stood there.
 *
 * The one place the film departs from the roll is stated where it happens: a
 * building the film raises on the RECORD's own date, where the roll dates the
 * parcel later, is dated from that year FOR THE DURATION OF THE FILM ONLY. It
 * reaches exactly one building — the 1917 Main Library, whose parcel the roll
 * dates 1944 — and the explorer the reader lands in when they stop is the roll
 * again.
 */
export const FABRIC_IS_SURVIVORSHIP = true;
