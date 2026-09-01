"use client";

/**
 * THE BLOCK FICHE — what happened on one assessor block, and when.
 *
 * A reader clicks a block and gets six things, in this order:
 *
 *   0. WHAT IS HERE NOW — residents, homes, the ground's use and what the roll
 *      values it at, and, on the 70 blocks the city holds a published place on,
 *      what that place takes in public money. This comes FIRST because it is
 *      what a stranger who has just clicked a shape on a map is asking, and
 *      because the answer to "what happened here" is unreadable without it.
 *   1. a short lead — how much the record holds here, across what years, and
 *      how much more sits on the streets the block fronts
 *   2. THE SUBJECTS — the headings the Board printed here more than once,
 *      counted in its own words, each one a filter on everything below
 *   3. THE RAIL — one row per decade, empty ones drawn, each carrying the
 *      strongest line the record prints that decade and opening into the rest
 *   4. the streets the block fronts, kept separate and fetched only on demand
 *
 * ── WHY A DECADE RAIL AND NOT A RANKED LIST ──────────────────────────────
 * `d[]` arrives ranked by interest, and a ranked list is the right answer to
 * "what is worth reading" and the wrong answer to "what happened here". Forty
 * sentences in interest order have no shape. The same forty rows laid on a
 * decade rail do: a block paved in 1912, refused a laundry permit in 1928 and
 * carved into condominiums in 1985 reads as three events with two long
 * silences between them, and the silences are drawn as empty track rather than
 * left to be inferred from absence.
 *
 * The rail is also the navigation. Opening a decade opens that decade's own
 * shelf in place, so a reader never meets an undifferentiated list — and
 * because every decade shows its own best line unexpanded, the highest-ranked
 * decision on the block is always on screen already.
 *
 * ── THE SUBJECTS ARE COUNTED, NOT CLASSIFIED ─────────────────────────────
 * There is no topic field on a row, and a classifier's guess printed in the
 * record's voice would be the one thing this page may never do. The Board
 * printed its own subject above the item on a great many of these rows, and
 * those printed subjects repeat — so they are counted, verbatim, and shown
 * only where the volume printed the same heading here more than once. See
 * `blockSubjects` for the fold and the measurement.
 *
 * ── EACH ROW IS THE HOUSE ARCHIVE CONTRACT ───────────────────────────────
 * `components/fiche/FicheArchiveShelf.tsx`, reused unchanged. Three things per
 * document and no fourth:
 *
 *   1. the line the volume prints           → `gloss`
 *   2. what it is and when, linked to the leaf of the scan → `title` + `href`
 *   3. the series it is held in, and how precisely the record places it
 *                                           → `sourceLabel`, `variantNote`
 *
 * ── THE PRECISION TIER IS NOT DECORATION ─────────────────────────────────
 * A `street`-tier row is not a claim about this block. It is a claim about a
 * street this block fronts, and 35,244 of the 76,419 placed decisions are that
 * tier. So the block rows and the street rows are in **two different sections
 * with two different sentences**, and the street ones are not fetched at all
 * until the reader asks for them. Flattening the two into one list would be
 * presenting a street's record as a block's.
 *
 * ── WHAT IS HERE NOW, AND WHAT IS A JOIN ─────────────────────────────────
 * Two files, both emitted by `pipeline/scripts/us_sf_city/build_block_facts.py`
 * and both keyed on the assessor block id the map already publishes.
 *
 *   `block-facts.json`  the closed assessor roll, which names this block in a
 *                       column of its own — so it is not a join at all — plus
 *                       the 2020 Census count, which IS one and says so.
 *   `block-money.json`  the published Qipu place fiches, reached by the City
 *                       Facilities APN. 70 of 5,404 blocks carry one and 33
 *                       carry a money figure. **The panel prints that ratio**
 *                       rather than letting a silent absence read as nothing.
 *
 * Three rules this section is written under, and none of them bend:
 *
 *   - **null is not zero.** 810 blocks have no census ring resolving onto them
 *     and the residents row is ABSENT there, never "0". A zero would be a claim
 *     that nobody lives on a block the count simply does not reach.
 *   - **the money is the whole place's.** Moscone Center stands on four blocks
 *     and reports the same $776.3 M agreed on each. `n_blocks` is on the record
 *     and the panel says it in words. Nothing is apportioned, because no
 *     published file apportions it.
 *   - **the two ledgers are never added.** Contracts and payments are different
 *     city files; the place fiches already carry that warning and so does this.
 *
 * ── WHY NOT A ROUTED DRAWER ──────────────────────────────────────────────
 * The site's drawer architecture is one root-level `(...)` route per ENTITY.
 * An assessor block is not an entity on this site — there are 5,404 of them,
 * none has a page, and the click is an inspection of the canvas rather than a
 * navigation. So this is an in-page panel with the same focus and Escape
 * behaviour, and no URL of its own.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useT } from "@/lib/localeContext";
import FicheArchiveShelf from "@/components/fiche/FicheArchiveShelf";
import type { FicheArchiveDoc } from "@/components/fiche/types";
import {
  sourceHref,
  blockAddresses,
  blockPlaceName,
  type BlockAddress,
  blockLead,
  blockNow,
  blockPlaces,
  blockShape,
  decadeGroups,
  railItems,
  railSilence,
  stripFileNumber,
  hasMoney,
  hoodAt,
  indexedLastYear,
  judgedLead,
  loadBlockFacts,
  loadBlockIndex,
  loadBlockLeadPicks,
  loadBlockMoney,
  loadHoodFacts,
  loadHoodRecords,
  loadStreetIndex,
  ficheOpener,
  loadSubjects,
  loadThreads,
  threadRows,
  threadsIn,
  streetKeyFromFile,
  streetRecordCount,
  type StreetIndex,
  type FicheOpener,
  type SubjectsFile,
  type ThreadHere,
  type ThreadsFile,
  type HoodRecords,
  loadStreetRecord,
  placeHref,
  streetLabel,
  SERIES_LAST_YEAR,
  usdShort,
  KIND_WORDING,
  TIER_WORDING,
  type BlockDecision,
  type BlockFactsFile,
  type BlockIndex,
  type BlockLeadPicks,
  type BlockMoneyFile,
  type BlockNow,
  type BlockPlace,
  type BlockRecord,
  type DecadeGroup,
  type DecadeRun,
  type HoodFactsFile,
  type HoodRecord,
} from "./block-records";

const nfInt = new Intl.NumberFormat("en-US");

/**
 * FOOTNOTE WEIGHT — and IT WANTS A HOME IN `fusion.css`, which this block does
 * not own. The rule is written out in FICHE.md §19 for the owner of that file
 * to land as `.fx-block-note`; until it does, these two objects are it.
 *
 * The sentence that says what a figure was joined from is this project's whole
 * claim and may never leave the page. But *"The 2020 Census, summed over the 50
 * of this neighbourhood's 53 blocks a census block resolves onto. City-wide
 * that join carries 868,555 of the county's 873,965 residents."* is THIRTY-SIX
 * WORDS qualifying a five-word fact, and at `fx-block-hint`'s 11.5 px it read
 * as a second paragraph competing with the first. A footnote is not a shorter
 * sentence — it is the same sentence set so the eye can skip it and come back.
 *
 * Applied to the HOW-WE-KNOW paragraphs only: the census join, the two money
 * coverage ratios, the ranking note, the assessor roll line, and the two
 * captions under the rail. NOT to `money_ledgers` or `money_over`, which are
 * refusals about the figure directly above them and carry the link out.
 */
const NOTE: CSSProperties = {
  marginTop: 7,
  fontSize: 10.5,
  lineHeight: 1.4,
  opacity: 0.82,
};
/** `.fx-block-jump` sets 12.5 px of its own, which inside a footnote is bigger
    than the footnote. */
const NOTE_LINK: CSSProperties = { fontSize: 10.5 };

/* ── THE LEAD, AND THE FIGURES ROW ────────────────────────────────────────
   Inline for the same reason §19b's footnote was inline before it landed:
   `src/app/fusion.css` is not this block's file. FOR ITS OWNER — these want
   to be `.fx-block-lead`, `.fx-block-quote`, `.fx-block-lead-meta`,
   `.fx-block-figs` and `.fx-block-sep`, next to `.fx-block-note` at ~17196,
   and the five constants below are deleted the day they land.

   The quote is the biggest type on the panel — 15.5 px against the panel's
   13.5 px lead — because it is the thing the reader clicked for. Every
   earlier round of this fiche had the Board's own sentence set smaller than
   our summary of the block, which is the hierarchy inverted. */
const LEAD_WRAP: CSSProperties = { margin: "2px 0 0" };
const LEAD_QUOTE: CSSProperties = {
  margin: "7px 0 0",
  padding: "0 0 0 11px",
  borderLeft: "2px solid var(--bleu)",
  fontSize: 15.5,
  lineHeight: 1.36,
  color: "var(--ink)",
};
const LEAD_META: CSSProperties = { marginTop: 7 };
/* The figures are one row, not a table: three to five numbers with their
   labels, separated by the same middot the rest of the fiche uses. */
const GROUND: CSSProperties = {
  margin: "16px 0 0",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--ink)",
};
const SEP: CSSProperties = { color: "var(--muted)" };

/**
 * THREE KEYS ARE NOT IN THE DICTIONARIES YET — listed in FICHE.md §19 for the
 * owner of `en.ts` / `fr.ts`, who lands them in both.
 *
 * `useT` returns THE KEY ITSELF when one is missing, so a bare `t()` would
 * print `us.sf.thecity.panel.now_span` on the panel. This prints the English
 * instead, and **it disposes of itself**: the fallback is only ever reached
 * while `t(k) === k`, so the day the keys land every call here starts
 * returning the dictionary's string and the three literals below can be
 * deleted with the helper. Same disposal §14 and §16a made twice before, in
 * one function rather than a map.
 */
