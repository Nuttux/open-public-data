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
  blockNow,
  blockPlaces,
  blockShape,
  decadeGroups,
  railItems,
  hasMoney,
  hoodAt,
  hoodBusiest,
  loadBlockFacts,
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
 * IN SHORT — the block in four clauses, and not one word that is not a field.
 *
 * "A summary of the block from the objective data and the voting record so
 * people get straight to the meat." The danger in that ask is obvious: a
 * summary is where prose creeps in and starts generalising past what the
 * record says. So this is **assembled, not written**. Every clause is one
 * sentence over one field, and a clause whose field is missing is DROPPED
 * rather than hedged:
 *
 *   the ground   the roll's own dominant use, and the published hood
 *   the people   the Census count carried onto this block, or its absence
 *   the record   how many decisions, across what years, and the busiest decade
 *                — `blockShape` only names a decade that actually leads
 *   the place    the published city place standing here, where there is one
 *
 * Nothing is ranked, characterised or compared. There is no adjective in it
 * that the assessor did not print. A block where nothing is known says so in
 * one line and stops, which is the same discipline as the 810 blocks with no
 * Census ring: **state what the record holds, and state when it holds
 * nothing.**
 *
 * ── IT RUNS ONLY WHEN `hood-facts.json` DID NOT ARRIVE ───────────────────
 * Under the neighbourhood this paragraph is gone, and every clause in it was
 * already on screen as a row or a section: *"A mostly commercial office
 * block"* is the `Mostly` row, *"19 people live on it, in one home"* is the
 * two rows above it, and *"Moscone Center stands on it"* is the money section
 * two lines down. The only clause that was NOT anywhere else — how many
 * decisions, across what years — is now two rows of its own beside the rest
 * (`BlockRecordRows`). **One grain, one form: prose for the neighbourhood,
 * figures for the block.** What is left here is the whole fiche's fallback
 * for a session where the rollup file failed, where this paragraph is the
 * only prose on the panel and has nothing to repeat.
 */
