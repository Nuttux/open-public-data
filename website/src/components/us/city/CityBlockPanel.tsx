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
  archiveHref,
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
  hoodBusiest,
  indexedLastYear,
  judgedLead,
  loadBlockFacts,
  loadBlockIndex,
  loadBlockLeadPicks,
  loadBlockMoney,
  loadHoodFacts,
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

/** the volume slug, spelled out as far as it spells itself */
function seriesOf(u: string): string {
  const vol = u.split("/")[0] ?? "";
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
    gloss: d.t.trim() || null,
    title: `${kind} · ${whenOf(d)}`,
    year: null,
    href: archiveHref(d.u),
    sourceLabel: seriesOf(d.u),
    variantNote: tier + (d.approx ? " · page ≈" : ""),
  };
}

export interface BlockContext {
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
   * fiche, so a block whose whole story is on its streets (401 hold nothing of
   * their own and front a street the record knows, and the median block
   * reaches 95 street decisions) could not say so until the reader opened a
   * fold they had no reason to open.
   */
  streetDecisions: number;
}

/* THE TWENTY-SEVEN NEIGHBOURHOOD STRINGS ARE IN `en.ts` AND `fr.ts` (1492d9c7),
   so `EN_HOOD` and `tx()` are gone and every one of them is a plain `t()` call
   — the same disposal §14 made for the thirteen before them. `useT` returns THE
   KEY ITSELF when a key is missing, which is why the fallback existed and why
   the deletion is checked by dumping the panel's own `innerText` and grepping
   for `us.sf.` rather than by trusting the diff. */

/**
 * IN SHORT, for the neighbourhood — the same discipline as the block's.
 *
 * Assembled, never written. Every clause is one sentence over one field and a
 * clause whose field is missing is dropped rather than hedged. The only thing
 * this level says that the block's cannot is *how many blocks*, which is a
 * count of the membership and not an estimate of anything.
 */
function HoodSummary({ hood, t }: { hood: HoodRecord; t: (k: string) => string }) {
  const bits: string[] = [];
  const busiest = hoodBusiest(hood);

  bits.push(
    /* NOT "a mostly single family residential neighbourhood". Each block's
       `use` is already the plurality of ITS parcels, so a plurality over those
       is a plurality of pluralities — and South of Market came out "mostly
       single family residential", which is the roll's word for a great many
       small SoMa parcels and is not what a reader will understand by it. The
       sentence now says exactly what was counted: how many of the
       neighbourhood's blocks are mostly that. */
    hood.use
      ? t("us.sf.thecity.panel.hood_sum_ground")
          .replace("{use}", hood.use.toLowerCase())
          .replace("{m}", nfInt.format(hood.use_blocks))
          .replace("{n}", nfInt.format(hood.blocks))
      : t("us.sf.thecity.panel.hood_sum_ground_plain").replace(
          "{n}",
          nfInt.format(hood.blocks),
        ),
  );

  /* Every one of the 41 carries a Census count, so unlike the block there is
     no absent case to write for — and no hood reads zero, so there is no
     zero sentence either. A sentence for a state that does not occur is a
     sentence nobody has checked. */
  if (hood.residents > 0) {
    bits.push(
      t("us.sf.thecity.panel.hood_sum_people")
        .replace("{n}", nfInt.format(hood.residents))
        .replace("{h}", nfInt.format(hood.homes)),
    );
  }

  if (hood.record.n === 0) {
    bits.push(t("us.sf.thecity.panel.hood_sum_record_none"));
  } else {
    bits.push(
      t(
                busiest
          ? "us.sf.thecity.panel.hood_sum_record"
          : "us.sf.thecity.panel.hood_sum_record_flat",
      )
        .replace("{n}", nfInt.format(hood.record.n))
        .replace("{y0}", String(hood.record.y0))
        .replace("{y1}", String(hood.record.y1))
        .replace("{d}", String(busiest?.decade ?? "")),
    );
  }

  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec" style={{ marginTop: 10 }}>
        {t("us.sf.thecity.panel.sum_head")}
      </div>
      <p className="fx-block-lead" style={{ marginTop: 0 }}>
        {bits.join(" ")}
      </p>
    </>
  );
}

