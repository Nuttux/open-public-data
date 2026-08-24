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
import { useT } from "@/lib/localeContext";
import FicheArchiveShelf from "@/components/fiche/FicheArchiveShelf";
import type { FicheArchiveDoc } from "@/components/fiche/types";
import {
  archiveHref,
  blockNow,
  blockPlaces,
  blockShape,
  decadeGroups,
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
  type HoodFactsFile,
  type HoodRecord,
} from "./block-records";

const nfInt = new Intl.NumberFormat("en-US");

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

/**
 * THE TWENTY-FOUR STRINGS THE NEIGHBOURHOOD ADDS.
 *
 * The thirteen `sum_*` of §14g are in `en.ts` and `fr.ts` (0c6ccacf), so
 * `EN_SUM` is gone and every one of them is a plain `t()` call. These are the
 * next batch, in the same arrangement and for the same reason — `useT` returns
 * THE KEY ITSELF when one is missing, so a plain `t()` would print
 * `us.sf.thecity.panel.hood_head` on screen until they land. FICHE.md §15f has
 * the list; `EN_HOOD` and `tx()` both go the moment they do.
 */
const EN_HOOD: Record<string, string> = {
  "us.sf.thecity.panel.hood_kicker": "Neighbourhood",
  "us.sf.thecity.panel.hood_block": "Block {id}",
  "us.sf.thecity.panel.hood_sum_ground":
    "A neighbourhood of {n} blocks, {m} of them mostly {use}.",
  "us.sf.thecity.panel.hood_sum_ground_plain": "A neighbourhood of {n} blocks.",
  "us.sf.thecity.panel.hood_sum_people": "{n} people live here, in {h} homes.",
  "us.sf.thecity.panel.hood_sum_record":
    "The Board decided {n} things across it between {y0} and {y1}, most of them in the {d}s.",
  "us.sf.thecity.panel.hood_sum_record_flat":
    "The Board decided {n} things across it between {y0} and {y1}.",
  "us.sf.thecity.panel.hood_sum_record_none":
    "The Board's record places nothing in it.",
  "us.sf.thecity.panel.hood_now_blocks": "Blocks",
  "us.sf.thecity.panel.hood_now_src":
    "The {c} Census, summed over the {n} of this neighbourhood's {all} blocks a census block resolves onto. City-wide that join carries {carried} of the county's {total} residents.",
  "us.sf.thecity.panel.hood_money_head": "Public money here",
  "us.sf.thecity.panel.hood_money_one":
    "One of the {n} city places standing here carries a figure — {place} — and what is below is the whole of it.",
  "us.sf.thecity.panel.hood_money_only":
    "{place} is the one city place standing here, and what is below is the whole of it.",
  "us.sf.thecity.panel.hood_money_some":
    "{m} of the {n} city places standing here carry a figure, the largest of them {place}. Each figure below is the whole of its place, added across the {m}; nothing is divided between neighbourhoods.",
  "us.sf.thecity.panel.hood_money_none":
    "{n} city places stand here and no city ledger names any of them, so no figure is shown for them.",
  "us.sf.thecity.panel.hood_money_none_one":
    "{place} stands here and no city ledger names it, so no figure is shown for it.",
  "us.sf.thecity.panel.hood_money_cover":
    "A published city place resolves to {n} of the city's {all} neighbourhoods, and {m} of those carry a figure.",
  "us.sf.thecity.panel.hood_hl_head": "What the Board kept deciding here",
  "us.sf.thecity.panel.hood_hl_note":
    "The Board's own printed lines, ranked by how many of this neighbourhood's blocks each one lands on. Nothing is summarised: every line is the volume's own and opens the page it is printed on.",
  "us.sf.thecity.panel.hood_hl_blocks": "on {n} of its blocks",
  "us.sf.thecity.panel.hood_hl_blocks_one": "on one block",
  "us.sf.thecity.panel.hood_hl_more": "{n} more lines the record places here",
  "us.sf.thecity.panel.hood_block_head": "On this block",
  "us.sf.thecity.panel.hood_block_ground": "A mostly {use} block.",
  "us.sf.thecity.panel.sum_people_no_homes": "{n} people live on it.",
  "us.sf.thecity.panel.sum_people_one_no_homes": "One person lives on it.",
  "us.sf.thecity.panel.hood_block_lede":
    "The neighbourhood above is {n} blocks. This is the one under the pin.",
};

function tx(t: (k: string) => string, key: string): string {
  const v = t(key);
  return v === key ? (EN_HOOD[key] ?? key) : v;
}

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
 */