function BlockSummary({
  now,
  shape,
  place,
  hood,
  t,
}: {
  now: BlockNow | null;
  shape: ReturnType<typeof blockShape>;
  place: BlockPlace | null;
  hood: string;
  t: (k: string) => string;
}) {
  const bits: string[] = [];

  if (now?.use) {
    bits.push(
      t("us.sf.thecity.panel.sum_ground")
        .replace("{use}", now.use.toLowerCase())
        .replace("{hood}", hood),
    );
  } else if (hood) {
    bits.push(t("us.sf.thecity.panel.sum_ground_plain").replace("{hood}", hood));
  }

  if (now && now.residents !== null) {
    bits.push(
      now.residents === 0
        ? t("us.sf.thecity.panel.sum_people_none")
        : /* HU100 = 0 with residents above it is a real published pair —
             City Hall's ring reads 19 and 0 — and "19 people live on it, in 0
             homes" reads as an error in the data rather than as what a
             workplace block looks like when the Census counts homes. The homes
             clause is dropped instead; the row above still prints the 0, where
             it sits beside its own label and cannot be misread. */
          t(
                        now.residents === 1
              ? now.homes
                ? "us.sf.thecity.panel.sum_people_one"
                : "us.sf.thecity.panel.sum_people_one_no_homes"
              : !now.homes
                ? "us.sf.thecity.panel.sum_people_no_homes"
                : now.homes === 1
                  ? "us.sf.thecity.panel.sum_people_one_home"
                  : "us.sf.thecity.panel.sum_people",
          )
            .replace("{n}", nfInt.format(now.residents))
            .replace("{h}", nfInt.format(now.homes ?? 0)),
    );
  }

  if (!shape) {
    bits.push(t("us.sf.thecity.panel.sum_record_none"));
  } else if (shape.n === 1) {
    bits.push(
      t("us.sf.thecity.panel.sum_record_one").replace(
        "{y0}",
        String(shape.firstYear),
      ),
    );
  } else {
    bits.push(
      t(
        shape.busiest
          ? "us.sf.thecity.panel.sum_record"
          : "us.sf.thecity.panel.sum_record_flat",
      )
        .replace("{n}", nfInt.format(shape.n))
        .replace("{y0}", String(shape.firstYear))
        .replace("{y1}", String(shape.lastYear))
        .replace("{d}", String(shape.busiest?.decade ?? "")),
    );
  }

  if (place) {
    bits.push(t("us.sf.thecity.panel.sum_place").replace("{place}", place.name));
  }

  if (bits.length === 0) return null;
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE NEIGHBOURHOOD — what the fiche is about now.
 *
 * "I'd rather something more about a neighbourhood than hyper localized
 * blocks." The block did not go away; it moved down the page, under its own
 * heading, as the detail inside the thing the reader is looking at.
 *
 * Everything below reads ONE file, `hood-facts.json`, which is a rollup of the
 * two block files over the membership `base/blocks.qc` already publishes. The
 * measurements are in FICHE.md §15 and the point of the change is in one row of
 * it: **a money figure reaches 30 of 5,404 blocks and 20 of 41
 * neighbourhoods.**
 * ──────────────────────────────────────────────────────────────────────── */

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
function NowRows({
  now,
  shape,
  underHood,
  t,
}: {
  now: BlockNow;
  /**
   * The block's record, as two rows at the foot of this same list. It is only
   * ever passed under the neighbourhood, where the paragraph that used to
   * carry those two figures has gone — see `RecordFactRows`.
   */
  shape: NonNullable<ReturnType<typeof blockShape>> | null;
  /**
   * The neighbourhood's own "On the ground now" is already on the page above,
   * under that exact heading. Printing it twice would make the two sets of
   * numbers look like a disagreement rather than two grains of the same
   * measurement, so under the "On this block" heading the rows stand bare.
   */
  underHood: boolean;
  t: (k: string) => string;
}) {
  return (
    <>
      {underHood ? null : (
        <div className="fx-city-ledger-head fx-block-sec">
          {t("us.sf.thecity.panel.now_head")}
        </div>
      )}
      <dl className="fx-city-ledger-facts">
        {now.residents !== null ? (
          <div className="fx-city-fact-row">
            <dt>{t("us.sf.thecity.panel.now_residents")}</dt>
            <dd>{nfInt.format(now.residents)}</dd>
          </div>
        ) : null}
        {now.homes !== null ? (
          <div className="fx-city-fact-row">
            <dt>{t("us.sf.thecity.panel.now_homes")}</dt>
            <dd>{nfInt.format(now.homes)}</dd>
          </div>
        ) : null}
        {now.use ? (
          <div className="fx-city-fact-row">
            <dt>{t("us.sf.thecity.panel.now_use")}</dt>
            <dd>{now.use}</dd>
          </div>
        ) : null}
        {shape ? <RecordFactRows shape={shape} t={t} /> : null}
      </dl>
      <p className="fx-block-hint" style={NOTE}>
        {t("us.sf.thecity.panel.now_src").replace("{y}", String(now.rollYear))}{" "}
        {now.residents !== null
          ? t("us.sf.thecity.panel.now_src_pop").replace(
              "{c}",
              String(now.censusYear),
            )
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
    </>
  );
}

/**
 * THE BLOCK'S RECORD, AS FIGURES — the one clause the deleted paragraph said
 * that nothing else on the panel did.
 *
 * *"The Board decided 71 things here between 1906 and 1998, most of them in
 * the 1900s."* Three facts. Two of them are figures with no home anywhere else
 * on the panel, so they become rows beside the roll's own. The third —
 * **which decade was busiest — is deliberately NOT a row**: the rail directly
 * below is a bar per decade scaled against the busiest one, so printing it as
 * a fact restates in five words what the drawing is for.
 *
 * Only under the neighbourhood. Where the rollup did not load, `BlockSummary`
 * is still saying all three in a sentence and these rows would be the second
 * telling.
 */
function RecordFactRows({
  shape,
  t,
}: {
  shape: NonNullable<ReturnType<typeof blockShape>>;
  t: (k: string) => string;
}) {
  return (
    <>
      <div className="fx-city-fact-row">
        <dt>{tOr(t, "us.sf.thecity.panel.now_decisions", "Board decisions")}</dt>
        <dd>{nfInt.format(shape.n)}</dd>
      </div>
      <div className="fx-city-fact-row">
        <dt>{tOr(t, "us.sf.thecity.panel.now_span", "In the record")}</dt>
        <dd>
          {shape.firstYear === shape.lastYear
            ? String(shape.firstYear)
            : `${shape.firstYear}–${shape.lastYear}`}
        </dd>
      </div>
    </>
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
        <span className="fx-block-n" />
      </div>
    </div>
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
          <span className="fx-block-n" />
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
        aria-label={t("us.sf.thecity.panel.rail_aria")
          .replace("{decade}", String(group.decade))
          .replace("{n}", String(n))}
      >
        <span className="fx-block-head">
          <span className="fx-block-dec">{group.label}</span>
          <span className="fx-block-track">
            <span className="fx-block-bar" style={{ width: `${pct}%` }} />
          </span>
          <span className="fx-block-n tnum">{n}</span>
        </span>
        <span className="fx-block-line">
          {group.headline ? group.headline.t : t("us.sf.thecity.panel.no_line")}
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
  const shape = blockShape(here);
  const groups = here.length > 0 ? decadeGroups(here) : [];
  const max = groups.reduce((m, g) => Math.max(m, g.rows.length), 0);
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
          {/* THE NEIGHBOURHOOD IS THE TITLE and the block is the subtitle —
              the two have swapped. A reader who clicks a shape is told what
              part of San Francisco they are in, and then which of its blocks
              answered; before this they were told "3724" and had to read the
              small line under it to find out where that was. */}
          <span className="fx-city-panel-kicker">
            {hood
              ? t("us.sf.thecity.panel.hood_kicker")
              : t("us.sf.thecity.panel.kicker")}
          </span>
          <h2 className="fx-city-panel-title">
            {hood ? hood.name : (context?.hood ?? context?.id ?? "—")}
          </h2>
          {context ? (
            <p className="fx-place-sub" style={{ margin: "2px 0 0" }}>
              {t("us.sf.thecity.panel.hood_block").replace("{id}", context.id)}
              {context.areaM2 > 0
                ? ` · ${t("us.sf.thecity.panel.area").replace("{n}", nfInt.format(Math.round(context.areaM2)))}`
                : ""}
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
        {/* ── THE NEIGHBOURHOOD, FIRST AND WHOLE ────────────────────────────
            Four sections, none of them outside the loading gate, because the
            rollup does not depend on which block was picked — only on which of
            the 41 it belongs to, which the pick already knew. The block's own
            record can still be in flight underneath them.

            The order is the one §13f established on the phone and it holds one
            level up: the ALWAYS-PRESENT section yields to the RARE one. Every
            hood carries residents; 20 of 41 carry a money figure; so the money
            is above the highlights and both are above the block. */}
        {hood && hoods ? (
          <>
            <HoodSummary hood={hood} t={t} />
            <HoodProvenance hood={hood} file={hoods} t={t} />
            <HoodMoney hood={hood} file={hoods} money={money} t={t} />
            <HoodHighlights hood={hood} t={t} />
            <div
              className="fx-city-ledger-head fx-block-sec"
              style={{ marginTop: 20 }}
            >
              {t("us.sf.thecity.panel.hood_block_head")}
            </div>
            <p className="fx-block-hint" style={{ marginTop: 0 }}>
              {t("us.sf.thecity.panel.hood_block_lede").replace(
                "{n}",
                nfInt.format(hood.blocks),
              )}
            </p>
          </>
        ) : null}
        {/* ── ONE GRAIN, ONE FORM ───────────────────────────────────────
            > "this is again too much information, there's no hierarchy or
            > quick scan of info, please evaluate this format"

            The neighbourhood is PROSE and the block is FIGURES, and neither is
            both. Under the neighbourhood this paragraph is gone: every clause
            in it was already a row or a section three lines below, and the one
            clause that was not — how many decisions, over what years — is
            `BlockRecordRows`. It survives only for the session where
            `hood-facts.json` did not arrive, where it is the only prose on the
            panel and has nothing to say twice. */}
        {!loading && !(hood && hoods) ? (
          <BlockSummary
            now={now}
            shape={shape}
            place={places[0] ?? null}
            hood={context?.hood ?? ""}
            t={t}
          />
        ) : null}
        {/* WHAT IS HERE NOW, above the record and outside its loading gate.
            The roll and the census arrive on their own fetch, and a block with
            no decisions at all still has residents on it — putting these inside
            the `shape ?` branch would have hidden them on exactly the 324
            blocks whose only content this is. */}
        {now && facts ? (
          <NowRows
            now={now}
            /* The record's two figures join the roll's rows, and only where
               the paragraph that used to carry them is gone. */
            shape={!loading && hood && hoods ? shape : null}
            underHood={!!(hood && hoods)}
            t={t}
          />
        ) : !loading && shape && hood && hoods ? (
          /* The three blocks of 5,404 with no row in `block-facts.json` still
             have a record, and it is still two figures. */
          <dl className="fx-city-ledger-facts">
            <RecordFactRows shape={shape} t={t} />
          </dl>
        ) : null}

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
            {/* The coverage is 1.3 % and the panel says the number. A reader who
                meets this section on one block and not on the next has to be
                able to tell "the city holds nothing here" from "this join does
                not reach here", and only a printed ratio does that. */}
            <p className="fx-block-hint" style={NOTE}>
              {t("us.sf.thecity.panel.money_cover")
                .replace("{n}", nfInt.format(money.coverage.blocks_with_a_place))
                .replace("{all}", nfInt.format(money.coverage.blocks_total))
                .replace(
                  "{m}",
                  nfInt.format(money.coverage.blocks_with_a_money_figure),
                )}
            </p>
          </>
        ) : null}

        {loading ? (
          <p className="fx-fiche-note">{t("us.sf.thecity.panel.loading")}</p>
        ) : shape ? (
          <>
            {streetN > 0 && record && record.streets.length > 0 ? (
              <p className="fx-block-nearby">
                <button type="button" className="fx-block-jump" onClick={goToStreets}>
                  {t(
                    streetN === 1
                      ? "us.sf.thecity.panel.nearby_one"
                      : "us.sf.thecity.panel.nearby",
                  )
                    .replace("{n}", nfInt.format(streetN))}
                </button>
              </p>
            ) : null}


            <div className="fx-city-ledger-head fx-block-sec">
              {t("us.sf.thecity.panel.rail_head")}
            </div>
            <p className="fx-block-hint">{t("us.sf.thecity.panel.rail_hint")}</p>
            <div
              className="fx-block-rail"
              key={record?.blockId ?? "-"}
            >
              {railItems(groups).map((it) =>
                it.kind === "gap" ? (
                  <DecadeGap key={`g${it.run.from}`} run={it.run} t={t} />
                ) : (
                  <DecadeRow
                    key={it.group.decade}
                    group={it.group}
                    max={max}
                    t={t}
                  />
                ),
              )}
            </div>
            {/* Daniel: "there's nothing included from the handoff to
                digitalization — it's a shame." He is right, and the rail now
                runs to the present so the gap is visible instead of the rail
                just stopping. This says whose gap it is. */}
            {/* THE BLOCK'S OWN SILENCE, and it is not the same sentence as
                the one below it. `quietAfter` is THIS BLOCK falling quiet two
                whole decades before the Board's series runs out; the line
                under it is the series running out. They used to sit two
                sections apart — one in the summary paragraph, one here — which
                is what made them read as one hedge repeated. Both are facts
                about the rail, so both are captions under the rail. */}
            {shape.quietAfter ? (
              <p className="fx-block-hint" style={NOTE}>
                {t("us.sf.thecity.panel.shape_quiet").replace(
                  "{y}",
                  String(shape.quietAfter),
                )}
              </p>
            ) : null}
            <p className="fx-block-hint" style={NOTE}>
              {t("us.sf.thecity.panel.sum_rail_end").replace(
                "{y}",
                String(SERIES_LAST_YEAR),
              )}
            </p>
          </>
        ) : (
          <>
            <p className="fx-fiche-note">
              {record && record.streets.length > 0
                ? t("us.sf.thecity.panel.empty_but_streets")
                : t("us.sf.thecity.panel.empty")}
            </p>
            {/* A blank block was a dead end: one sentence, no bearing, nothing
                to do next. The two counts the margin already holds say how
                unusual it is, which is the honest thing to say about a block
                the record passed over. */}
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
      </div>
    </div>
  );
}
