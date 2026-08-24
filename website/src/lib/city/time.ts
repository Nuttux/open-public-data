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

import { TREE_EARLIEST, WFLG } from "./trees";

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
 * ── THE UNDATED TREES, AND THE ONE HONEST MOMENT ─────────────────────────
 *
 * `tkzw-k3nq` publishes 195,310 street trees. 70,076 carry a planting date over
 * 61 distinct years, 1955–2026 — a real planting curve, not a bulk-load stamp,
 * which was checked before it was used. **125,234 carry none**, and the earliest
 * date anywhere in the file is 1955, so the file has nothing whatever to say
 * about a tree standing in 1919.
 *
 * TAKEN: an undated tree is not drawn before 1955. That is a statement about
 * `tkzw-k3nq` and not about a tree.
 *
 * REJECTED, and worth recording: spreading the undated cohort across the dated
 * cohort's own planting curve, so that the 1906 frame carries the share of them
 * the measured curve implies. It would have looked better at every year and it
 * would have put a date on 125,234 trees that no file gives one to.
 *
 * The consequence, stated: **1954 has no street trees and 1955 has 125,234.**
 * One honest moment rather than a smear of invented ones.
 *
 * THE CONSTANT THIS BINDS TO IS THE WHOLE RULE, AND IT WAS THE WRONG ONE.
 * Until now this read `TREE_YEAR0`, which `trees.ts` marks `@deprecated` for
 * precisely this reason: it is `TREE_YEAR_BASE`, **1900**, the storage offset
 * the `yr` byte is decoded against, and not `TREE_EARLIEST`, **1955**, the
 * earliest planting date the file holds. Its own comment says the name "meant
 * both and was one of them."
 *
 * So the gate tested `year >= 1900`, which is true at every year the rail can
 * reach, and all 125,234 undated trees drew in 1906 — the honesty rule above,
 * inverted, and silent, because a tree drawn fifty years early still looks
 * like a tree. It is worth 1.64 % of the district frame across 1955.
 */
export const TREE_UNDATED_FROM = TREE_EARLIEST;

export function undatedTreesVisible(year: number | undefined): boolean {
  return year === undefined || year >= TREE_UNDATED_FROM;
}

/**
 * `trees.ts` ships `WFLG.undated` as a LOOK ablation switch — "draw the trees
 * whose planting date is not published" — and its own default is to draw them in
 * every year. Block T's decision moves that from a switch to a function of the
 * clock, and this is the one place the two meet.
 *
 * It is a mutation of a module-level flag, which is not lovely, and it is
 * honest about being one: `trees.ts` is a landed module whose exported rules
 * this block may not change, and the alternative — a second undated gate in the
 * scene — would put the same decision in two places. **See FILM.md §what needs a
 * different shape:** the gate belongs in `trees.ts`, taking the year, and this
 * function is the seam until it does.
 *
 * Returns the previous value so a caller can put it back.
 */
export function applyUndatedTreeGate(year: number | undefined): boolean {
  const was = WFLG.undated;
  WFLG.undated = undatedTreesVisible(year);
  return was;
}

/**
 * ── WHAT THE RECORD CANNOT DATE, COUNTED ─────────────────────────────────
 *
 * Every figure here is measured, and every one of them is a cohort that is drawn
 * in EVERY year because no published file gives it one. The page has to be able
 * to say so; a scrub that silently draws undated things as if they were dated is
 * the defect this whole block exists to fix.
 *
 * `n` is the size of the cohort, `of` the population it comes out of.
 */
export interface UndatedCohort {
  readonly key: string;
  readonly n: number;
  readonly of: number;
  readonly what: string;
  readonly source: string;
}

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
  {
    key: "buildings",
    n: 12594,
    of: 166166,
    what: "footprints the assessor's roll does not date",
    source: "DataSF wv5m-vpq2, secured roll 2025",
  },
  {
    key: "places",
    n: 116,
    of: 1243,
    what: "named places no register dates",
    source: "DataSF 97yj-54sx · gtr9-ntp6 · nc68-ngbr",
  },
];

/** One line of chrome: how much of what the reader is looking at carries no
 *  date. Formatted by the caller, because the words are the caller's. */
export function undatedTotal(): { n: number; of: number } {
  return UNDATED.reduce(
    (a, c) => ({ n: a.n + c.n, of: a.of + c.of }),
    { n: 0, of: 0 },
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