/**
 * THE NEIGHBOURHOOD'S PROVENANCE — the whole of what is left of "On the ground
 * now", and it is a footnote.
 *
 * > "this is again too much information, there's no hierarchy or quick scan of
 * > info, please evaluate this format"
 *
 * **The four fact rows are gone: Residents, Homes, Mostly, Blocks.** Not
 * because the figures are wrong but because the paragraph above already
 * printed all four — *"A neighbourhood of 53 blocks, 33 of them mostly single
 * family residential. 28,506 people live here, in 15,913 homes."* — so a
 * reader met `Single Family Residential` twice at one grain, once as prose and
 * once as a row, and had to read both to find out they were the same thing.
 * **ONE GRAIN, ONE FORM: prose for the neighbourhood, figures for the block.**
 *
 * The sentence below is what does NOT go. `residents_blocks` is on the record
 * because only **2 of the 41** neighbourhoods have a Census ring on every one
 * of their blocks — Bayview Hunters Point has 294 of 501 — and a resident
 * count with no denominator implies a completeness the join has not got. It
 * drops to footnote weight (`NOTE`) rather than out: thirty-six words
 * qualifying a five-word fact may not be set at the size of the fact.
 */
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
    href: archiveHref(h.u),
    sourceLabel: seriesOf(h.u),
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
function BlockLead({ d, t }: { d: BlockDecision; t: (k: string) => string }) {
  return (
    <section style={LEAD_WRAP}>
      <div className="fx-city-ledger-head">
        {tOr(t, "us.sf.thecity.panel.lead_head", "What the Board decided here")}
      </div>
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
          href={archiveHref(d.u)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tOr(t, "us.sf.thecity.panel.lead_open", "Open the scanned page")}
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
function GroundLine({ now, shape, t }: {
  now: BlockNow | null;
  shape: NonNullable<ReturnType<typeof blockShape>> | null;
  t: (k: string) => string;
}) {
  const bits: React.ReactNode[] = [];
  if (now && now.residents !== null) {
    bits.push(
      <span key="r">
        <b>{nfInt.format(now.residents)}</b> {t("us.sf.thecity.panel.now_residents")}
      </span>,
    );
  }
  if (now && now.homes !== null) {
    bits.push(
      <span key="h">
        <b>{nfInt.format(now.homes)}</b> {t("us.sf.thecity.panel.now_homes")}
      </span>,
    );
  }
  if (now?.use) bits.push(<span key="u">{now.use}</span>);
  if (shape) {
    bits.push(
      <span key="n">
        <b>{nfInt.format(shape.n)}</b>{" "}
        {tOr(t, "us.sf.thecity.panel.now_decisions", "Board decisions")}
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

function DecadeRow({
  group,
  max,
  t,
}: {
  group: DecadeGroup;
  max: number;
  t: (k: string) => string;
}) {
  const n = group.rows.length;
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
    <details className="fx-block-row">
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
        {/* NO LINE, AND THE THREE REASONS ARE NOT THE SAME SENTENCE.
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
            close in all three cases. */}
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
          docs={group.rows.map(toDoc)}
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
export default function CityBlockPanel({
  record,
  context,
  city,
  loading,
  onClose,
  onLocate,
}: {
  record: BlockRecord | null;
  context: BlockContext | null;
  /** the city totals the margin already reads, so a blank block has a bearing */
  city?: CityRecordTotals;
  loading: boolean;
  onClose: () => void;
  /** take the map to this block — passed only when the map knows where it is */
  onLocate?: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const streetsRef = useRef<HTMLDetailsElement>(null);
  const [streets, setStreets] = useState<Record<string, BlockDecision[]>>({});
  const [openStreets, setOpenStreets] = useState(false);
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
    setStreets({});
    setOpenStreets(
      (record?.decisions.length ?? 0) === 0 && (record?.streets.length ?? 0) > 0,
    );
  }, [record?.blockId, record?.decisions.length, record?.streets.length]);

  useEffect(() => {
    if (!openStreets || !record) return;
    let live = true;
    void Promise.all(
      record.streets.slice(0, 6).map(async (k) => [k, await loadStreetRecord(k)] as const),
    ).then((pairs) => {
      if (!live) return;
      const out: Record<string, BlockDecision[]> = {};
      for (const [k, v] of pairs) out[k] = v;
      setStreets(out);
    });
    return () => {
      live = false;
    };
  }, [openStreets, record]);

  // `record?.decisions ?? []` builds a new array on every render, and a new
  // array is a new dependency, so the shape was recomputed on every frame the
  // map emitted while the panel was open.
  const here = useMemo(() => record?.decisions ?? EMPTY, [record]);
  /* WHAT THE INDEX REACHES vs WHAT THE SHELF REACHES — two numbers, and the
     rail may not confuse them. `indexedLast` is the last year these shards
     place anything and it decides which decades draw as unrecorded; the
     caption underneath cites `SERIES_LAST_YEAR`, the last year the Internet
     Archive's scanned series covers. They converge when the ingest re-runs. */
  const indexedLast = indexedLastYear(index);
  const shape = blockShape(here, indexedLast);
  /* THE LINE THE FICHE OPENS ON — `pickHeadline` over the whole block
     behind the OCR/procedural gate. See `blockLead` in `block-records`. */
  const lead = useMemo(
    () => judgedLead(picks, record?.blockId ?? "", here) ?? blockLead(here),
    [picks, record?.blockId, here],
  );
  const groups = here.length > 0 ? decadeGroups(here, indexedLast) : [];
  const max = groups.reduce((m, g) => Math.max(m, g.rows.length), 0);
  /* The one rung the index stops inside, and only when this block has rows on
     it — the caption qualifies a bar, so it is not printed where there is no
     bar to qualify. `decadeGroups` guarantees at most one. */
  const partial = groups.find((g) => g.partialTo !== null && g.rows.length > 0) ?? null;
  const streetN = context?.streetDecisions ?? 0;

  // Both are keyed on the block id, and both are read only when the file has
  // actually arrived — a block with no row in either simply draws neither
  // section rather than a heading over nothing.
  const now = facts && context ? blockNow(facts, context.id) : null;
  const places = money && context ? blockPlaces(money, context.id) : [];
  // Joined on the INDEX the map itself publishes, never on the name — one
  // membership on this map, and no second one able to disagree with it.
  const hood = hoods && context ? hoodAt(hoods, context.hoodIndex) : null;

  /** open the street fold and take the reader down to it in one press */
  const goToStreets = (): void => {
    setOpenStreets(true);
    const el = streetsRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
          <span className="fx-city-panel-kicker">
            {hood ? hood.name : (context?.hood || t("us.sf.thecity.panel.kicker"))}
          </span>
          <h2 className="fx-city-panel-title">
            {context
              ? t("us.sf.thecity.panel.hood_block").replace("{id}", context.id)
              : "—"}
          </h2>
          {context && context.areaM2 > 0 ? (
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
        {loading ? (
          <p className="fx-fiche-note">{t("us.sf.thecity.panel.loading")}</p>
        ) : shape ? (
          <>
            {lead ? <BlockLead d={lead} t={t} /> : null}

            <div className="fx-city-ledger-head fx-block-sec">
              {t("us.sf.thecity.panel.rail_head")}
            </div>
            <p className="fx-block-hint">{t("us.sf.thecity.panel.rail_hint")}</p>
            <div className="fx-block-rail" key={record?.blockId ?? "-"}>
              {railItems(groups).map((it) =>
                it.kind === "gap" ? (
                  <DecadeGap key={`g${it.run.from}`} run={it.run} t={t} />
                ) : (
                  <DecadeRow key={it.group.decade} group={it.group} max={max} t={t} />
                ),
              )}
            </div>
            {/* ── THE LAST RUNG IS SEVEN YEARS, AND IT HAS TO SAY SO ──────
                The ingest of the Board's modern minutes carried the index to
                2016, so the rail's last rung is the 2010s and it holds
                2010–2016. A reader comparing its bar against the 1920s is
                comparing seven years with ten, and nothing on the rail said
                that. One line, and only where there is a rung on this block
                for it to qualify — the count of years comes off `partialTo`,
                so an index that later reaches 2019 stops printing it with no
                code change. */}
            {partial ? (
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
                {t("us.sf.thecity.panel.shape_quiet").replace(
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
            <p className="fx-block-hint" style={NOTE}>
              {indexedLast >= SERIES_LAST_YEAR
                ? tOr(
                    t,
                    "us.sf.thecity.panel.rail_shelf_end",
                    "The scanned series ends in {y} — the bound volumes stop there, not the Board. The Clerk has published every meeting since; no library has paginated them into this series, which changed title three times and was once thought to end in 1999.",
                  ).replace("{y}", String(SERIES_LAST_YEAR))
                : tOr(
                    t,
                    "us.sf.thecity.panel.rail_shelf_behind",
                    "The Board's minutes are scanned through {y}, under three different titles. This map has read them to {i}; the decades after that are blank here, not in the record.",
                  )
                    .replace("{y}", String(SERIES_LAST_YEAR))
                    .replace("{i}", String(indexedLast))}
            </p>
            {streetN > 0 && record && record.streets.length > 0 ? (
              <p className="fx-block-nearby">
                <button type="button" className="fx-block-jump" onClick={goToStreets}>
                  {t(
                    streetN === 1
                      ? "us.sf.thecity.panel.nearby_one"
                      : "us.sf.thecity.panel.nearby",
                  ).replace("{n}", nfInt.format(streetN))}
                </button>
              </p>
            ) : null}
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

        {/* The figures, on one row, under the record rather than over it. */}
        <GroundLine now={now} shape={!loading ? shape : null} t={t} />

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

        <BlockSources now={now} money={money} t={t} />

        {record && record.streets.length > 0 ? (
          <details
            ref={streetsRef}
            className="fx-shelf-more"
            style={{ marginTop: 16 }}
            open={openStreets}
            onToggle={(e) => setOpenStreets((e.target as HTMLDetailsElement).open)}
          >
            <summary>
              {t("us.sf.thecity.panel.streets").replace(
                "{n}",
                String(record.streets.length),
              )}
            </summary>
            <p className="fx-fiche-note" style={{ marginTop: 8 }}>
              {t("us.sf.thecity.panel.streets_note")}
            </p>
            {record.streets.slice(0, 6).map((k) => {
              const rows = streets[k];
              return (
                <div key={k} style={{ marginTop: 14 }}>
                  <div className="fx-doc-source" style={{ marginBottom: 4 }}>
                    {streetLabel(k)}
                  </div>
                  {rows === undefined ? (
                    <p className="fx-fiche-note">
                      {t("us.sf.thecity.panel.loading")}
                    </p>
                  ) : rows.length === 0 ? (
                    <p className="fx-fiche-note">
                      {t("us.sf.thecity.panel.street_empty")}
                    </p>
                  ) : (
                    <FicheArchiveShelf
                      docs={rows.slice(0, 40).map(toDoc)}
                      cap={3}
                      moreLabel={(n) =>
                        t("us.sf.thecity.panel.street_more")
                          .replace("{n}", String(n))
                          .replace("{street}", streetLabel(k))
                      }
                    />
                  )}
                </div>
              );
            })}
          </details>
        ) : null}

        {/* ── THE NEIGHBOURHOOD, LAST AND CLOSED ────────────────────────────
            It used to be FIRST and open: four sections — a prose summary with
            a thirty-six word census footnote, the neighbourhood's money, three
            archival highlights with their own ranking methodology, and a
            divider — before one row about the block the reader clicked.
            Measured on Sunset/Parkside block 2115 at 390 px: **585 words and
            2,262 CSS px, of which roughly 1,300 px were the neighbourhood.**
            The reader got two and a half screens about somewhere else first.

            Not deleted, and the difference matters. `HoodMoney` is where 16
            blocks of 5,404 carry their only money figure (§19e), the census
            provenance is the project's whole claim, and a neighbourhood is
            genuinely the right unit for the archival highlights — §15 is a
            whole round establishing that the block alone is too thin for them.
            Deleting any of it would be trading one wrong panel for another.

            So it is a `<details>`, closed, under the block's own record: the
            fiche opens as the block and the context is one tap away. Nothing
            is lost and the default view is the thing that was asked about. */}
        {hood && hoods ? (
          <details className="fx-shelf-more" style={{ marginTop: 16 }}>
            <summary>
              {tOr(t, "us.sf.thecity.panel.hood_open", "The neighbourhood")}
              {` · ${hood.name}`}
            </summary>
            <HoodSummary hood={hood} t={t} />
            <HoodProvenance hood={hood} file={hoods} t={t} />
            <HoodMoney hood={hood} file={hoods} money={money} t={t} />
            <HoodHighlights hood={hood} t={t} />
          </details>
        ) : null}
      </div>
    </div>
  );
}