function BlockSummary({
  now,
  shape,
  place,
  hood,
  underHood,
  t,
}: {
  now: BlockNow | null;
  shape: ReturnType<typeof blockShape>;
  place: BlockPlace | null;
  hood: string;
  /**
   * The neighbourhood section is standing above this one, so the ground clause
   * drops the hood name: under a heading that already says "Mission", "A
   * mostly multi-family residential block in Mission" says it twice. Where the
   * rollup file has not loaded there is no heading, and the full clause is
   * what carries the reader's bearing.
   */
  underHood: boolean;
  t: (k: string) => string;
}) {
  const bits: string[] = [];

  if (now?.use) {
    bits.push(
      underHood
        ? tx(t, "us.sf.thecity.panel.hood_block_ground").replace(
            "{use}",
            now.use.toLowerCase(),
          )
        : t("us.sf.thecity.panel.sum_ground")
            .replace("{use}", now.use.toLowerCase())
            .replace("{hood}", hood),
    );
  } else if (hood && !underHood) {
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
          tx(
            t,
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

  /* The one thing the old lead said that the clauses above do not: a block
     whose record stops two whole decades before the series does. That is about
     THIS BLOCK falling silent, not about the Journal running out, and the two
     are different sentences — see `blockShape.quietAfter`. */
  if (shape?.quietAfter) {
    bits.push(
      t("us.sf.thecity.panel.shape_quiet").replace("{y}", String(shape.quietAfter)),
    );
  }

  if (place) {
    bits.push(t("us.sf.thecity.panel.sum_place").replace("{place}", place.name));
  }

  if (bits.length === 0) return null;
  return (
    <>
      {underHood ? null : (
        <div className="fx-city-ledger-head fx-block-sec" style={{ marginTop: 10 }}>
          {t("us.sf.thecity.panel.sum_head")}
        </div>
      )}
      <p className="fx-block-lead" style={{ marginTop: underHood ? 8 : 0 }}>
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
      ? tx(t, "us.sf.thecity.panel.hood_sum_ground")
          .replace("{use}", hood.use.toLowerCase())
          .replace("{m}", nfInt.format(hood.use_blocks))
          .replace("{n}", nfInt.format(hood.blocks))
      : tx(t, "us.sf.thecity.panel.hood_sum_ground_plain").replace(
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
      tx(t, "us.sf.thecity.panel.hood_sum_people")
        .replace("{n}", nfInt.format(hood.residents))
        .replace("{h}", nfInt.format(hood.homes)),
    );
  }

  if (hood.record.n === 0) {
    bits.push(tx(t, "us.sf.thecity.panel.hood_sum_record_none"));
  } else {
    bits.push(
      tx(
        t,
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
 * THE GROUND, one level up — and the denominator travels with every figure.
 *
 * `residents_blocks` is on the record and it is printed, because only **2 of
 * the 41** neighbourhoods have a Census ring on every one of their blocks:
 * Bayview Hunters Point has 294 of 501. A resident count with no denominator
 * beside it would imply a completeness the join has not got. The city-wide
 * ratio is on the same line, so a reader can see that the missing rings cost
 * 0.6 % of the county rather than guess at it.
 */
function HoodNowRows({
  hood,
  file,
  t,
}: {
  hood: HoodRecord;
  file: HoodFactsFile;
  t: (k: string) => string;
}) {
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {t("us.sf.thecity.panel.now_head")}
      </div>
      <dl className="fx-city-ledger-facts">
        {hood.residents > 0 ? (
          <div className="fx-city-fact-row">
            <dt>{t("us.sf.thecity.panel.now_residents")}</dt>
            <dd>{nfInt.format(hood.residents)}</dd>
          </div>
        ) : null}
        {hood.homes > 0 ? (
          <div className="fx-city-fact-row">
            <dt>{t("us.sf.thecity.panel.now_homes")}</dt>
            <dd>{nfInt.format(hood.homes)}</dd>
          </div>
        ) : null}
        {hood.use ? (
          <div className="fx-city-fact-row">
            <dt>{t("us.sf.thecity.panel.now_use")}</dt>
            <dd>{hood.use}</dd>
          </div>
        ) : null}
        <div className="fx-city-fact-row">
          <dt>{tx(t, "us.sf.thecity.panel.hood_now_blocks")}</dt>
          <dd>{nfInt.format(hood.blocks)}</dd>
        </div>
      </dl>
      <p className="fx-block-hint" style={{ marginTop: 7 }}>
        {tx(t, "us.sf.thecity.panel.hood_now_src")
          .replace("{c}", String(file.census_year))
          .replace("{n}", nfInt.format(hood.residents_blocks))
          .replace("{all}", nfInt.format(hood.blocks))
          .replace("{carried}", nfInt.format(file.coverage.residents_carried))
          .replace("{total}", nfInt.format(file.coverage.residents_counted))}{" "}
        <a
          className="fx-block-jump"
          href="https://data.census.gov/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("us.sf.thecity.panel.now_census")}
        </a>
      </p>
    </>
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
      ? tx(
          t,
          m.places === 1
            ? "us.sf.thecity.panel.hood_money_none_one"
            : "us.sf.thecity.panel.hood_money_none",
        )
          .replace("{n}", nfInt.format(m.places))
          .replace("{place}", m.names[0] ?? "")
      : tx(
          t,
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
        {tx(t, "us.sf.thecity.panel.hood_money_head")}
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
      <p className="fx-block-hint" style={{ marginTop: 8 }}>
        {tx(t, "us.sf.thecity.panel.hood_money_cover")
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
        ? tx(t, "us.sf.thecity.panel.hood_hl_blocks").replace("{n}", String(h.nb))
        : tx(t, "us.sf.thecity.panel.hood_hl_blocks_one")) +
      (h.y1 > h.y0 ? ` · ${h.y0}–${h.y1}` : ""),
  }));
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {tx(t, "us.sf.thecity.panel.hood_hl_head")}
      </div>
      <p className="fx-block-hint">{tx(t, "us.sf.thecity.panel.hood_hl_note")}</p>
      <FicheArchiveShelf
        docs={docs}
        cap={3}
        moreLabel={(k) =>
          tx(t, "us.sf.thecity.panel.hood_hl_more").replace("{n}", String(k))
        }
      />
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
  underHood,
  t,
}: {
  now: BlockNow;
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
      </dl>
      <p className="fx-block-hint" style={{ marginTop: 7 }}>
        {t("us.sf.thecity.panel.now_src").replace("{y}", String(now.rollYear))}{" "}
        {now.residents !== null
          ? t("us.sf.thecity.panel.now_src_pop").replace(
              "{c}",
              String(now.censusYear),
            )
          : t("us.sf.thecity.panel.now_no_pop")}{" "}
        <a
          className="fx-block-jump"
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
  t,
}: {
  place: BlockPlace;
  href: string;
  t: (k: string) => string;
}) {
  const here = place.here[0];
  const money = hasMoney(place);
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
        {place.n_blocks > 1
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
        {!money
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
              ? tx(t, "us.sf.thecity.panel.hood_kicker")
              : t("us.sf.thecity.panel.kicker")}
          </span>
          <h2 className="fx-city-panel-title">
            {hood ? hood.name : (context?.hood ?? context?.id ?? "—")}
          </h2>
          {context ? (
            <p className="fx-place-sub" style={{ margin: "2px 0 0" }}>
              {tx(t, "us.sf.thecity.panel.hood_block").replace("{id}", context.id)}
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
            <HoodNowRows hood={hood} file={hoods} t={t} />
            <HoodMoney hood={hood} file={hoods} money={money} t={t} />
            <HoodHighlights hood={hood} t={t} />
            <div
              className="fx-city-ledger-head fx-block-sec"
              style={{ marginTop: 20 }}
            >
              {tx(t, "us.sf.thecity.panel.hood_block_head")}
            </div>
            <p className="fx-block-hint" style={{ marginTop: 0 }}>
              {tx(t, "us.sf.thecity.panel.hood_block_lede").replace(
                "{n}",
                nfInt.format(hood.blocks),
              )}
            </p>
          </>
        ) : null}
        {/* IN SHORT, before anything else. "So people get straight to the
            meat." It is assembled from the same fields the sections below
            print, so it can never say more than they do. */}
        {!loading ? (
          <BlockSummary
            now={now}
            shape={shape}
            place={places[0] ?? null}
            hood={context?.hood ?? ""}
            underHood={!!(hood && hoods)}
            t={t}
          />
        ) : null}
        {/* WHAT IS HERE NOW, above the record and outside its loading gate.
            The roll and the census arrive on their own fetch, and a block with
            no decisions at all still has residents on it — putting these inside
            the `shape ?` branch would have hidden them on exactly the 324
            blocks whose only content this is. */}
        {now && facts ? (
          <NowRows now={now} underHood={!!(hood && hoods)} t={t} />
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
                t={t}
              />
            ))}
            {/* The coverage is 1.3 % and the panel says the number. A reader who
                meets this section on one block and not on the next has to be
                able to tell "the city holds nothing here" from "this join does
                not reach here", and only a printed ratio does that. */}
            <p className="fx-block-hint" style={{ marginTop: 8 }}>
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
              {groups.map((g) => (
                <DecadeRow key={g.decade} group={g} max={max} t={t} />
              ))}
            </div>
            {/* Daniel: "there's nothing included from the handoff to
                digitalization — it's a shame." He is right, and the rail now
                runs to the present so the gap is visible instead of the rail
                just stopping. This says whose gap it is. */}
            <p className="fx-block-hint" style={{ marginTop: 6 }}>
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