function tOr(t: (k: string) => string, k: string, en: string): string {
  const v = t(k);
  return v === k ? en : v;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function whenOf(d: BlockDecision): string {
  if (!d.d) return String(d.y);
  const [mm, dd] = d.d.split("-");
  const m = MONTHS[Number(mm) - 1];
  return m ? `${Number(dd)} ${m} ${d.y}` : String(d.y);
}

/**
 * The volume slug, spelled out as far as it spells itself.
 *
 * Takes the decision, not `u`: a Board PDF and an Archive scan carry the same
 * string shape, and calling this "Internet Archive" for a file the Clerk
 * posted would credit the wrong institution — in front of the one audience
 * that would notice.
 */
function seriesOf(d: Pick<BlockDecision, "u" | "c">): string {
  if (d.c === "b") return "Board of Supervisors, Clerk's meeting minutes";
  const vol = d.u.split("/")[0] ?? "";
  if (vol.startsWith("journal")) return "Board of Supervisors, Journal of Proceedings";
  if (vol.startsWith("annualreport") || vol.startsWith("annrep"))
    return "Department annual report";
  if (vol.startsWith("reportof")) return "Bureau of Engineering / Board of Public Works report";
  return "Internet Archive";
}

/**
 * One row of the shelf.
 *
 * Two things the earlier version printed are gone, both because they were
 * saying the same thing twice:
 *
 *   - **the money.** `a` is only ever set when the figure is printed INSIDE
 *     the line (`build_index.rec()` requires the match to be in `line` and the
 *     line to hold exactly one figure), and 314 of 314 sampled rows bear that
 *     out. So `· $8,980 printed on the page` restated a number the reader had
 *     just read, one line above, in the sentence that says what it was for.
 *   - **the year.** The shelf renders `title · year` itself, and the title
 *     already carried the full date, so every row ended `15 April 1929 · 1929`.
 *
 * The phase word is gone too — `opened`, `decided`, `stalled` are the
 * pipeline's controlled vocabulary, and as a bare word on a row they say
 * nothing a reader can use.
 */
function toDoc(d: BlockDecision, i: number): FicheArchiveDoc {
  const kind = KIND_WORDING[d.k] ?? "Item";
  const tier = TIER_WORDING[d.p] ?? "";
  return {
    id: `${d.u}#${i}`,
    // ── THE SHELF ASKED FOR THIS FIELD AND WAS BEING GIVEN THE OPPOSITE ──
    // `gloss` is specified as "one line on what this document SAYS … never a
    // raw OCR fragment", and it was receiving exactly that: the Clerk's whole
    // sentence, which is what made a decade open into a wall of
    // "Grant Agreement - Retroactive - Operating Subsidy for Permanent
    // Supportive Housing Units - RSU Associates, L.P. - …".
    // `pl` is the line the field was designed for. Where none exists the
    // Clerk's text is still better than nothing, so it stays as the fallback —
    // and the row's link opens the scan either way.
    gloss: (d.pl && d.pl.trim()) || d.t.trim() || null,
    title: `${kind} · ${whenOf(d)}`,
    year: null,
    href: sourceHref(d),
    sourceLabel: seriesOf(d),
    variantNote: tier + (d.approx ? " · page ≈" : ""),
  };
}

export interface BlockContext {
  /**
   * HOW CLOSE THE READER WAS WHEN THEY CLICKED — the index of the map's own
   * named zoom stop, 0 being the whole city and the last being one street.
   * `-1` when the map does not say.
   *
   * This is what decides WHAT A CLICK MEANS. Looking at the whole city and
   * clicking, a reader is asking about a neighbourhood; standing on one street
   * and clicking, they are asking about a building. The patch of ground is how
   * the map answers, never what the reader asked for.
   */
  zoomStop?: number;
  /** the assessor block's own id, as the roll prints it */
  id: string;
  /** the published neighbourhood the block sits in */
  hood: string;
  /**
   * Its index into the map's own `hoodNames` — 0..40, and every one of the
   * 5,404 blocks carries one. The rollup file is joined on THIS, not on the
   * name: `build_hood_facts.py` reads the same u8 field, so array position is
   * the join, and a string comparison would be a second membership able to
   * disagree with the first.
   */
  hoodIndex: number;
  /** the published area, m² */
  areaM2: number;
  /**
   * How many decisions the record places on the streets this block fronts —
   * `ns[i]` in the T0 index. It was measured all along and never handed to the
   * fiche, so a block whose whole story is on its streets could not say so
   * until the reader opened a fold they had no reason to open.
   *
   * MEASURED off the shipped `block-index.json` on 2026-08-26: **335** blocks
   * hold nothing of their own (`n === 0`) and front a street the record knows
   * (`ns > 0`), and the median block over all 5,404 reaches **103** street
   * decisions. (It read 401 and 95, taken before the three rebuilds of
   * 2026-08-26. Both moved, and in opposite directions: the modern sweep
   * placed decisions ON blocks that previously had only street rows, so the
   * first number FELL while the second rose.)
   */
  streetDecisions: number;
}

/* THE TWENTY-SEVEN NEIGHBOURHOOD STRINGS ARE IN `en.ts` AND `fr.ts` (1492d9c7),
   so `EN_HOOD` and `tx()` are gone and every one of them is a plain `t()` call
   — the same disposal §14 made for the thirteen before them. `useT` returns THE
   KEY ITSELF when a key is missing, which is why the fallback existed and why
   the deletion is checked by dumping the panel's own `innerText` and grepping
   for `us.sf.` rather than by trusting the diff. */

function HoodProvenance({
  hood,
  file,
  t,
}: {
  hood: HoodRecord;
  file: HoodFactsFile;
  t: (k: string) => string;
}) {
  return (
    <p className="fx-block-hint" style={NOTE}>
      {t("us.sf.thecity.panel.hood_now_src")
        .replace("{c}", String(file.census_year))
        .replace("{n}", nfInt.format(hood.residents_blocks))
        .replace("{all}", nfInt.format(hood.blocks))
        .replace("{carried}", nfInt.format(file.coverage.residents_carried))
        .replace("{total}", nfInt.format(file.coverage.residents_counted))}{" "}
      <a
        className="fx-block-jump"
        style={NOTE_LINK}
        href="https://data.census.gov/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("us.sf.thecity.panel.now_census")}
      </a>
    </p>
  );
}

/**
 * PUBLIC MONEY, ROLLED UP — and the one thing a rollup must never do.
 *
 * **A rolled-up number that does not say what it is rolled up from launders a
 * gap.** South of Market reads $776.3 M agreed. That is Moscone Center, one of
 * the four city places standing there, and a reader shown the figure under a
 * neighbourhood heading with nothing else will read it as the neighbourhood's.
 * So the sentence over the figures always carries BOTH counts and NAMES the
 * place carrying the largest of them, and the figures are only ever described
 * as the whole of the places they came from.
 *
 * The two block-level refusals survive unchanged, because they are properties
 * of the source files and travel with the rollup: **the two ledgers are never
 * added**, and **paid above agreed is not an overrun** — Bayview Hunters Point
 * reads $611.7 M agreed and $689.5 M paid for exactly the reason the Southeast
 * plant does one block down.
 */
function HoodMoney({
  hood,
  file,
  money,
  t,
}: {
  hood: HoodRecord;
  file: HoodFactsFile;
  money: BlockMoneyFile | null;
  t: (k: string) => string;
}) {
  const m = hood.money;
  if (m.places === 0) return null;
  const some = m.places_with_a_figure;
  const top = m.top;
  const lead =
    some === 0
      ? t(
                    m.places === 1
            ? "us.sf.thecity.panel.hood_money_none_one"
            : "us.sf.thecity.panel.hood_money_none",
        )
          .replace("{n}", nfInt.format(m.places))
          .replace("{place}", m.names[0] ?? "")
      : t(
                    m.places === 1
            ? "us.sf.thecity.panel.hood_money_only"
            : some === 1
              ? "us.sf.thecity.panel.hood_money_one"
              : "us.sf.thecity.panel.hood_money_some",
        )
          .replace(/\{n\}/g, nfInt.format(m.places))
          .replace(/\{m\}/g, nfInt.format(some))
          .replace("{place}", top?.name ?? "");

  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {t("us.sf.thecity.panel.hood_money_head")}
      </div>
      <p className="fx-block-lead" style={{ marginTop: 0 }}>
        {lead}
      </p>
      {some > 0 ? (
        <dl className="fx-city-ledger-facts" style={{ marginTop: 7 }}>
          {m.n_contracts > 0 ? (
            <>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.money_contracts")}</dt>
                <dd>{nfInt.format(m.n_contracts)}</dd>
              </div>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.money_agreed")}</dt>
                <dd>{usdShort(m.agreed_usd)}</dd>
              </div>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.money_paid")}</dt>
                <dd>{usdShort(m.paid_usd)}</dd>
              </div>
            </>
          ) : null}
          {m.n_payees > 0 ? (
            <div className="fx-city-fact-row">
              <dt>
                {t("us.sf.thecity.panel.money_payees")}
                {` (${nfInt.format(m.n_payees)})`}
              </dt>
              <dd>{usdShort(m.payees_paid_usd)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {some > 0 && m.n_contracts > 0 && m.paid_usd > m.agreed_usd ? (
        <p className="fx-block-hint" style={{ marginTop: 6 }}>
          {t("us.sf.thecity.panel.money_over")}
        </p>
      ) : null}
      <p className="fx-block-hint" style={{ marginTop: 7 }}>
        {some > 0 && m.n_contracts > 0 && m.n_payees > 0
          ? t("us.sf.thecity.panel.money_ledgers") + " "
          : ""}
        {/* `next/link`, NOT an anchor: the place fiche has a root-level
            intercepting drawer at `app/@drawer/(...)us/city/sf/places/place/
            [slug]`, and a plain <a> is a document navigation that bypasses the
            interception and throws the whole city away to show one building. */}
        {top && money ? (
          <Link className="fx-block-jump" href={placeHref(money, top.slug)}>
            {t("us.sf.thecity.panel.money_link").replace("{place}", top.name)}
          </Link>
        ) : null}
      </p>
      {/* The coverage, printed where the section appears — a reader who meets
          this on one neighbourhood and not the next has to be able to tell
          "the city holds nothing here" from "this join does not reach here". */}
      <p className="fx-block-hint" style={NOTE}>
        {t("us.sf.thecity.panel.hood_money_cover")
          .replace("{n}", nfInt.format(file.coverage.hoods_with_a_place))
          .replace("{all}", nfInt.format(file.coverage.hoods))
          .replace("{m}", nfInt.format(file.coverage.hoods_with_a_money_figure))}
      </p>
    </>
  );
}

/**
 * WHAT THE BOARD KEPT DECIDING HERE — curated, not judged.
 *
 * The architecture is `export_sf_places.curate_documents()` one level down in
 * material: dedupe by stem, classify against an inspectable tier table, rank by
 * evidence inside the tier, cap, and report the count the cap hid. **No model
 * pass**, and the reason is the one this project settled on the Paris side:
 * *the city already writes the description.* Every line here is a sentence the
 * Board printed, and every one opens the scan leaf it was printed on. A
 * generated summary of the same material would be the only thing on this map a
 * reader could not click through to.
 *
 * The one signal a block cannot carry is the primary sort: **how many of this
 * neighbourhood's own blocks the same printed subject lands on.** A count, not
 * a judgement, and it is the whole difference between a decision that touched
 * one corner and one that reorganised a district — "Giving Notice of Special
 * Election for Bonds for Municipal Railway Extensions", 1927, twenty-four
 * Sunset blocks.
 */
function HoodHighlights({ hood, t }: { hood: HoodRecord; t: (k: string) => string }) {
  if (hood.highlights.length === 0) return null;
  const docs: FicheArchiveDoc[] = hood.highlights.map((h, i) => ({
    id: `${h.u}#h${i}`,
    gloss: h.t,
    title: `${KIND_WORDING[h.k] ?? "Item"} · ${h.y || h.y0}`,
    year: null,
    href: sourceHref(h),
    sourceLabel: seriesOf(h),
    variantNote:
      (h.nb > 1
        ? t("us.sf.thecity.panel.hood_hl_blocks").replace("{n}", String(h.nb))
        : t("us.sf.thecity.panel.hood_hl_blocks_one")) +
      (h.y1 > h.y0 ? ` · ${h.y0}–${h.y1}` : ""),
  }));
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {t("us.sf.thecity.panel.hood_hl_head")}
      </div>
      {/* THE RANKING NOTE IS A METHOD NOTE, so it is a footnote: forty words
          of how the sort works, over three lines it explains. It stays on the
          page because a ranked list that will not say what it ranked on is the
          one thing this panel may not ship. */}
      <p className="fx-block-hint" style={NOTE}>
        {t("us.sf.thecity.panel.hood_hl_note")}
      </p>
      {/* CAP 6 AND NO FOLD, deliberately. Two folds over one shelf would have
          been two different claims wearing the same sentence: the shelf's own
          expander hides rows it HAS, and the cap in `build_hood_facts.py` hid
          rows that were never shipped. "2,363 more lines" on an expander that
          reveals three is the kind of number that is true and reads as a lie.
          So every shipped line is on screen, and the count below is the one
          the cap hid. */}
      <FicheArchiveShelf docs={docs} cap={docs.length} moreLabel={() => ""} />
      {/* WHAT THE CAP HID. The section ranks the record and shows six, and
          until this line a reader had no way to tell "this is what the Board
          did here" from "these are the six the ranking put on top". The Mission
          holds 2,360 more. It is not a link because there is nowhere to send
          them yet — the rail below is the block's — and a count a reader cannot
          act on is still better than a silence they cannot detect. */}
      {hood.highlights_hidden > 0 ? (
        <p className="fx-block-hint" style={{ marginTop: 8 }}>
          {t("us.sf.thecity.panel.hood_hl_more").replace(
            "{n}",
            nfInt.format(hood.highlights_hidden),
          )}
        </p>
      ) : null}
    </>
  );
}

/**
 * WHAT IS HERE NOW — four rows and a source line, in the margin's own idiom.
 *
 * All twenty-five `us.sf.thecity.panel.{now,money}_*` keys are in `en.ts` and
 * `fr.ts` (68082652), so this calls `t()` like the rest of the panel; the local
 * `EN_NOW` fallback that stood in for them while they landed is gone.
 *
 * `fx-city-fact-row` is the label/value row `CityMap` already draws in the
 * ledger above this panel, reused verbatim: nothing new is styled, and the
 * block's modern facts read as the same kind of object as the map's own.
 *
 * The RESIDENTS ROW IS ABSENT, not zero, where the Census resolved nothing
 * here — see the file's `pop: -1`. The line under the rows says so in words,
 * because an absent row with no explanation reads as an oversight.
 */
/**
 * THE LEAD — the record's own line, first, with the scan one press away.
 *
 * > "It leads with demographics and buries the one thing nobody else has: the
 * > Board's own printed sentence about that block. That sentence is what made
 * > the film work … the fiche has the same asset for every block and puts it
 * > fourth."
 *
 * Four things and nothing else: the sentence as the volume prints it, what
 * kind of item it was and when, **how precisely the record places it** — the
 * promise `TIER_WORDING` exists to keep, and it may not be dropped to make a
 * quote look cleaner — and the way into the scanned page.
 *
 * `blockLead` picks it with `pickHeadline`, the same settled function the rail
 * heads each decade with, run over the whole block. Nothing is summarised,
 * nothing is written: **every word inside the quotation marks is the Board's.**
 */
const LEAD_PLAIN: React.CSSProperties = {
  margin: "0 0 .45rem",
  fontSize: ".98rem",
  lineHeight: 1.35,
  fontWeight: 600,
  color: "var(--fx-ink, #17171b)",
};

function BlockLead({ d, t }: { d: BlockDecision; t: (k: string) => string }) {
  return (
    <section style={LEAD_WRAP}>
      <div className="fx-city-ledger-head">
        {tOr(t, "us.sf.thecity.panel.lead_head", "What the Board decided here")}
      </div>
      {/* ── THE PLAIN LINE SITS ABOVE THE QUOTE, NEVER INSIDE IT ────────────
          `pl` is written — ours, not the Board's — and this component's whole
          promise, stated above, is that every word between the quotation marks
          is theirs. So the written line heads the quote and the quote is left
          exactly as it was. A reader gets the sense first and the record itself
          underneath, and can always tell which is which, which is the only
          arrangement that keeps both. */}
      {d.pl ? <p style={LEAD_PLAIN}>{d.pl}</p> : null}
      <blockquote style={LEAD_QUOTE}>{`“${stripFileNumber(d.t)}”`}</blockquote>
      <p className="fx-block-hint" style={LEAD_META}>
        {[
          whenOf(d),
          KIND_WORDING[d.k] ?? "Item",
          (TIER_WORDING[d.p] ?? "") + (d.approx ? " · page ≈" : ""),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p style={{ margin: "8px 0 0" }}>
        <a
          className="fx-block-jump"
          href={sourceHref(d)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {d.c === "b"
            ? tOr(t, "us.sf.thecity.panel.lead_open_pdf", "Open the minutes")
            : tOr(t, "us.sf.thecity.panel.lead_open", "Open the scanned page")}
          {" ↗"}
        </a>
      </p>
    </section>
  );
}

/**
 * THE GROUND, IN ONE LINE.
 *
 * > "Then the facts, compressed. People, homes, what the ground is used for.
 * > One line, not a section with headings."
 *
 * It was a headed list of three to five `dt`/`dd` rows sitting above the
 * record. Three facts do not need a table and they do not need a heading; what
 * they need is to be readable in one pass and to stop competing with the line
 * the Board printed. So they are one assembled sentence — and assembled is the
 * word: **every clause is one field, and a clause whose field is missing is
 * dropped rather than hedged**, which is the same discipline `BlockSummary`
 * was built on in §14h.
 *
 * The strings are the ones already in both dictionaries. `hood_block_ground`
 * and the four `sum_people*` keys landed in `1492d9c7` and §19g recorded the
 * first as having lost its only caller; it has one again, saying the thing it
 * was written to say.
 *
 * **The provenance stays.** Two of these three numbers are a join — the 2020
 * Census onto the assessor's ring — and the footnote that says so and links
 * both sources is the project's whole claim. It is set at footnote weight
 * (§19b), not deleted.
 */
function GroundLine({ now, shape, atDoor, t }: {
  now: BlockNow | null;
  shape: NonNullable<ReturnType<typeof blockShape>> | null;
  /* WHOSE GROUND THIS IS. Residents, homes and the roll's use are the BLOCK's
     — the Census ring resolved onto it, the parcels summed across it. Under an
     address title they read as a claim about that building, and "200 Residents"
     over `2707 Twenty-first St` says two hundred people live in one house. So
     a door shows the record figures and nothing else; the ground facts stay
     with the block they were measured on. */
  atDoor: boolean;
  t: (k: string) => string;
}) {
  const bits: React.ReactNode[] = [];
  if (!atDoor && now && now.residents !== null) {
    bits.push(
      <span key="r">
        <b>{nfInt.format(now.residents)}</b> {t("us.sf.thecity.panel.now_residents")}
      </span>,
    );
  }
  if (!atDoor && now && now.homes !== null) {
    bits.push(
      <span key="h">
        <b>{nfInt.format(now.homes)}</b> {t("us.sf.thecity.panel.now_homes")}
      </span>,
    );
  }
  if (!atDoor && now?.use) bits.push(<span key="u">{now.use}</span>);
  if (shape) {
    bits.push(
      <span key="n">
        <b>{nfInt.format(shape.n)}</b>{" "}
        {shape.n === 1
          ? tOr(t, "us.sf.thecity.panel.now_decision_one", "Board decision")
          : tOr(t, "us.sf.thecity.panel.now_decisions", "Board decisions")}
      </span>,
    );
    bits.push(
      <span key="y">
        {shape.firstYear === shape.lastYear
          ? String(shape.firstYear)
          : `${shape.firstYear}\u2013${shape.lastYear}`}
      </span>,
    );
  }
  if (bits.length === 0) return null;
  return (
    <p style={GROUND}>
      {bits.map((b, i) => (
        <span key={i}>
          {i > 0 ? <span style={SEP}> · </span> : null}
          {b}
        </span>
      ))}
    </p>
  );
}

/**
 * SOURCES — the provenance, one fold down.
 *
 * > "every provenance sentence goes behind a small mark beside its figure, or
 * > one sources disclosure at the foot. The rule is that every figure traces to
 * > something a reader can click through to — it says nothing about that trace
 * > living in the body."
 *
 * Two paragraphs, and both are longer than the figures they qualify: the 2020
 * Census joined onto the assessor's ring, and the 1.3 % of blocks the money
 * file reaches. **Neither may leave the page** — they are this project's whole
 * claim, and the coverage ratio in particular is the only thing that lets a
 * reader tell *"the city holds nothing here"* from *"this join does not reach
 * here"*. They leave the BODY, which is a different thing, and they take both
 * source links with them.
 *
 * The honest floor lines do NOT come here. *"The Board's Journal is scanned to
 * 1999"* is what stops a blank decade reading as a decade the city did
 * nothing in, and it has to be on screen beside the blank it explains.
 */
function BlockSources({
  now,
  money,
  t,
}: {
  now: BlockNow | null;
  money: BlockMoneyFile | null;
  t: (k: string) => string;
}) {
  if (!now && !money) return null;
  return (
    <details className="fx-shelf-more" style={{ marginTop: 14 }}>
      <summary>{tOr(t, "us.sf.thecity.panel.sources_open", "Sources")}</summary>
      {now ? (
        <p className="fx-block-hint" style={NOTE}>
          {t("us.sf.thecity.panel.now_src").replace("{y}", String(now.rollYear))}{" "}
          {now.residents !== null
            ? t("us.sf.thecity.panel.now_src_pop").replace("{c}", String(now.censusYear))
            : t("us.sf.thecity.panel.now_no_pop")}{" "}
          <a
            className="fx-block-jump"
            style={NOTE_LINK}
            href="https://data.sfgov.org/d/wv5m-vpq2"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("us.sf.thecity.panel.now_roll")}
          </a>
          {now.residents !== null ? (
            <>
              {" · "}
              <a
                className="fx-block-jump"
                style={NOTE_LINK}
                href="https://data.census.gov/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("us.sf.thecity.panel.now_census")}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {money ? (
        <p className="fx-block-hint" style={NOTE}>
          {t("us.sf.thecity.panel.money_cover")
            .replace("{n}", nfInt.format(money.coverage.blocks_with_a_place))
            .replace("{all}", nfInt.format(money.coverage.blocks_total))
            .replace("{m}", nfInt.format(money.coverage.blocks_with_a_money_figure))}
        </p>
      ) : null}
    </details>
  );
}

/**
 * PUBLIC MONEY — one entry per published place standing on this block.
 *
 * The sentence names the place's own building on THIS block where the register
 * gives one, because that is the only thing in the whole money file at block
 * grain: block 3724 is Moscone West, 3723 is Moscone North. Everything under it
 * is the WHOLE place's, and the second sentence says so whenever the place
 * stands on more than one block.
 *
 * A place with no ledger row prints the sentence and then says there is no
 * figure, rather than showing nothing — an empty money section under a named
 * civic building reads as "this costs nothing", which is not what the files say.
 */
function PlaceMoney({
  place,
  href,
  figuresAbove,
  t,
}: {
  place: BlockPlace;
  href: string;
  /**
   * THE SAME FOUR FIGURES ARE ALREADY ON THIS PANEL, ten rows up.
   *
   * §16e found this and did not fix it, for one reason: *"there is no key to
   * explain the absence, and a money section that shows a building and no
   * figure, with nothing saying the figure is two screens up, reads as a
   * section that failed to load."* `tOr` is that key until the dictionary has
   * it, so the fix is the one §16e specced, gate unchanged: it fires only when
   * the neighbourhood's ONE figure-carrying place is the ONE place standing on
   * the picked block. MEASURED against `block-money.json` and `hood-facts.json`
   * together: **16 blocks of 5,404, over 13 neighbourhoods** — the four Moscone
   * blocks, Coit Tower, Kezar, Portsmouth Square, the Palace of Fine Arts,
   * Laguna Honda, Zuckerberg SF General, Pier 70, Stern Grove, Glen Canyon,
   * McLaren, the EOC and the Public Safety Building. It does NOT fire on City
   * Hall: the Tenderloin carries five figures and City Hall is one of them, so
   * the block's own are not the neighbourhood's.
   *
   * What is kept is the sentence, because it is the only thing this section
   * says that the one above cannot: *which building stands on THIS block* —
   * `Moscone West, 775,000 sq ft`.
   */
  figuresAbove: string | null;
  t: (k: string) => string;
}) {
  const here = place.here[0];
  const money = hasMoney(place) && !figuresAbove;
  // "Coit Tower stands here — 5,687 sq ft of Coit Tower." The register's name
  // for the building and the place's name are the same thing on a place that
  // is one building, and saying it twice is worse than not saying it at all.
  const sameName =
    !!here?.name &&
    here.name.replace(/[^a-z0-9]/gi, "").toLowerCase() ===
      place.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    <div style={{ marginTop: 10 }}>
      <p className="fx-block-lead" style={{ marginTop: 0 }}>
        {here && here.name && here.sqft > 0
          ? t(
              sameName
                ? "us.sf.thecity.panel.money_stands_same"
                : "us.sf.thecity.panel.money_stands",
            )
              .replace("{name}", here.name)
              .replace("{sqft}", nfInt.format(here.sqft))
              .replace("{place}", place.name)
          : t("us.sf.thecity.panel.money_stands_plain").replace(
              "{place}",
              place.name,
            )}
        {/* "It stands on 4 blocks, and every figure below is the whole of it"
            is a warning about figures, and where the figures are above rather
            than below there are none for it to warn about — printing it would
            have been a sentence pointing at nothing. The same refusal is
            already carried by the neighbourhood's own lead. */}
        {place.n_blocks > 1 && !figuresAbove
          ? " " +
            t("us.sf.thecity.panel.money_spans").replace(
              "{n}",
              String(place.n_blocks),
            )
          : ""}
      </p>
      {money ? (
        <dl className="fx-city-ledger-facts" style={{ marginTop: 7 }}>
          {place.n_contracts > 0 ? (
            <>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.money_contracts")}</dt>
                <dd>{nfInt.format(place.n_contracts)}</dd>
              </div>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.money_agreed")}</dt>
                <dd>{usdShort(place.agreed_usd)}</dd>
              </div>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.money_paid")}</dt>
                <dd>{usdShort(place.paid_usd)}</dd>
              </div>
            </>
          ) : null}
          {place.n_payees > 0 ? (
            <div className="fx-city-fact-row">
              <dt>
                {t("us.sf.thecity.panel.money_payees")}
                {` (${nfInt.format(place.n_payees)})`}
              </dt>
              <dd>{usdShort(place.payees_paid_usd)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {/* PAID ABOVE AGREED IS NOT AN OVERRUN. The two figures come out of two
          city files the city has not reconciled — the Southeast Water Pollution
          Control Plant reads $597.7 M agreed and $682.5 M paid — and printing
          them one above the other without saying so invites the one reading
          that would be a headline and is not in the data. */}
      {money && place.paid_usd > place.agreed_usd && place.n_contracts > 0 ? (
        <p className="fx-block-hint" style={{ marginTop: 6 }}>
          {t("us.sf.thecity.panel.money_over")}
        </p>
      ) : null}
      {/* The "do not add these" line is only earned when both ledgers are on
          screen. On Coit Tower, which has one payment and no contract, there is
          nothing to add and the sentence is just another line of grey. */}
      <p className="fx-block-hint" style={{ marginTop: 7 }}>
        {figuresAbove
          ? tOr(
              t,
              "us.sf.thecity.panel.money_above",
              "Its figures are under {hood} above — it is the only city place there that carries any.",
            ).replace("{hood}", figuresAbove) + " "
          : !money
            ? t("us.sf.thecity.panel.money_none") + " "
            : place.n_contracts > 0 && place.n_payees > 0
              ? t("us.sf.thecity.panel.money_ledgers") + " "
              : ""}
        {/* `next/link`, NOT an anchor. The place fiche already has a root-level
            intercepting drawer — `app/@drawer/(...)us/city/sf/places/place/
            [slug]` — and the root layout renders the slot, so this opens the
            fiche over the map with the camera and the open block behind it. A
            plain <a> is a document navigation: it bypasses the interception and
            throws the whole city away to show one building. The drawer route is
            a server component reading `loadSfPlace` off disk, so nothing here
            has to fetch or hold the fiche's data. */}
        <Link className="fx-block-jump" href={href}>
          {t("us.sf.thecity.panel.money_link").replace("{place}", place.name)}
        </Link>
      </p>
    </div>
  );
}

/** what the city as a whole holds — so a blank block has a bearing */
export interface CityRecordTotals {
  blocks: number;
  withRecord: number;
}

/** a decade never reads as full until the block holds at least this many */
const BAR_FLOOR = 4;

/** one identity for "no rows", so a null record does not churn the memos */
const EMPTY: readonly BlockDecision[] = [];
const EMPTY_GROUPS: readonly DecadeGroup[] = [];
const EMPTY_THREADS: readonly ThreadHere[] = [];

/**
 * A SILENCE, DRAWN ONCE.
 *
 * The empty decades are NOT deleted — the caption under this rail says in so
 * many words that the blank decades after 1999 are the record stopping and not
 * the city stopping, so a rail that dropped them would contradict copy that
 * ships on the same screen. But a block quiet from 1940 to 1970 drew four
 * identical blank tracks, and on the quiet blocks that was most of the rail's
 * height for one piece of information.
 *
 * So a run of two or more folds into one track carrying both its ends. A run
 * of ONE is still its own row (`railItems` returns it as a decade), because
 * `1960s–1960s` is worse than `1960s`. And a run never crosses the end of the
 * Board's scanned series, so the fainter track past it keeps meaning exactly
 * what it meant.
 */
function DecadeGap({
  run,
  t,
}: {
  run: DecadeRun;
  t: (k: string) => string;
}) {
  return (
    <div
      className="fx-block-blank"
      aria-label={tOr(
        t,
        "us.sf.thecity.panel.rail_gap_aria",
        "{range} — nothing on this block",
      ).replace("{range}", run.label)}
    >
      <div className="fx-block-head">
        {/* `.fx-block-dec` is a 34 px column sized for `1960s`, and
            `2000s–2020s` is three times that — it would spill over the track
            beside it. The range sizes to itself; what stays in its column is
            the COUNT at the right, which is the only number on the rail a
            reader compares down the page, and an empty run has none. */}
        <span
          className="fx-block-dec fx-block-dec-off"
          style={{ flex: "0 0 auto", width: "auto" }}
        >
          {run.label}
        </span>
        <span
          className="fx-block-flat"
          style={run.afterSeries ? { opacity: 0.4 } : undefined}
        />
        {run.afterSeries ? <UnscannedTag t={t} /> : <span className="fx-block-n" />}
      </div>
    </div>
  );
}

/**
 * THE BLANK PAST THE END OF THE SERIES, NAMED WHERE IT IS SEEN.
 *
 * The rail runs to the current decade on purpose — a rail that stopped where
 * the scanning stopped would tell a reader the city stopped. But the track it
 * draws past the last scanned year was an unlabelled grey line, and the only
 * thing that explained it was a caption two paragraphs down. A reader meets
 * the blank first and the explanation second, which is the wrong order for
 * the one fact on this rail that is about US and not about San Francisco.
 *
 * Two words, in the track's own row. The caption below still carries the year
 * and the reason; this only stops the blank being anonymous while the eye is
 * on it. Sized to itself for the same reason the folded range is — the count
 * column is 20 px and this is not a count.
 */
function UnscannedTag({ t }: { t: (k: string) => string }) {
  return (
    <span
      className="fx-block-dec fx-block-dec-off"
      style={{ flex: "0 0 auto", width: "auto", textAlign: "right" }}
    >
      {tOr(t, "us.sf.thecity.panel.rail_not_scanned", "not scanned")}
    </span>
  );
}

/**
 * WHAT KEEPS COMING UP HERE — and where a press of it goes.
 *
 * `build_threads.py` has been shipping `threads.json` for a while: 41 subjects
 * over 41,489 records, each one a plain regular expression over the line the
 * volume printed, each with a label and a sentence of plain English written by
 * hand. **Nothing on the site read it.** The build's own comment says what it
 * was for — *"the browser holds the records of whatever the reader is looking
 * at and can only say 'this thread is here, N times' if it can run the same
 * match the build ran"* — and that is exactly what `threadsIn` now does.
 *
 * ── WHY THIS IS NOT THE CHIPS THAT WERE DELETED ───────────────────────────
 * §c–e removed `blockSubjects` and its chips, and it was right to. Those
 * counted **the Board's own printed headings on one block**: a label like
 * `Oil Permits · 4` that means nothing outside that block, on the 34 % of
 * blocks that had one at all, and pressing it filtered the same block's rail.
 * A reader learned that a word repeated.
 *
 * These are the opposite object. The subject is **the city's**, measured over
 * every record, and the number under it is what a press will show. Pressing
 * one does not filter — it OPENS the subject: what it is in a sentence, how
 * big it is across San Francisco, when it ran, and the records here that are
 * on it. A block that is on `Libraries` is on a thing 49 other blocks are on,
 * and that is a fact about San Francisco a reader could not have got any
 * other way.
 *
 * ── THE COUNT IS OF WHAT IS ON SCREEN ─────────────────────────────────────
 * Only ever rendered for a block, a street or a door, because those hold
 * their whole record. The neighbourhood does not — its file ships twelve rows
 * a decade out of hundreds — so it gets no subjects rather than a count of a
 * selection wearing the neighbourhood's name. `threadsIn`'s doc comment is
 * the other half of this rule.
 */
function Subjects({
  here,
  flat,
  total,
  t,
}: {
  here: readonly ThreadHere[];
  /**
   * The neighbourhood's, counted in the pipeline and shipped — see
   * `HoodRecords.subjects`. They arrive as a list rather than as matches
   * because this level's file holds a SELECTION of its rows, so the browser
   * cannot match them itself without counting the selection.
   *
   * They are not pressable for the same reason: pressing one elsewhere opens
   * the records behind it, and behind these is a number whose rows are not
   * here. A chip that opens nothing is worse than a statement that says
   * something.
   */
  flat?: readonly { readonly here: ThreadHere; readonly trueN: number }[];
  /** how many records the unit on screen holds, so the share is honest */
  total: number;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  /* ── THE NEIGHBOURHOOD'S CHIPS PRESS TOO ──────────────────────────────
     > "i remmeber i could click here on the themes and it would filter but i
     > dont see this applied to every level"

     They were statements here and buttons everywhere else, on the reasoning
     that this file ships a selection so a press could not show all 97. That
     was true and the conclusion was wrong: what a press is worth is mostly
     the plain-English note and the shape across the city, neither of which
     needs the rows. So it presses, shows both, lists the ones this file does
     hold, and says how many of the 97 those are. */
  if (flat && flat.length > 0) {
    const cur = flat.find((x) => x.here.thread.s === open) ?? null;
    return (
      <>
        <div className="fx-city-ledger-head fx-block-sec">
          {tOr(t, "us.sf.thecity.panel.subjects_head", "What keeps coming up")}
        </div>
        <div className="fx-block-subjects">
          {flat.map((sj) => (
            <button
              key={sj.here.thread.s}
              type="button"
              className={`fx-block-subject${open === sj.here.thread.s ? " is-on" : ""}`}
              aria-expanded={open === sj.here.thread.s}
              onClick={() =>
                setOpen(open === sj.here.thread.s ? null : sj.here.thread.s)
              }
            >
              <span className="fx-block-subject-l">{sj.here.thread.l}</span>
              <span className="fx-block-subject-n">{nfInt.format(sj.trueN)}</span>
            </button>
          ))}
        </div>
        {cur ? (
          <SubjectOpen h={cur.here} total={total} trueN={cur.trueN} t={t} />
        ) : null}
      </>
    );
  }
  if (here.length === 0) return null;
  /* Six is the cap and it is not arbitrary: rarest-first means the tail is
     `Paving and grading`, which almost every block in the city is on. A
     seventh chip costs a row and says "this block has streets". */
  const shown = here.slice(0, 6);
  const cur = shown.find((h) => h.thread.s === open) ?? null;
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {tOr(t, "us.sf.thecity.panel.subjects_head", "What keeps coming up")}
      </div>
      <div className="fx-block-subjects">
        {shown.map((h) => (
          <button
            key={h.thread.s}
            type="button"
            className={`fx-block-subject${open === h.thread.s ? " is-on" : ""}`}
            aria-expanded={open === h.thread.s}
            onClick={() => setOpen(open === h.thread.s ? null : h.thread.s)}
          >
            <span className="fx-block-subject-l">{h.thread.l}</span>
            <span className="fx-block-subject-n">{h.rows.length}</span>
          </button>
        ))}
      </div>
      {cur ? <SubjectOpen h={cur} total={total} t={t} /> : null}
    </>
  );
}

/**
 * ONE SUBJECT, OPENED.
 *
 * Four things and no more, in the order a reader needs them: what it is, how
 * much of THIS place is on it, the shape of it across the whole city, and the
 * records themselves.
 *
 * The decade shape is the city's and is labelled the city's. It is the one
 * figure here a reader could mistake for a local one, and a bar chart with no
 * scale beside a local count would invite exactly that mistake — so the bars
 * carry the city-wide sentence directly under them and nothing else sits
 * between the two.
 */
function SubjectOpen({
  h,
  total,
  trueN,
  t,
}: {
  h: ThreadHere;
  total: number;
  /**
   * The count over the WHOLE place, where the panel holds only some of it.
   *
   * Only the neighbourhood passes this. Its subjects are counted in the
   * pipeline over every row — 97 of them — while its file ships twelve rows a
   * decade, so `h.rows` is what can be shown and 97 is what is true. Printing
   * `h.rows.length` alone would quietly restate the neighbourhood as smaller
   * than it is; printing 97 and listing nine would look broken. It says both.
   */
  trueN?: number;
  t: (k: string) => string;
}) {
  const th = h.thread;
  const peak = th.dec.reduce((m, [, n]) => Math.max(m, n), 0);
  /* EVERY decade the file carries, empty ones included. Dropping the zeroes
     drew `Blasting permits` as four fat bars with no gaps, which reads
     as a subject that ran evenly for a century. It ran 1906–1931 and then
     stopped, and the stopping is the interesting half — so an empty decade
     keeps its slot and draws nothing. */
  const span = h.y0 === h.y1 ? String(h.y0) : `${h.y0}–${h.y1}`;
  return (
    <div className="fx-block-subject-open">
      <p className="fx-block-subject-note">{th.note}</p>
      <p className="fx-block-hint">
        {trueN === undefined
          ? tOr(
              t,
              "us.sf.thecity.panel.subject_here",
              "{n} of the {all} records here, {span}.",
            )
              .replace("{n}", String(h.rows.length))
              .replace("{all}", nfInt.format(total))
              .replace("{span}", span)
          : t("us.sf.thecity.panel.subject_here_some")
              .replace("{n}", nfInt.format(trueN))
              .replace("{all}", nfInt.format(total))
              .replace("{shown}", String(h.rows.length))}
      </p>

      <div className="fx-block-subject-dec" aria-hidden>
        {th.dec.map(([d, n]) => (
          <span key={d} className="fx-block-subject-tick" title={`${d}s`}>
            <span
              className="fx-block-subject-tickbar"
              style={{
                height: n === 0 ? 0 : `${Math.max(2, Math.round((n / peak) * 26))}px`,
              }}
            />
          </span>
        ))}
      </div>
      {/* The two ends, because the bars run the whole century whatever the
          subject does. Without them a shape that stops in the 1930s reads as
          a shape that covers 1906–1931, which is the span in the sentence
          below and is not what the bars are measuring. */}
      {th.dec.length > 1 ? (
        <div className="fx-block-subject-decends" aria-hidden>
          <span>{th.dec[0][0]}s</span>
          <span>{th.dec[th.dec.length - 1][0]}s</span>
        </div>
      ) : null}
      <p className="fx-block-hint" style={NOTE}>
        {tOr(
          t,
          "us.sf.thecity.panel.subject_city",
          "Across San Francisco: {n} decisions on {b} blocks, {y0} to {y1}. The bars are the city, not this place.",
        )
          .replace("{n}", nfInt.format(th.n))
          .replace("{b}", nfInt.format(th.b.length))
          .replace("{y0}", String(th.y0))
          .replace("{y1}", String(th.y1))}
      </p>

      <FicheArchiveShelf
        docs={h.rows.slice(0, 40).map(toDoc)}
        cap={4}
        moreLabel={(n) =>
          tOr(t, "us.sf.thecity.panel.subject_more", "{n} more on {subject}")
            .replace("{n}", String(n))
            .replace("{subject}", th.l.toLowerCase())
        }
      />
    </div>
  );
}

/**
 * NEWEST FIRST, EVERYWHERE A READER IS HANDED A LIST OF RECORDS.
 *
 * > "in the fiche decades showing start in reverse chronological order, i
 * > think ppl wanna first see the more recent stuff imo, same when you open a
 * > decade always more recent first"
 *
 * The rail ran 1900s at the top and the current decade at the bottom, and
 * inside an opened decade the rows arrived in whatever order the shard
 * happened to hold them. Somebody who has just clicked their own street wants
 * to know what happened there lately, and was being handed 1907 first and the
 * present after eleven rungs of scrolling.
 *
 * DONE AT THE RENDER SITE AND NOWHERE ELSE. `decadeGroups` and `railItems`
 * keep building ascending, because their own logic depends on it — `railItems`
 * folds runs of empty decades by walking forward, and `pickHeadline` chooses a
 * decade's face out of the rows in the order it gets them, so re-sorting
 * upstream would silently move 3,645 decade headlines. A reversed COPY costs
 * one array and changes nothing but what is on screen.
 *
 * The folded silences keep reading low-to-high — `1940s–2000s` — because that
 * is a range, and a range reads the same way whichever direction the list it
 * sits in runs.
 */
function byNewest(rows: readonly BlockDecision[]): BlockDecision[] {
  return rows
    .slice()
    .sort((a, b) => b.y - a.y || (b.d ?? "").localeCompare(a.d ?? ""));
}

/**
 * WHERE YOU ARE, AND WHAT IS ONE TAP OUT.
 *
 * > "i dunno how you can make somethign explorable ya know on multiple levels
 * > and it becomes intutitive for ppl"
 * > "ok thats good one tap"
 *
 * The four levels have always been here — an address, the block, the street,
 * the neighbourhood — but MOVING between them was scattered across the panel:
 * neighbours under `Also here`, the street behind a separate button, the
 * neighbourhood behind a fold at the very bottom. A reader standing on an
 * address could not see that there was anywhere to go.
 *
 * THE COUNTS ARE THE POINT, not decoration. `259 Frederick St · 2` next to
 * `this block · 47` says, before you tap anything, that stepping out is worth
 * it — and on a busy corner it says the opposite. Without them the row is four
 * words and a reader has no reason to press any of them.
 *
 * Every rung is a real count of what pressing it will show:
 *   · the unit you are on — the rows the fiche is built from;
 *   · the block — every decision on this piece of ground;
 *   · the street — from the street index, the same number `Also here` prints;
 *   · the neighbourhood — `hood.record.n`, the same number its own page shows.
 * A rung whose count we do not have is not drawn. Nothing here is estimated.
 */
function Ladder({
  unit,
  here,
  blockN,
  street,
  hood,
  onGo,
  t,
}: {
  unit: Unit;
  here: number;
  blockN: number;
  street: { key: string; n: number } | null;
  hood: { name: string; n: number } | null;
  onGo: (u: Unit) => void;
  t: (k: string) => string;
}) {
  const rungs: {
    key: string;
    label: string;
    n: number;
    on: boolean;
    go?: () => void;
  }[] = [];

  if (unit.kind === "door") {
    rungs.push({ key: "door", label: t("us.sf.thecity.panel.ladder_here"), n: here, on: true });
  }
  rungs.push({
    key: "block",
    label: t("us.sf.thecity.panel.ladder_block"),
    n: blockN,
    on: unit.kind === "ground",
    go: () => onGo(WHOLE),
  });
  if (street) {
    rungs.push({
      key: "street",
      label: streetLabel(street.key),
      n: street.n,
      on: unit.kind === "street",
      go: () => onGo({ kind: "street", key: street.key }),
    });
  }
  if (hood) {
    rungs.push({
      key: "hood",
      label: hood.name,
      /* -1 while the neighbourhood's own file is still in flight. A rung with
         no count draws no count — never a placeholder and never the nearest
         number to hand, which is how it came to be showing rows instead of
         records. */
      n: hood.n,
      on: false,
      go: () => onGo({ kind: "hood" }),
    });
  }
  if (rungs.length < 2) return null;

  return (
    <div className="fx-block-ladder">
      {rungs.map((r, i) => (
        <span key={r.key} className="fx-block-rung-wrap">
          {i > 0 ? <span className="fx-block-rung-sep" aria-hidden>›</span> : null}
          {r.go && !r.on ? (
            <button
              type="button"
              className="fx-block-rung"
              onClick={r.go}
            >
              <span className="fx-block-rung-l">{r.label}</span>
              {r.n >= 0 ? (
                <span className="fx-block-rung-n">{nfInt.format(r.n)}</span>
              ) : null}
            </button>
          ) : (
            <span className="fx-block-rung is-on" aria-current="true">
              <span className="fx-block-rung-l">{r.label}</span>
              {r.n >= 0 ? (
                <span className="fx-block-rung-n">{nfInt.format(r.n)}</span>
              ) : null}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * THE FIRST THING A READER MEETS, AND IT IS NOW A SENTENCE.
 *
 * > "yeah its confusing, please think about a real revamp of fiche so its like
 * > wow and clear and evident to people; minimal approach and efficient"
 *
 * It used to be a pulled quote — the loudest single line the block holds, in
 * the volume's own 1918 prose, truncated. `"Garage, Finance and Oil Permits —
 * Roman Catholic Archbishop of San Francisco, at…"`. That is the record, and
 * the record is the point of this project, but it is not an ANSWER: a reader
 * who has just clicked their own street wants to know what happened there, and
 * was being handed a fragment to synthesise a century from.
 *
 * So the finding first, the record under it. Every clause is a count — see
 * `ficheOpener`, which drops a clause rather than hedging it.
 *
 * ── AND THE CENTURY AS ONE ROW ────────────────────────────────────────────
 * The decade rail is thirteen rows tall and has to be scrolled to be seen at
 * all. The same thirteen numbers are a shape 34 px high that is read at a
 * glance, and pressing one opens that decade in the rail below rather than
 * being a second way to read the same thing. The rail is not replaced — it is
 * where the reading happens. This is the map of it.
 */
/**
 * THE CENTURY AS ONE ROW.
 *
 * The decade list is thirteen rows tall and has to be scrolled to be seen at
 * all. The same thirteen numbers are a shape 34 px high that is read at a
 * glance, and pressing one opens that decade in the list below rather than
 * being a second way to read the same thing. The list is not replaced — it is
 * where the reading happens. This is the map of it.
 *
 * Shared by the block, the street, the address and the neighbourhood, because
 * a reader who learns what this row does on one level should not have to
 * learn it again on the next.
 */
function Spark({
  dec,
  onDecade,
  t,
}: {
  dec: readonly (readonly [number, number])[];
  onDecade: (d: number) => void;
  t: (k: string) => string;
}) {
  const peak = dec.reduce((m, [, n]) => Math.max(m, n), 0);
  /* A shape needs more than one decade to be a shape. Two records in 1991
     drew one bar and twelve hairlines, which says nothing the sentence above
     has not already said. */
  if (peak === 0 || dec.filter(([, n]) => n > 0).length < 2) return null;
  return (
    <>
      <div className="fx-fiche-spark">
        {dec.map(([d, n]) => (
          <button
            key={d}
            type="button"
            className={`fx-fiche-tick${n ? "" : " is-off"}`}
            title={`${d}s · ${n}`}
            aria-label={`${d}s, ${n}`}
            disabled={!n}
            onClick={() => onDecade(d)}
          >
            <span
              className="fx-fiche-tickbar"
              style={{ height: n ? `${Math.max(3, Math.round((n / peak) * 34))}px` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="fx-fiche-spark-ends" aria-hidden>
        <span>{dec[0][0]}s</span>
        <span>{t("us.sf.thecity.panel.open_tap")}</span>
        <span>{dec[dec.length - 1][0]}s</span>
      </div>
    </>
  );
}

/**
 * THE FIRST THING A READER MEETS, AND IT IS NOW A SENTENCE.
 *
 * It used to be a pulled quote — the loudest single line the block holds, in
 * the volume's own 1918 prose, truncated. That is the record, and the record
 * is the point of this project, but it is not an ANSWER: a reader who has just
 * clicked their own street wants to know what happened there, and was being
 * handed a fragment to synthesise a century from.
 *
 * So the finding first, the record under it. Every clause is a count — see
 * `ficheOpener`, which drops a clause rather than hedging it.
 */
function FicheOpen({
  open,
  onDecade,
  t,
}: {
  open: FicheOpener;
  onDecade: (d: number) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="fx-fiche-open">
      <p className="fx-fiche-say">
        {open.lead}
        {open.busiest ? ` ${open.busiest}` : ""}
        {open.about ? ` ${open.about}` : ""}
      </p>
      <Spark dec={open.dec} onDecade={onDecade} t={t} />
    </div>
  );
}

/**
 * COPY THE LINK TO WHAT IS ON SCREEN.
 *
 * The URL now carries the fiche, but a URL nobody notices is a URL nobody
 * sends — the address bar of a full-screen map is the last place a reader
 * looks. One button, beside the sources, that puts `window.location` on the
 * clipboard and says so for two seconds.
 *
 * `navigator.clipboard` needs a secure context and is refused in some frames,
 * so a failure falls back to selecting the URL in a temporary field: the
 * reader still gets it, with one more key to press, rather than a button that
 * silently does nothing.
 */
function CopyLink({ t }: { t: (k: string) => string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 2000);
    return () => window.clearTimeout(id);
  }, [done]);
  const copy = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
    } catch {
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      try {
        setDone(document.execCommand("copy"));
      } catch {
        /* nothing left to try — the reader has the address bar */
      }
      el.remove();
    }
  };
  return (
    <button type="button" className="fx-block-copy" onClick={() => void copy()}>
      {done ? t("us.sf.thecity.panel.copied") : t("us.sf.thecity.panel.copy")}
    </button>
  );
}

/**
 * WHO THE BOARD OF SUPERVISORS IS, FOR A READER WHO IS NOT FROM HERE.
 *
 * Every fiche on this map is built out of one body's minutes and no fiche ever
 * said what that body IS. A San Franciscan works it out; nobody else does, and
 * "Board of Supervisors" reads to most of the world like a committee of
 * inspectors rather than the city council.
 *
 * It is a tip on the one line that needs it, not a paragraph everybody has to
 * read past. `<details>` rather than a hover, because a hover is not a thing
 * on a phone and because the open state has to survive a reader scrolling
 * away to check something and coming back.
 */
function WhoDecides({ t }: { t: (k: string) => string }) {
  return (
    <details className="fx-who">
      <summary className="fx-who-sum">{t("us.sf.thecity.panel.who_q")}</summary>
      <p className="fx-who-body">{t("us.sf.thecity.panel.who_a")}</p>
    </details>
  );
}

function DecadeRow({
  group,
  max,
  openDecade,
  t,
}: {
  group: DecadeGroup;
  max: number;
  /** the decade a press on the sparkline asked for, if any */
  openDecade: number | null;
  t: (k: string) => string;
}) {
  const n = group.rows.length;
  const rows = useMemo(() => byNewest(group.rows), [group.rows]);
  /* Only read where there is no face to show, and it is the reason there is
     none — see `railSilence`. Memoised because it walks every row on the rung
     and the map re-renders this panel on every frame it emits. */
  const silence = useMemo(
    () => (group.headline ? null : railSilence(group.rows)),
    [group.headline, group.rows],
  );

  if (n === 0) {
    return (
      <div
        className="fx-block-blank"
        aria-label={t("us.sf.thecity.panel.rail_empty_aria").replace(
          "{decade}",
          String(group.decade),
        )}
      >
        <div className="fx-block-head">
          <span className="fx-block-dec fx-block-dec-off">{group.label}</span>
          {/* Past the end of the Board's scanned series the track is drawn
              fainter still. An empty decade inside the series is a silence the
              record observed; one after it is a decade the record never
              reached, and the two must not look the same. */}
          <span
            className="fx-block-flat"
            style={group.afterSeries ? { opacity: 0.4 } : undefined}
          />
          {group.afterSeries ? <UnscannedTag t={t} /> : <span className="fx-block-n" />}
        </div>
      </div>
    );
  }

  // The bar is scaled against the busiest decade on THIS block, with a floor
  // of BAR_FLOOR. Without the floor a block holding one decision in 1912 and
  // one in 1974 drew two full-width bars, which read as a busy block; the
  // floor makes a bar's length mean roughly "how much" rather than only "how
  // much relative to the most this quiet block ever managed".
  const pct = Math.max(4, Math.round((n / Math.max(max, BAR_FLOOR)) * 100));
  return (
    /* `key` carries the asked-for decade so React remounts the row when it
       changes — a `<details>` keeps its own open state otherwise and pressing
       the sparkline twice would leave it shut the second time. */
    <details
      className="fx-block-row"
      key={`${group.decade}:${openDecade}`}
      open={openDecade === group.decade}
    >
      <summary
        className="fx-block-sum"
        /* THE RUNG THE INDEX STOPS INSIDE SAYS ITS OWN SPAN, and it says it
           here as well as in the line under the rail: a reader on a screen
           reader never sees the caption beside the bar it qualifies. */
        aria-label={
          group.partialTo
            ? tOr(
                t,
                "us.sf.thecity.panel.rail_aria_partial",
                "{decade}s — {n} decisions on this block, {from} to {to}",
              )
                .replace("{decade}", String(group.decade))
                .replace("{n}", String(n))
                .replace("{from}", String(group.decade))
                .replace("{to}", String(group.partialTo))
            : t("us.sf.thecity.panel.rail_aria")
                .replace("{decade}", String(group.decade))
                .replace("{n}", String(n))
        }
      >
        <span className="fx-block-head">
          <span className="fx-block-dec">{group.label}</span>
          <span className="fx-block-track">
            <span className="fx-block-bar" style={{ width: `${pct}%` }} />
          </span>
          <span className="fx-block-n tnum">{n}</span>
        </span>
        {/* NO LINE, AND THE FOUR REASONS ARE NOT THE SAME SENTENCE.
            `no_line` — "the volume prints no line for this entry" — was
            printed for both, and it became false the moment `pickHeadline`
            started gating unreadable scans: the volume DOES print a line
            there, and it is the scan of it that cannot be quoted.

            Then the modern minutes landed and the damaged-scan sentence
            became the false one. `railSilence` counts the third case: every
            line on the rung is whole and readable and was CUT SHORT BY US,
            and 1,574 rungs were blaming the page for our own `…`. Its doc
            comment carries the measurement and the repair that was refused.
            The rows are all still inside the decade, openable, each linked to
            its own page, which is why offering to open them is the honest
            close in all four cases.

            The fourth, `roster`, is ours and not the record's: the rows are
            legible and we held them back — a queue of speakers, or a roll
            call — so the sentence says that rather than blaming the page.
            See `railSilence`. */}
        <span className="fx-block-line">
          {group.headline ? (
            stripFileNumber(group.headline.t)
          ) : silence === "damaged" ? (
            tOr(
              t,
              "us.sf.thecity.panel.rail_unreadable",
              "The scan of this decade's entries is too damaged to quote — open it to read them.",
            )
          ) : silence === "truncated" ? (
            tOr(
              t,
              "us.sf.thecity.panel.rail_truncated",
              "Every line this decade prints is cut short here — open it to read the entries on their scanned pages.",
            )
          ) : silence === "roster" ? (
            tOr(
              t,
              "us.sf.thecity.panel.rail_roster",
              "This decade prints only names — who spoke, or who voted. Open it to read them.",
            )
          ) : (
            t("us.sf.thecity.panel.no_line")
          )}
        </span>
        {/* THE AFFORDANCE, ON THE ROW RATHER THAN IN A HINT ABOVE THE RAIL.
            A closed <details> whose marker is suppressed is a paragraph with
            a pointer cursor: nothing on the row said it opened, and the one
            line of help above the rail was doing work each row should do for
            itself. */}
        <span className="fx-block-open">
          {t(
            n === 1
              ? "us.sf.thecity.panel.rail_open_one"
              : "us.sf.thecity.panel.rail_open",
          ).replace("{n}", String(n))}
        </span>
      </summary>
      <div className="fx-block-body">
        <FicheArchiveShelf
          docs={rows.map(toDoc)}
          cap={4}
          moreLabel={(k) =>
            t(
              k === 1
                ? "us.sf.thecity.panel.decade_more_one"
                : "us.sf.thecity.panel.decade_more",
            )
              .replace("{n}", String(k))
              .replace("{decade}", String(group.decade))
          }
        />
      </div>
    </details>
  );
}

/**
 * THE SUBJECTS, AND WHY THEY ARE BUTTONS.
 *
 * A count on its own is a fact a reader can do nothing with. The same count as
 * a filter is the synthesis: press `Stable Permits · 6` on block 3752 and the
 * rail collapses onto 1915, which is the year the city was licensing horses on
 * that block and the last year it did. Nothing is hidden by the press — the
 * count on the button says how many rows it holds, and one press clears it.
 */

/**
 * WHAT THE FICHE IS ABOUT.
 *
 * > "on making the click being a neighbourhood a street a building etc"
 * > "i dont want block nulber to show anywhere"
 *
 * The map hands over a piece of ground because ground is the only thing it can
 * draw. Ground is not a unit anybody thinks in: `ground` is the landing, and
 * the reader moves from it to a door or a street without leaving the panel or
 * fetching a page.
 */
export type Unit =
  | { readonly kind: "ground" }
  | { readonly kind: "door"; readonly key: string }
  | { readonly kind: "street"; readonly key: string }
  | { readonly kind: "hood" };

const WHOLE: Unit = { kind: "ground" };

/**
 * Below this many records a unit gets its records rather than a decade rail.
 *
 * Six because that is what fits without scrolling under the lead, and because
 * a rail over five records draws more rows of furniture than it does record:
 * every decade the unit does not touch still has to be drawn or folded, and on
 * a single address that is eleven of thirteen.
 */
const RAIL_FLOOR = 7;

/**
 * A UNIT THE PANEL WAS ASKED TO OPEN, from outside.
 *
 * Everything above resolves a unit from the CLICK — where the ground is and
 * how far in the reader was standing. The search box has no click: it knows
 * the reader typed `Guerrero St` and means the street, or typed an address
 * and means that door. So it hands the unit in.
 *
 * ── WHY A DOOR ARRIVES AS A LABEL AND NOT A KEY ───────────────────────────
 * A hood is an index, a street is a key, and both are ids the pipeline
 * publishes. A door is neither: `blockAddresses` derives the doors of a block
 * from that block's own rows, in the browser, at read time. A key shipped from
 * the search index would have to stay character-identical to that fold forever
 * or a result would open a fiche with no such door on it. So the request
 * carries what the reader saw — the label — and the panel matches it against
 * the doors it has just computed. Nothing to keep in sync, and a label that
 * fails to match still lands on the right block, which is the honest fallback.
 *
 * `nonce` is what makes asking for the same thing twice work. Picking
 * `Castro St` while already on `Castro St` is a real thing a reader does after
 * wandering off into a decade, and without it the effect would not re-fire.
 */
export type UnitRequest =
  | { readonly kind: "hood" }
  | { readonly kind: "street"; readonly key: string }
  /**
   * A street as it rides in a URL — the file-name fold, `FREDERICK_ST`.
   * Resolved against the block's OWN street keys rather than parsed, because
   * parsing would have to guess where the `|` in `FREDERICK|ST` went. A file
   * name the block does not front opens the block, which is the honest
   * fallback for a hand-edited link or a street since renamed.
   */
  | { readonly kind: "streetFile"; readonly file: string }
  | { readonly kind: "door"; readonly label: string }
  | { readonly kind: "ground" };

/**
 * ALSO HERE — the units the reader can move to, in the order they matter.
 *
 * The buildings first, because a door is the smallest and most personal thing
 * on the page; the streets after, because they are the widest. Each carries
 * its own count, so nothing here is a promise the record cannot keep: a street
 * with 401 records says 401 before it is opened. Chips that lead nowhere are
 * worse than no chips, so every row on this list opens something.
 */
function UnitChooser({
  doors,
  streets,
  unit,
  ladderKey,
  onGo,
  t,
}: {
  doors: readonly BlockAddress[];
  streets: readonly { key: string; n: number }[];
  unit: Unit;
  /** the street the ladder is already offering, so it is not offered twice */
  ladderKey: string | null;
  onGo: (u: Unit) => void;
  t: (k: string) => string;
}) {
  /* WHAT IS LEFT TO GO TO. Offering "Quesada Ave" while the fiche IS Quesada
     Ave reads as a broken control, so the open unit is not on its own list. */
  const rest = doors.filter((d) => !(unit.kind === "door" && unit.key === d.key));
  /* ── THE STREETS ARE A LINE, NOT FIVE ROWS ─────────────────────────────
     A block fronting five streets drew five full-width rows under the
     addresses, one of which the ladder was already offering two inches above.
     On an address holding two records that was nine rows of navigation under
     two rows of record.

     Addresses stay as rows — they are the fine-grained thing a reader is
     hunting for and they carry a count and a year each. The streets become
     one wrapping line, because a street is a name and a number and needs no
     more room than that. The ladder's own street is dropped from it: it is
     the one street already on screen. */
  const restStreets = streets.filter(
    (st) =>
      st.n > 0 &&
      st.key !== ladderKey &&
      !(unit.kind === "street" && unit.key === st.key),
  );
  const quiet = streets.filter((st) => st.n === 0);
  if (rest.length === 0 && restStreets.length === 0 && quiet.length === 0) {
    return null;
  }
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {tOr(t, "us.sf.thecity.panel.units_head", "Also here")}
      </div>
      {rest.length > 0 ? (
        <div className="fx-block-units">
          {rest.map((d) => (
            <button
              key={`d:${d.key}`}
              type="button"
              className="fx-block-unit"
              onClick={() => onGo({ kind: "door", key: d.key })}
            >
              <span className="fx-block-unit-l">{d.label}</span>
              <span className="fx-block-unit-n">
                {d.n}
                {d.y1 !== d.y0 ? ` \u00b7 ${d.y0}\u2013${d.y1}` : ` \u00b7 ${d.y0}`}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {restStreets.length > 0 || quiet.length > 0 ? (
        <p className="fx-block-streets">
          {restStreets.map((st, i) => (
            <span key={st.key}>
              {i > 0 ? <span className="fx-block-streets-sep"> · </span> : null}
              <button
                type="button"
                className="fx-block-street"
                onClick={() => onGo({ kind: "street", key: st.key })}
              >
                {streetLabel(st.key)}
                <span className="fx-block-street-n">{nfInt.format(st.n)}</span>
              </button>
            </span>
          ))}
          {/* A STREET WITH NO RECORD IS NOT A LINK. 332 of the 1,772 streets
              blocks name have no file, and offering one fetched a 404 and drew
              an empty street with no explanation. They are still named,
              because they are still the streets around you. */}
          {quiet.map((st, i) => (
            <span key={st.key} className="fx-block-street is-quiet">
              {restStreets.length || i > 0 ? (
                <span className="fx-block-streets-sep"> · </span>
              ) : null}
              {streetLabel(st.key)}
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}

/**
 * A NEIGHBOURHOOD, OPENED.
 *
 * It has its own decade list rather than the shared one, for one reason: the
 * file ships twelve records a decade and the decade really holds hundreds.
 * The shared list would draw its bars from the twelve and tell the reader the
 * 1920s held twelve things. Here the bar and the number are the TRUE count and
 * the records under it are what we shipped, with the difference stated.
 */
/**
 * THE PARAGRAPH — the one thing on this page we wrote.
 *
 * Everything else here is the city's own words. This is not, and it says so
 * in its own line rather than in a footnote: a reader has to be able to tell
 * at a glance which sentences the Board wrote and which we did.
 *
 * Every clause stands on a record, and those records are listed behind
 * "What this is drawn from" so any sentence can be checked against the page it
 * came from. Where a paragraph has not been written the page simply opens on
 * the record — no hedge, no placeholder.
 */
function HoodSummaryLine({
  recs,
  t,
}: {
  recs: HoodRecords;
  t: (k: string) => string;
}) {
  const [full, setFull] = useState(false);
  if (!recs.summary) return null;
  const src = recs.summary_sources ?? [];
  const read = recs.summary_read;
  /* ── IT ARRIVES CLOSED ────────────────────────────────────────────────
     > "to a user arrivign on the sheet it looks lke rambling and fills the
     > whoel space"

     He is right and it is the paragraphs' own fault. They are 300–400 words
     each, and in 252 px of column that is the entire panel: a reader who
     clicked a piece of ground meets a wall of prose before they see the
     decade list, the subjects, the count or the way back. Nothing on screen
     says how long it is or that there is anything under it.

     Four lines, and the rest on a press. The paragraphs were written with the
     thesis in the FIRST sentence — *"This is a hill, and for its first thirty
     years the record is the city trying to get streets onto it"* — so four
     lines is not a truncation, it is the claim, and everything after it is the
     evidence for that claim. A reader who wants the evidence presses; a reader
     who wants to get on with the map is already past it.

     Not a `<details>`: the paragraph has to stay visible when it is shut, and
     a closed disclosure shows nothing at all. Clamped, with the control under
     it saying which way it goes. */
  return (
    <div className="fx-hood-summary">
      <p className={`fx-hood-summary-p${full ? "" : " is-clamped"}`}>
        {recs.summary}
      </p>
      <button
        type="button"
        className="fx-hood-summary-toggle"
        aria-expanded={full}
        onClick={() => setFull((v) => !v)}
      >
        {full
          ? tOr(t, "us.sf.thecity.panel.summary_less", "Less")
          : tOr(t, "us.sf.thecity.panel.summary_more", "Read the rest")}
      </button>
      {/* was "Written by us from the records below." — and what is below it is
          the decade list, which is a SELECTION of twelve rows a decade. The
          records the paragraph actually stands on are the ones behind the
          fold directly under this line. Pointing at the wrong thing is a
          small lie in the one sentence on this panel whose whole job is to
          say which words are ours. */}
      <p className="fx-hood-summary-by">
        {tOr(
          t,
          "us.sf.thecity.panel.summary_by",
          "Written by us, out of this neighbourhood's own records.",
        )}
      </p>
      {src.length > 0 ? (
        <details className="fx-shelf-more">
          <summary>
            {tOr(t, "us.sf.thecity.panel.summary_src", "What this is drawn from")}
            {` \u00b7 ${src.length}`}
          </summary>
          <ul className="fx-hood-src">
            {src.map((r) => (
              <li key={`${r.u}:${r.for}`}>
                <span className="fx-hood-src-for">{r.for}</span>
                <a
                  className="fx-hood-src-a"
                  href={sourceHref({ u: r.u })}
                  target="_blank"
                  rel="noreferrer"
                >
                  {r.y} \u2014 {r.t} \u2197
                </a>
              </li>
            ))}
          </ul>
          {read?.full ? (
            <p className="fx-block-hint" style={NOTE}>
              {tOr(
                t,
                "us.sf.thecity.panel.summary_read",
                "Read line by line for {full}; {sampled} was sampled.",
              )
                .replace("{full}", read.full)
                .replace("{sampled}", read.sampled ?? "\u2014")}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

function HoodLevel({
  recs,
  flat,
  hood,
  hoods,
  money,
  openDecade,
  t,
}: {
  recs: HoodRecords;
  /** the pressable subjects, built in the panel — see `hoodSubjects` */
  flat?: readonly { readonly here: ThreadHere; readonly trueN: number }[];
  openDecade: number | null;
  /** the hood-facts row, for the four sections that used to sit in a fold */
  hood: HoodRecord | null;
  hoods: HoodFactsFile | null;
  money: BlockMoneyFile | null;
  t: (k: string) => string;
}) {
  /* newest decade first — see `byNewest`. Reversed here rather than in the
     file, so `hood/<i>.json` stays in the order the build wrote it. */
  const decades = recs.decades.filter((d) => d.n > 0).slice().reverse();
  const max = decades.reduce((m, d) => Math.max(m, d.n), 0);
  return (
    <>

      <Subjects here={EMPTY_THREADS} flat={flat} total={recs.n} t={t} />

      <HoodSummaryLine recs={recs} t={t} />
      <div className="fx-city-ledger-head fx-block-sec">
        {t("us.sf.thecity.panel.rail_head")}
      </div>
      {/* The block's rail says "open a decade to read it" and this one said
          nothing — thirteen bars with no invitation, and every row here is a
          `<details>` that opens onto the volume's own lines. The sentence is
          the neighbourhood's rather than the block's because what opens is a
          SELECTION and the block's is not, and a reader has to be told that
          before they open one, not after. */}
      <p className="fx-block-hint">
        {tOr(
          t,
          "us.sf.thecity.panel.hood_rail_hint",
          "Open a decade to read some of what the Board decided here.",
        )}
      </p>
      <div className="fx-block-rail" key={recs.i}>
        {decades.map((d) => {
          const pct = Math.max(4, Math.round((d.n / Math.max(max, 1)) * 100));
          return (
            /* the same markup the block's decade list uses — `fx-block-dec` is
               a 34 px LABEL, not a container, and using it as one collapsed the
               whole panel to a 34 px column */
            <details
              className="fx-block-row"
              key={`${d.decade}:${openDecade}`}
              open={openDecade === d.decade}
            >
              <summary
                className="fx-block-sum"
                aria-label={t("us.sf.thecity.panel.rail_aria")
                  .replace("{decade}", String(d.decade))
                  .replace("{n}", String(d.n))}
              >
                <span className="fx-block-head">
                  <span className="fx-block-dec">{d.decade}s</span>
                  <span className="fx-block-track">
                    <span className="fx-block-bar" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="fx-block-n">{nfInt.format(d.n)}</span>
                </span>
              </summary>
              {d.rows.length ? (
                <>
                  <FicheArchiveShelf docs={byNewest(d.rows).map(toDoc)} />
                  {d.n > d.rows.length ? (
                    <p className="fx-block-hint" style={NOTE}>
                      {tOr(
                        t,
                        "us.sf.thecity.panel.hood_some",
                        "{shown} of {n} shown \u2014 the rest are on the streets below.",
                      )
                        .replace("{shown}", String(d.rows.length))
                        .replace("{n}", nfInt.format(d.n))}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="fx-block-hint" style={NOTE}>
                  {tOr(
                    t,
                    "us.sf.thecity.panel.hood_none_readable",
                    "The scans of this decade are too damaged to quote here.",
                  )}
                </p>
              )}
            </details>
          );
        })}
      </div>

      {/* ── THE FOUR SECTIONS THAT USED TO BE A FOLD ON THE BLOCK ────────
          They were at the bottom of every block fiche, closed, under the
          heading "The neighbourhood" — four sections about somewhere else,
          below the record of the place the reader had actually clicked. The
          ladder now brings a reader HERE deliberately, so this is where they
          belong, and none of it is lost: the census provenance is the
          project's whole claim about who these numbers describe, and §19e
          measured that 16 blocks of 5,404 carry their only money figure in
          `HoodMoney`. */}
      {hood && hoods ? (
        <>
          <HoodProvenance hood={hood} file={hoods} t={t} />
          <HoodMoney hood={hood} file={hoods} money={money} t={t} />
          <HoodHighlights hood={hood} t={t} />
        </>
      ) : null}
    </>
  );
}

export default function CityBlockPanel({
  record,
  context,
  city,
  loading,
  onClose,
  onLocate,
  onFiche,
  request,
}: {
  record: BlockRecord | null;
  context: BlockContext | null;
  /** the city totals the margin already reads, so a blank block has a bearing */
  city?: CityRecordTotals;
  loading: boolean;
  onClose: () => void;
  /** take the map to this block — passed only when the map knows where it is */
  onLocate?: () => void;
  /**
   * WHAT THE URL SHOULD SAY, whenever the reader changes level.
   *
   * The panel owns the unit and the map owns the address bar, so the panel
   * reports and the map writes. It hands back what a link needs rather than
   * the internal `Unit`: a street as its KEY (the map folds it to a file
   * name) and an address as its LABEL, because a door's key is derived in the
   * browser and must never be the thing a link depends on.
   */
  onFiche?: (at: {
    readonly street?: string;
    readonly address?: string;
    readonly hood?: boolean;
  }) => void;
  /** a unit to open, asked for from outside — see `UnitRequest` */
  request?: {
    readonly req: UnitRequest;
    readonly nonce: number;
    /** the block it applies to, so the click resolver knows to stand down */
    readonly block: string;
  };
  /**
   * THE SUBJECT THE MAP HAS LIT, if any — its bit in `blocks/themes.json`,
   * its name, and the ink the map drew it in.
   *
   * The panel does not know the map has a filter and must not have to. It is
   * given the one fact it needs to answer the click it just received: the
   * reader pressed a lit mark, so say what was lit here before saying what
   * else the block holds.
   */
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /* ── WHICH UNIT THE FICHE IS ABOUT ────────────────────────────────────────
     A person thinks in a building, a street or a neighbourhood. The map can
     only hand over a piece of ground, so the ground is where a click LANDS and
     the unit is what the reader then reads. One state, and every derived thing
     below follows it, because they all read `here`.

     Cleared whenever the map hands over different ground, the same way the
     rail's open decade is (FICHE.md §4). */
  const [unit, setUnit] = useState<Unit>(WHOLE);
  const [streetRows, setStreetRows] = useState<readonly BlockDecision[]>(EMPTY);
  const [hoodRecs, setHoodRecs] = useState<HoodRecords | null>(null);
  /* 29 KB, one fetch, and it is what stops a street with no records being
     offered as a link that opens nothing. */
  const [streetIndex, setStreetIndex] = useState<StreetIndex | null>(null);
  // The two modern-fact files. One fetch each for the whole session — both are
  // memoised inside `block-records`, so a second panel does not re-request —
  // and both fail soft to null, which renders exactly what this panel rendered
  // before this section existed.
  const [facts, setFacts] = useState<BlockFactsFile | null>(null);
  const [money, setMoney] = useState<BlockMoneyFile | null>(null);
  // The third: 81 KB of rollup, one fetch for the session. The fiche is ABOUT
  // this file now, so it is loaded on the same terms as the other two and
  // fails just as soft — a missing file leaves the block fiche §9-§14 shipped.
  const [hoods, setHoods] = useState<HoodFactsFile | null>(null);
  /* The judged leads — a few KB, one fetch, and a miss simply falls back. */
  const [picks, setPicks] = useState<BlockLeadPicks | null>(null);
  /* 263 KB of subjects, one fetch for the session, and the same soft failure
     as the rest: a missing file renders the panel exactly as it read before
     `Subjects` existed. */
  const [threads, setThreads] = useState<ThreadsFile | null>(null);
  /* 6 KB — the table that says what a row's subject bitmask means. Without it
     the masks on every row are unreadable and the section draws nothing. */
  const [subjects2, setSubjects2] = useState<SubjectsFile | null>(null);
  /* The T0 index, already fetched and memoised by the map. It is read for ONE
     number: the last year the shipped shards actually place anything, which is
     what the rail's own treatment follows. */
  const [index, setIndex] = useState<BlockIndex | null>(null);

  useEffect(() => {
    let live = true;
    void loadBlockFacts().then((f) => {
      if (live) setFacts(f);
    });
    void loadBlockMoney().then((m) => {
      if (live) setMoney(m);
    });
    void loadHoodFacts().then((h) => {
      if (live) setHoods(h);
    });
    void loadBlockLeadPicks().then((k) => {
      if (live) setPicks(k);
    });
    void loadStreetIndex().then((ix) => {
      if (live) setStreetIndex(ix);
    });
    void loadThreads().then((th) => {
      if (live) setThreads(th);
    });
    void loadSubjects().then((sj) => {
      if (live) setSubjects2(sj);
    });
    /* `loadBlockIndex` rejects rather than failing soft, and a panel is not
       the right place to surface that: the map has already reported it. A
       failure leaves `index` null and `indexedLastYear` falls back. */
    void loadBlockIndex()
      .then((ix) => {
        if (live) setIndex(ix);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Escape closes, and focus lands on the panel when it opens — the same
  // behaviour the routed drawers have, without the route.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A block with nothing of its own opens the street section itself. 401 of
  // the 5,404 blocks are in that state — clickable, with everything the record
  // holds nearby sitting one fold down — and leaving it shut hands the reader
  // a panel with one sentence in it and a closed disclosure.
  useEffect(() => {
    // A new block starts at the top of its own record. The panel does not
    // remount between picks — same component, new props — so without this a
    // reader who scrolled to the 1970s on one block and then clicked another
    // on the map landed halfway down a fiche they had never seen the top of.
    // The scroller is the ledger column, which belongs to `CityMap`; it is
    // reached by class with a parent fallback rather than edited (FICHE.md §4).
    const host =
      panelRef.current?.closest(".fx-city-ledger") ?? panelRef.current?.parentElement;
    if (host instanceof HTMLElement) host.scrollTop = 0;
    /* An open door does not survive a new block — the same bug the rail's open
       decade had (FICHE.md §4). The panel keeps its state across picks, so
       without this a reader who opened 2707 Twenty-first Street would meet the
       next block already narrowed to an address that is not on it. */
    /* ── WHAT A CLICK MEANS, BY HOW CLOSE THE READER IS ──────────────────
       The map can only hand over a patch of ground. What the reader was
       ASKING for depends on how far in they were standing:

         whole city / district  →  the neighbourhood
         a few streets          →  the street the record knows best here
         one street             →  the building, where the record names one

       The patch of ground is never the destination — it is how the map
       answers "where". It stays reachable as "everything here". */
    setStreetRows(EMPTY);
    setHeld(null);
    setOpenDecade(null);
    /* NOT `setHoodRecs(null)` any more. The neighbourhood's file is keyed on
       `context`, which changes whenever the block does, so its own effect
       already clears and re-fetches it — and this line ran AFTER that fetch
       resolved, leaving the ladder with no count at all. */
    setUnit(WHOLE);
    /* WAS also pre-opening a fold of the surrounding streets on a block with
       no record of its own. That fold is gone: an empty block now says so and
       the streets are one tap away in `Also here`, opened properly rather
       than unfolded in place. */
  }, [record?.blockId, record?.decisions.length, record?.streets.length]);

  // `record?.decisions ?? []` builds a new array on every render, and a new
  // array is a new dependency, so the shape was recomputed on every frame the
  // map emitted while the panel was open.
  const all = useMemo(() => record?.decisions ?? EMPTY, [record]);

  /* ── THE DOORS ────────────────────────────────────────────────────────────
     Nobody thinks "block 4087". They think *my building*. The addresses the
     record names here are a SUBSET of this block's own records, so opening one
     needs no fetch and no route: it narrows `here`, and every derived thing
     below — the lead, the rail, the figures, the shelf — narrows with it,
     because all of them read `here` and nothing reads `record.decisions`.

     The block does not stop existing; it stops being the destination. */
  const doors = useMemo(() => blockAddresses(all), [all]);
  /* WHERE YOU ARE, IN STREETS. The assessor's number is how this pipeline
     addresses a piece of ground and it is not how anybody describes where they
     are. `s[]` already ships the streets the block fronts; 0.6 % of blocks
     front none and those fall back to the neighbourhood. */
  /* Resolve the click to a unit as soon as the ground's record arrives. Only
     ever moves AWAY from the ground, never overrides a reader's own choice —
     it is keyed on the block id, so picking a different unit and then coming
     back does not re-resolve. */
  /* Declared here rather than beside its own effects because the click-based
     resolver directly below reads it, and a dependency array is evaluated
     during render. */
  const [pending, setPending] = useState<UnitRequest | null>(null);
  const reqNonce = useRef(-1);
  /** the last request nonce the click resolver stood down for */
  const autoSkipped = useRef(-1);

  const resolvedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = record?.blockId;
    if (!id || !context || resolvedFor.current === id) return;
    /* ── A REQUEST BEATS THE ZOOM, AND IT IS KEYED ON THE BLOCK ───────────
       This effect turns "where the reader was standing" into a unit. When the
       unit was ASKED for — the search box knows the reader typed a street
       name — there is nothing to infer, and inferring anyway overwrites the
       answer a moment after showing it.

       THE FIRST VERSION OF THIS GUARD READ `pending` AND WAS WRONG. A request
       for anything but a door resolves the instant it arrives, so `pending`
       was back to null by the time the block's record landed — and then this
       ran and replaced the street the reader typed with the busiest street on
       the block. Measured: searching `Castro St` opened 17th St.

       The request carries the block it is FOR, which the caller has, so the
       stand-down is a fact about this block rather than a race with a flag. */
    if (request && request.block === id && autoSkipped.current !== request.nonce) {
      autoSkipped.current = request.nonce;
      resolvedFor.current = id;
      return;
    }
    resolvedFor.current = id;
    const stop = context.zoomStop ?? -1;
    const stops = 4; // whole city · district · a few streets · one street
    if (stop >= 0 && stop <= 1) {
      setUnit({ kind: "hood" });
      return;
    }
    if (stop >= stops - 1) {
      // standing on one street: the reader means a building if the record
      // names one here, and the street if it does not
      const doors = blockAddresses(record.decisions);
      if (doors.length) {
        setUnit({ kind: "door", key: doors[0].key });
        return;
      }
    }
    if (stop >= 2) {
      const best = (record.streets ?? [])
        .map((k) => ({ k, n: streetRecordCount(streetIndex, k) }))
        .sort((a, b) => b.n - a.n)[0];
      if (best && best.n > 0) setUnit({ kind: "street", key: best.k });
    }
    /* `pending` is read to stand DOWN, never to act, and the guard above
       already returned if it was set — but it is a dependency all the same,
       because an effect that reads a value and is not re-run when it changes
       is the bug this rule exists to catch. Re-running is harmless: the
       `resolvedFor` guard makes every run after the first a no-op. */
  }, [record, context, streetIndex, request]);

  /* ── A UNIT ASKED FOR FROM OUTSIDE ─────────────────────────────────────
     Held in state rather than applied on arrival, because a door cannot be
     resolved until the block's record has landed and its doors have been
     read out of it. The request waits, the effect below retries whenever the
     record or the doors change, and it clears itself the moment it lands. */
  useEffect(() => {
    if (!request || request.nonce === reqNonce.current) return;
    reqNonce.current = request.nonce;
    setPending(request.req);
  }, [request]);

  useEffect(() => {
    if (!pending) return;
    /* ── EVERY REQUEST WAITS FOR THE RECORD, NOT ONLY A DOOR ──────────────
       A door has to wait because its key is derived from the block's own
       rows. The other three do not — and resolving them the instant they
       arrived is what made the first version of this fail.

       There is an effect above, keyed on `record.blockId`, that clears the
       unit back to the whole block every time the map hands over new ground.
       A request resolved before the record landed was therefore applied and
       then wiped a moment later, and the fiche opened on the block. Measured:
       searching `Castro St` opened the block's street list, not the street.

       Waiting puts both in the same commit, and this effect is declared after
       the reset, so React runs the reset first and this second. The requested
       unit is the one that survives. */
    if (!record) return;
    if (pending.kind === "streetFile") {
      const key = streetKeyFromFile(pending.file, record.streets);
      setUnit(key ? { kind: "street", key } : WHOLE);
      setPending(null);
      return;
    }
    if (pending.kind !== "door") {
      setUnit(pending.kind === "ground" ? WHOLE : pending);
      setPending(null);
      return;
    }
    const want = pending.label.toLowerCase();
    const hit = doors.find((d) => d.label.toLowerCase() === want);
    setUnit(hit ? { kind: "door", key: hit.key } : WHOLE);
    setPending(null);
  }, [pending, record, doors]);

  /* ── THE NEIGHBOURHOOD'S OWN FILE, WHENEVER THE HOOD IS KNOWN ─────────
     It used to be fetched only when the reader opened the neighbourhood. The
     ladder needs its COUNT before that, and the count it reached for instead
     — `hood-facts.record.n` — is the wrong number: it is ROWS, and a record
     printed at a corner is stored on every block that corner touches.
     Measured citywide, `record.n` sums to 101,662 against 41,489 distinct
     records, so it overstates every neighbourhood by about 2.4x. Haight
     Ashbury read 2,002 in the ladder and 833 on its own page, two taps apart.
     One fetch, memoised for the session, and the two now agree. */
  useEffect(() => {
    if (context == null || context.hoodIndex < 0) return;
    let live = true;
    setHoodRecs(null);
    void loadHoodRecords(context.hoodIndex).then((r) => {
      if (live) setHoodRecs(r);
    });
    return () => {
      live = false;
    };
  }, [context]);

  useEffect(() => {
    if (unit.kind !== "street") return;
    let live = true;
    setStreetRows(EMPTY);
    void loadStreetRecord(unit.key).then((rows) => {
      if (live) setStreetRows(rows);
    });
    return () => {
      live = false;
    };
  }, [unit]);

  const placeName = useMemo(
    () => blockPlaceName(record?.streets ?? []),
    [record?.streets],
  );
  const openDoor =
    unit.kind === "door" ? (doors.find((d) => d.key === unit.key) ?? null) : null;
  /* THE ONE SWITCH. `here` is what the lead, the rail, the figures, the
     silence line and the shelf all read, so narrowing it to a door or widening
     it to a street re-reads the whole fiche with no other change. A street's
     rows arrive from its own file and are EMPTY until they do, which draws the
     loading state the panel already has rather than an empty street. */
  const here =
    unit.kind === "door"
      ? (openDoor?.rows ?? EMPTY)
      : unit.kind === "street"
        ? streetRows
        : all;
  /* The streets this block fronts. The count is shown only where the street's
     own file has already been fetched — the streets section fetches them when
     it opens — so the chooser never states a number it has not read. Where it
     has none it offers the street plainly instead of printing a zero. */
const onHood = unit.kind === "hood";
  /* few enough records that a decade rail would draw more furniture than
     record — see `RAIL_FLOOR` */
  const thin = here.length > 0 && here.length < RAIL_FLOOR;
  /** the street the reader arrived on — see `ladderStreet` */
  const [held, setHeld] = useState<string | null>(null);
  /** the decade a press on the sparkline opened, so the rail can obey it */
  const [openDecade, setOpenDecade] = useState<number | null>(null);

  /* ── THE SUBJECTS THAT RUN THROUGH THIS UNIT ───────────────────────────
     `here` is the record of whatever the reader is on, so the match runs over
     the same rows the rail below is built from and the count under a chip is
     the count of what a press will show. Recomputed only when the rows or the
     file change — 41 patterns over a few hundred lines is nothing, but it is
     nothing done on every keystroke otherwise.

     NOT on the neighbourhood: `hoodRecs` is a selection by construction and a
     count of it would be a count of twelve rows a decade wearing the
     neighbourhood's name. See `threadsIn`'s doc comment. */
  const subjects = useMemo(
    () => (onHood ? [] : threadsIn(threads, subjects2, here)),
    [threads, subjects2, here, onHood],
  );

  /* The streets around here, each with what it actually holds. The count is
     read from the index rather than waited for, so nothing shows a placeholder
     and nothing is offered that opens an empty page. */
  const unitStreets = useMemo(
    () =>
      (record?.streets ?? []).map((key) => ({
        key,
        n: streetRecordCount(streetIndex, key),
      })),
    [record?.streets, streetIndex],
  );
  /* ── THE STREET RUNG ──────────────────────────────────────────────────
     For an address it is the street the address is ON, matched by the
     address's own label ending in the street's name — `259 Frederick St`
     ends with `Frederick St`. Not the block's busiest street, which on a
     corner is a different street and would send the reader somewhere they
     did not ask about. Anywhere else it is the street this block holds the
     most on, which is the same one the click resolver picks. */
  const ladderStreet = useMemo(() => {
    const withRecords = unitStreets.filter((st) => st.n > 0);
    if (!withRecords.length) return null;
    if (unit.kind === "street") {
      return withRecords.find((st) => st.key === unit.key) ?? null;
    }
    if (unit.kind === "door") {
      const label = (openDoor?.label ?? "").toLowerCase();
      const on = withRecords.find((st) =>
        label.endsWith(streetLabel(st.key).toLowerCase()),
      );
      if (on) return on;
    }
    /* ── THE STREET YOU ARRIVED ON, NOT THE BUSIEST ───────────────────────
       Standing on 259 Frederick St the rung read `Frederick St`; pressing
       `this block` silently changed it to `Clayton St`, because the block
       level fell back to whichever street the block holds the most on. The
       reader was reading about Frederick and the panel changed the subject
       one tap in, which is the fastest way to make four levels feel
       arbitrary. `held` remembers the street the reader came in on and is
       cleared when the map hands over different ground. */
    const kept = held && withRecords.find((st) => st.key === held);
    if (kept) return kept;
    return withRecords.slice().sort((a, b) => b.n - a.n)[0] ?? null;
  }, [unitStreets, unit, openDoor?.label, held]);
  const unitName =
    unit.kind === "door"
      ? (openDoor?.label ?? null)
      : unit.kind === "street"
        ? streetLabel(unit.key)
        : unit.kind === "hood"
          ? (hoodRecs?.name ?? context?.hood ?? null)
          : null;
  /* WHAT THE INDEX REACHES vs WHAT THE SHELF REACHES — two numbers, and the
     rail may not confuse them. `indexedLast` is the last year these shards
     place anything and it decides which decades draw as unrecorded; the
     caption underneath cites `SERIES_LAST_YEAR`, the last year the Internet
     Archive's scanned series covers. They converge when the ingest re-runs. */
  const indexedLast = indexedLastYear(index);
  const shape = blockShape(here, indexedLast);
  /* `blockLead`/`judgedLead` are no longer read: the fiche opens on the
     FINDING now, not on the loudest line. Both stay in `block-records` with
     their tests — what they know about picking a line worth pulling is what
     `ficheOpener` would need if a quote ever comes back. */
  /* memoised because `ficheOpener` depends on it and a fresh array every
     render would rebuild the opening sentence on every frame the map emits */
  const groups = useMemo(
    () => (here.length > 0 ? decadeGroups(here, indexedLast) : EMPTY_GROUPS),
    [here, indexedLast],
  );
  const max = groups.reduce((m, g) => Math.max(m, g.rows.length), 0);
  /* The one rung the index stops inside, and only when this block has rows on
     it — the caption qualifies a bar, so it is not printed where there is no
     bar to qualify. `decadeGroups` guarantees at most one. */
  const partial = groups.find((g) => g.partialTo !== null && g.rows.length > 0) ?? null;
  // Both are keyed on the block id, and both are read only when the file has
  // actually arrived — a block with no row in either simply draws neither
  // section rather than a heading over nothing.
  const now = facts && context ? blockNow(facts, context.id) : null;
  const places = money && context ? blockPlaces(money, context.id) : [];
  // Joined on the INDEX the map itself publishes, never on the name — one
  // membership on this map, and no second one able to disagree with it.
  /* whatever street the reader is on — typed, tapped or resolved from the
     address they opened — is the one the ladder keeps offering until the map
     hands over different ground */
  useEffect(() => {
    if (unit.kind === "street") setHeld(unit.key);
    else if (unit.kind === "door" && ladderStreet) setHeld(ladderStreet.key);
  }, [unit, ladderStreet]);

  const hood = hoods && context ? hoodAt(hoods, context.hoodIndex) : null;
  /* the count is the neighbourhood's OWN file, never `hood.record.n` — see
     the fetch above for why those two are different numbers */
  const ladderHood = useMemo(
    () =>
      hoodRecs
        ? { name: hoodRecs.name, n: hoodRecs.n }
        : hood
          ? { name: hood.name, n: -1 }
          : null,
    [hoodRecs, hood],
  );
  /* the ladder draws only when it has somewhere to send you — see `Ladder`,
     which returns null under two rungs. `← Back` fills in when it does not. */
  /**
   * ── ONE OPENER, WHATEVER THE LEVEL ──────────────────────────────────
   * The block and the neighbourhood each used to assemble their own, in two
   * different branches of the render, which is how the neighbourhood came to
   * be missing three sections the others had. There is one, and the only
   * difference between the levels is WHERE ITS NUMBERS COME FROM:
   *
   *   · a block, a street and an address hold their whole record, so the
   *     span and the busiest decade are read off the rows themselves and the
   *     subjects are matched in the browser;
   *   · a neighbourhood's file ships twelve rows a decade out of hundreds, so
   *     its count comes from that file's own total, its span from
   *     `hood-facts` (a decade is a bucket, not a span — §28c), and its
   *     subjects are counted in the pipeline and shipped.
   */
  const words = useMemo(
    () => ({
      many: t("us.sf.thecity.panel.open_many"),
      oneYear: t("us.sf.thecity.panel.open_one_year"),
      one: t("us.sf.thecity.panel.open_one"),
      busiest: t("us.sf.thecity.panel.open_busiest"),
      mostly: t("us.sf.thecity.panel.open_mostly"),
      among: t("us.sf.thecity.panel.open_among"),
      and: t("us.sf.thecity.panel.open_and"),
    }),
    [t],
  );

  const hoodOpener = useMemo(() => {
    if (!hoodRecs || !hood?.record?.y0 || !hood.record.y1) return null;
    const live = hoodRecs.decades.filter((d) => d.n > 0);
    if (!live.length) return null;
    return ficheOpener(
      {
        n: hoodRecs.n,
        firstYear: hood.record.y0,
        lastYear: hood.record.y1,
        busiest: live.reduce((a, b) => (b.n > a.n ? b : a), live[0]),
        quietAfter: null,
      },
      hoodRecs.decades.map((d) => ({
        decade: d.decade,
        label: `${d.decade}s`,
        rows: new Array(d.n),
        headline: null,
        afterSeries: false,
        partialTo: null,
      })) as unknown as DecadeGroup[],
      [],
      words,
    );
  }, [hoodRecs, hood, words]);

  /* the finding, from counts already computed — see `ficheOpener` */
  const blockOpener = useMemo(
    () =>
      ficheOpener(shape, groups, subjects, {
        many: t("us.sf.thecity.panel.open_many"),
        oneYear: t("us.sf.thecity.panel.open_one_year"),
        one: t("us.sf.thecity.panel.open_one"),
        busiest: t("us.sf.thecity.panel.open_busiest"),
        mostly: t("us.sf.thecity.panel.open_mostly"),
        among: t("us.sf.thecity.panel.open_among"),
        and: t("us.sf.thecity.panel.open_and"),
      }),
    [shape, groups, subjects, t],
  );
  const opener = onHood ? hoodOpener : blockOpener;

  /**
   * THE NEIGHBOURHOOD'S SUBJECTS, MADE PRESSABLE.
   *
   * Its counts are the pipeline's — over every row — and its ROWS are the
   * twelve a decade this file ships. So the two halves come from two places
   * and are kept apart on purpose: `trueN` is what the neighbourhood holds,
   * `here.rows` is what can be shown, and `SubjectOpen` prints both rather
   * than letting either stand for the other.
   */
  const hoodSubjects = useMemo(() => {
    if (!threads || !hoodRecs?.subjects?.length) return undefined;
    const rows = hoodRecs.decades.flatMap((d) => d.rows);
    const out: { here: ThreadHere; trueN: number }[] = [];
    for (const sj of hoodRecs.subjects) {
      const th = threads.threads.find((x) => x.l === sj.l);
      if (!th) continue;
      const hits = threadRows(th, rows);
      const ys = hits.map((r) => r.y).filter(Boolean);
      out.push({
        trueN: sj.n,
        here: {
          thread: th,
          rows: hits,
          y0: ys.length ? Math.min(...ys) : 0,
          y1: ys.length ? Math.max(...ys) : 0,
        },
      });
    }
    return out.length ? out : undefined;
  }, [threads, hoodRecs]);

  /* report the level to whoever owns the address bar. `openDoor` is read
     rather than `unit.key` because a link carries the door's LABEL. */
  const ficheRef = useRef(onFiche);
  ficheRef.current = onFiche;
  useEffect(() => {
    const at =
      unit.kind === "hood"
        ? { hood: true }
        : unit.kind === "street"
          ? { street: unit.key }
          : unit.kind === "door" && openDoor
            ? { address: openDoor.label }
            : {};
    ficheRef.current?.(at);
  }, [unit, openDoor]);

  const hasLadder =
    (unit.kind === "door" ? 1 : 0) + 1 + (ladderStreet ? 1 : 0) + (ladderHood ? 1 : 0) >= 2;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={
        context
          ? t("us.sf.thecity.panel.aria").replace("{id}", context.id)
          : t("us.sf.thecity.panel.kicker")
      }
      className="fx-city-panel"
    >
      <div className="fx-city-panel-head">
        <div>
          {/* > "right now it says block but also neighborhood and theres lots
              > of info, please less is more, really focus on only the
              > essential stuff a fiche needs"

              THE FICHE IS THE BLOCK. It had been the other way round — the
              neighbourhood's name as the title, the block as a small line
              under it — and that is exactly the reading a reader who clicked
              one shape and got two subjects is describing. The kicker is
              where CONTEXT goes: it carries the neighbourhood's own name, so
              nothing is lost and the reader is still told where they are, one
              size down from the thing they asked about. */}
          {/* WHEN A DOOR IS OPEN THE FICHE IS THE ADDRESS, not the block.
              The block does not vanish — it moves up into the kicker, where
              the neighbourhood already lives, so the reader keeps their
              bearings and the title is the thing they actually asked for. */}
          {/* The neighbourhood is always the kicker, and the ground the reader
              landed on joins it once they have gone deeper — so a door or a
              street still says which piece of the city it belongs to. */}
          {/* The neighbourhood's name has always been up here. Now it opens
              the neighbourhood, which is the third of the three things a
              person thinks in. It is a button only when there is somewhere to
              go — on the neighbourhood itself it is plain text. */}
          {unit.kind !== "hood" && context ? (
            <button
              type="button"
              className="fx-city-panel-kicker fx-block-kicker-go"
              onClick={() => setUnit({ kind: "hood" })}
            >
              {hood ? hood.name : context.hood}
            </button>
          ) : (
            <span className="fx-city-panel-kicker">
              {t("us.sf.thecity.panel.kicker")}
            </span>
          )}
          <h2 className="fx-city-panel-title">
            {unitName ?? placeName ?? hood?.name ?? context?.hood ?? "\u2014"}
          </h2>
          {unit.kind === "ground" && context && context.areaM2 > 0 ? (
            <p className="fx-place-sub" style={{ margin: "2px 0 0" }}>
              {t("us.sf.thecity.panel.area").replace(
                "{n}",
                nfInt.format(Math.round(context.areaM2)),
              )}
            </p>
          ) : null}
          {onLocate ? (
            <button type="button" className="fx-block-locate" onClick={onLocate}>
              {t("us.sf.thecity.panel.locate")}
            </button>
          ) : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="fx-city-panel-close"
          onClick={onClose}
          aria-label={t("us.sf.thecity.panel.close")}
        >
          ×
        </button>
      </div>

      <div className="fx-city-panel-body">
        {/* ── THE RECORD LEADS, THE RAIL IS THE SPINE, THE FIGURES CLOSE ──
            > "maybe focusing exclusively on the fiches and their content per
            > block, right now its a hodgepodge, id want to be able to show
            > what happens when you click and it looks cool, interesting,
            > relevant and focused"

            Three kinds of thing are on this panel and nothing else: **a
            quotation from the record, a control, and a number with a label.**
            Every sentence we wrote is gone from the body — the "In short"
            paragraph, the provenance, the coverage ratio, the money
            explanation — and none of it is deleted: it is one fold down, in
            `BlockSources`, with its links.

            The order is the argument. The Board's own printed line first,
            because it is the only thing on this map nobody else has and the
            only thing a reader can open a scan of. The decade rail second,
            because opening a decade and getting its records IS the
            interaction. The figures last, because they are the context for
            what was read, not the reason to read it.

            THE ONE EXCEPTION TO "no sentences": the honest floor lines under
            the rail. *"The Board's Journal is scanned to 1999"* is what stops
            a blank decade reading as a decade the city did nothing in, and it
            has to be beside the blank it explains, not behind a fold. It is
            set muted and small. */}
        {/* ── WHAT EVERY LEVEL HAS, RENDERED ONCE ──────────────────────
            > "shouldnt it be that all these fiches use common components that
            > then according the the specific case get inserted or not?"

            It should, and it did not: `Ladder`, `FicheOpen` and `WhoDecides`
            were each written out twice, once in the neighbourhood's branch and
            once in the block's. Keeping two copies in step is a thing nobody
            does, which is why the neighbourhood quietly ended up without a
            finding, without a shape row and without the tip while the other
            three had all three.

            They are here, above the branch, and the branch below is only what
            genuinely differs: which records a level shows and how it counts
            its subjects. Anything a level does not have, it does not pass. */}
        {!loading ? (
          <>
            <Ladder
              unit={unit}
              here={onHood ? (hoodRecs?.n ?? 0) : here.length}
              blockN={all.length}
              street={ladderStreet}
              hood={ladderHood}
              onGo={setUnit}
              t={t}
            />
            {!hasLadder && unit.kind !== "ground" ? (
              <button
                type="button"
                className="fx-block-jump fx-block-back"
                onClick={() => setUnit(WHOLE)}
              >
                {tOr(t, "us.sf.thecity.panel.unit_back", "\u2190 Back")}
              </button>
            ) : null}
            {opener ? (
              <FicheOpen open={opener} onDecade={setOpenDecade} t={t} />
            ) : null}
            {opener ? <WhoDecides t={t} /> : null}
          </>
        ) : null}

        {loading ? (
          <p className="fx-fiche-note">{t("us.sf.thecity.panel.loading")}</p>
        ) : unit.kind === "hood" ? (
          /* The neighbourhood has its own body: its decade counts are the real
             ones and the records under them are a selection, which the shared
             decade list cannot say. Everything below it — the streets, the
             neighbourhood summary, the sources — is unchanged. */
          <>
            {hoodRecs ? (
              <HoodLevel
                recs={hoodRecs}
                flat={hoodSubjects}
                hood={hood}
                hoods={hoods}
                money={money}
                openDecade={openDecade}
                t={t}
              />
            ) : (
              <p className="fx-fiche-note">{t("us.sf.thecity.panel.loading")}</p>
            )}
          </>
        ) : shape ? (
          <>
            {/* ── THE FINDING, THEN THE RECORD ─────────────────────────
                The pulled quote used to be here and it is gone. It was the
                loudest single line the place holds, in the volume's own
                prose, truncated — the record rather than an answer, handed to
                a reader who had just clicked their own street. The sentence
                above it says what happened; the record below says it in the
                city's own words, which is the order those two belong in.

                `BlockLead` is not deleted: nothing else renders it today, and
                what it knows about picking a line worth pulling is the thing
                `ficheOpener` would need if this ever wants a quote back. */}
            {/* What this place keeps being about, as something to press. The
                sentence above already NAMES the biggest of these; these are
                how a reader opens one and sees it across the whole city. */}
            <Subjects here={subjects} total={here.length} t={t} />

            {/* ── A FEW RECORDS ARE NOT A CENTURY ──────────────────────────
                > "why not the decades with decision first then saying other
                > places on that street"

                259 Frederick St holds two decisions, both in 1991, and it
                was drawing the full rail for them: `2000s–2020s` folded,
                `1990s · 2`, `1900s–1980s` folded, then two lines about the
                scanned series. Three rows of furniture and one row of
                record, and the reader has to open the one row to reach it.

                The rail is a shape, and a shape needs something to be a
                shape OF. Under `RAIL_FLOOR` records there is no shape to
                show — so the records are simply printed, newest first, open.
                The rail earns its place on the block with 120 and not on the
                address with two. */}
            {thin ? (
              <>
                {/* NOT "Decade by decade" — there are no decades here, there
                    are two records. The heading is the one the pulled quote
                    used, because this list is now doing that job. */}
                <div className="fx-city-ledger-head fx-block-sec">
                  {t("us.sf.thecity.panel.lead_head")}
                </div>
                <FicheArchiveShelf docs={byNewest(here).map(toDoc)} cap={6} />
              </>
            ) : (
              <>
                <div className="fx-city-ledger-head fx-block-sec">
                  {t("us.sf.thecity.panel.rail_head")}
                </div>
                <p className="fx-block-hint">{t("us.sf.thecity.panel.rail_hint")}</p>
                <div className="fx-block-rail" key={record?.blockId ?? "-"}>
                  {/* newest rung at the top — see `byNewest`. A reversed COPY:
                      `railItems` walks forward to fold its silences and must
                      keep getting them in order. */}
                  {railItems(groups).slice().reverse().map((it) =>
                    it.kind === "gap" ? (
                      <DecadeGap key={`g${it.run.from}`} run={it.run} t={t} />
                    ) : (
                      <DecadeRow
                        key={it.group.decade}
                        group={it.group}
                        max={max}
                        openDecade={openDecade}
                        t={t}
                      />
                    ),
                  )}
                </div>
              </>
            )}

            {/* AFTER the record, not before it. A reader who opened one
                address wants what happened at it; the neighbours are where
                they go next, not what they came for. */}
            <UnitChooser
              doors={doors}
              streets={unitStreets}
              unit={unit}
              ladderKey={ladderStreet?.key ?? null}
              onGo={setUnit}
              t={t}
            />
            {/* ── THE LAST RUNG IS SEVEN YEARS, AND IT HAS TO SAY SO ──────
                The ingest of the Board's modern minutes carried the index to
                2016, so the rail's last rung is the 2010s and it holds
                2010–2016. A reader comparing its bar against the 1920s is
                comparing seven years with ten, and nothing on the rail said
                that. One line, and only where there is a rung on this block
                for it to qualify — the count of years comes off `partialTo`,
                so an index that later reaches 2019 stops printing it with no
                code change. */}
            {partial && !thin ? (
              <p className="fx-block-hint" style={NOTE}>
                {tOr(
                  t,
                  "us.sf.thecity.panel.rail_partial_tail",
                  "The {decade}s above is not a full decade — it covers {from}–{to}.",
                )
                  .replace("{decade}", String(partial.decade))
                  .replace("{from}", String(partial.decade))
                  .replace("{to}", String(partial.partialTo))}
              </p>
            ) : null}
            {/* THE BLOCK'S OWN SILENCE, and the SERIES's silence. Two
                different facts and they were once one hedge printed twice;
                both are captions on the rail because both are facts about the
                rail. Kept visible on purpose — an absence that reads as a zero
                is the failure these two lines exist to prevent, and it matters
                most on exactly the block a journalist checks. */}
            {shape.quietAfter ? (
              <p className="fx-block-hint" style={NOTE}>
                {(unit.kind !== "ground"
                  ? tOr(
                      t,
                      "us.sf.thecity.panel.shape_quiet_door",
                      "Nothing lands at this address after {y}.",
                    )
                  : t("us.sf.thecity.panel.shape_quiet")
                ).replace(
                  "{y}",
                  String(shape.quietAfter),
                )}
              </p>
            ) : null}
            {/* ── THE CAPTION THAT WAS FALSE ──────────────────────────────
                It read: *"The Board's Journal is scanned to 1999. The decades
                after it are blank because the record stops there, not because
                the city stopped deciding."* **The record did not stop.** The
                series was renamed three times and a title search found 93
                years of 110. Blaming the record for a gap that was ours is the
                one direction this project cannot be wrong in, and it was on
                screen.

                Two sentences, and which one prints is decided by whether the
                shards have caught up with the shelf — never asserted. While
                this index reaches 1999 and the Archive reaches 2016, saying
                only "scanned through 2016" would contradict the unrecorded
                band drawn directly above it.

                **THE INGEST LANDED (`91de7fa0`) AND THE FIRST SENTENCE NOW
                PRINTS**, exactly as this comment said it would and with no
                code change. It was reworded once, to put what stopped in the
                opening clause rather than the project's own backstory: the
                blank track above it is now tagged `not scanned`, and the two
                have to agree at a glance. */}
            {/* ── THE CAVEATS BELONG TO THE RAIL ──────────────────────────
                Both of these explain a BLANK DECADE, and a thin place draws
                no decades — 259 Frederick St was carrying a paragraph about
                the Board's bound volumes and the Clerk's PDFs under two 1991
                motions, which is the project's backstory printed where
                nothing needed explaining. They print where the rail does. */}
            {!thin ? (
            <p className="fx-block-hint" style={NOTE}>
              {indexedLast >= SERIES_LAST_YEAR
                ? tOr(
                    t,
                    "us.sf.thecity.panel.rail_shelf_end",
                    "Two record systems meet here. The Board's bound volumes were scanned through June 2016; from July 2016 the City stopped printing them and posted PDFs instead, and those are cited to the Clerk's own files.",
                  )
                : tOr(
                    t,
                    "us.sf.thecity.panel.rail_shelf_behind",
                    "The Board's minutes are scanned through {y}, under three different titles. This map has read them to {i}; the decades after that are blank here, not in the record.",
                  )
                    .replace("{y}", String(SERIES_LAST_YEAR))
                    .replace("{i}", String(indexedLast))}
            </p>
            ) : null}
            {/* WAS "Another 180 decisions run along the streets around here.
                Read them ↓", which pointed at a fold that no longer exists.
                The streets are in `Also here` and in the ladder, both of
                which OPEN the street rather than unfolding a copy of it. */}
          </>
        ) : (
          <>
            <p className="fx-fiche-note">
              {record && record.streets.length > 0
                ? t("us.sf.thecity.panel.empty_but_streets")
                : t("us.sf.thecity.panel.empty")}
            </p>
            {city && city.blocks > 0 ? (
              <p className="fx-block-hint">
                {t("us.sf.thecity.panel.empty_rarity")
                  .replace("{with}", nfInt.format(city.withRecord))
                  .replace("{all}", nfInt.format(city.blocks))
                  .replace("{without}", nfInt.format(city.blocks - city.withRecord))}
              </p>
            ) : null}
          </>
        )}

        {/* ── THE FIGURES, MINUS THE RECORD COUNT ──────────────────────
            This row read `402 Residents · 218 Homes · Single Family
            Residential · 41 Board decisions · 1907–2020`, while the ladder
            ten lines above already said `this block 41` and the sentence at
            the top said "41 decisions here, 1907 to 2020". The same number
            three times on one screen is the class of thing that let
            2,002-against-833 through. `GroundLine` keeps what is ONLY here —
            who lives on this ground and what the roll calls it — and
            `shape={null}` drops the count it was repeating. */}
        {onHood ? (
          hoodRecs ? (
            <p className="fx-block-figs">
              <b>{nfInt.format(hoodRecs.n)}</b>{" "}
              {tOr(t, "us.sf.thecity.panel.now_decisions", "Board decisions")}
            </p>
          ) : null
        ) : (
        <GroundLine
          now={now}
          shape={null}
          atDoor={unit.kind !== "ground"}
          t={t}
        />
        )}

        {places.length > 0 && money ? (
          <>
            <div className="fx-city-ledger-head fx-block-sec">
              {t("us.sf.thecity.panel.money_head")}
            </div>
            {places.map((pl) => (
              <PlaceMoney
                key={pl.slug}
                place={pl}
                href={placeHref(money, pl.slug)}
                /* §16e's gate, unchanged: the neighbourhood's only
                   figure-carrying place is this block's only place, so the
                   four figures below would be the four figures above. */
                figuresAbove={
                  hood &&
                  hoods &&
                  places.length === 1 &&
                  hood.money.places_with_a_figure === 1 &&
                  hood.money.top?.slug === pl.slug
                    ? hood.name
                    : null
                }
                t={t}
              />
            ))}
          </>
        ) : null}

        <div className="fx-block-foot">
          <CopyLink t={t} />
        </div>

        <BlockSources now={now} money={money} t={t} />

        {/* ── THE BOTTOM OF THE NEIGHBOURHOOD, WHICH WAS NOT THERE ────────
            The neighbourhood is the longest thing this panel renders — the
            paragraph alone is two screens, and the decade list is thirteen
            more rows under it — and it ended on a closed `SOURCES` fold with
            nothing after it. A reader who had scrolled all of that had no way
            out except back up: `← Back` is at the top, and the map behind is
            covered by the panel they are in.

            So the same control, at the far end, and it NAMES where it goes
            rather than saying "back" twice. The name is the block's own
            streets, the same `blockPlaceName` the pin now writes, falling
            back to nothing at all rather than to a number — the 0.6 % of
            blocks that front no street get the plain word and no invented
            place. Only on the neighbourhood, because it is the only unit long
            enough to have lost the reader. */}
        {/* the foot's own return control went with it: the ladder is at the
            top of this level now and says where each rung goes AND how much
            is there, which `← Back to Ashbury St · Clayton St` did not. */}
        {/* The foot's own return control went with it: the ladder is at the
            top of this level now, and it says where each rung goes AND how
            much is there — which `← Back to Ashbury St · Clayton St` did
            not. */}

        {/* ── TWO FOLDS REMOVED, AND WHERE THEY WENT ────────────────────
            The panel had five ways to reach two places. The ladder at the top
            reaches the block, the street and the neighbourhood, `Also here`
            reaches every address and every street, and under them sat
            "On the streets around here" — an unfoldable copy of streets the
            reader can simply OPEN — and "The neighbourhood", a fold holding
            four sections about somewhere else.

            Both are gone. The streets fold had nothing the street's own fiche
            does not do better. The neighbourhood fold's four sections were
            NOT redundant and are not deleted: its census provenance, its
            money and its archival highlights now render on the neighbourhood
            itself, which is where a reader who pressed `Haight Ashbury`
            expects to find them. */}
      </div>
    </div>
  );
}
