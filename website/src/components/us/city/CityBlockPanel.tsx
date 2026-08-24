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

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";
import FicheArchiveShelf from "@/components/fiche/FicheArchiveShelf";
import type { FicheArchiveDoc } from "@/components/fiche/types";
import {
  archiveHref,
  blockDemolitions,
  blockNow,
  blockPlaces,
  blockShape,
  blockSubjects,
  decadeGroups,
  hasMoney,
  loadBlockFacts,
  loadBlockMoney,
  loadStreetRecord,
  placeHref,
  streetLabel,
  usdShort,
  KIND_WORDING,
  TIER_WORDING,
  type BlockDecision,
  type BlockDemolitions,
  type BlockFactsFile,
  type BlockMoneyFile,
  type BlockNow,
  type BlockPlace,
  type BlockRecord,
  type BlockSubject,
  type DecadeGroup,
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
 * TWO STRINGS THIS PASS ADDS, on the same arrangement as the thirty-five before
 * them: declared here behind `tx()` because `useT` returns the key itself when
 * a key is missing, deleted the moment they land in `en.ts` / `fr.ts`.
 * FICHE.md §13g has them.
 */
const EN_DEM2: Record<string, string> = {
  "us.sf.thecity.panel.dem_lead_year":
    "{n} buildings on this block were demolished under a completed permit, in {y0}.",
  // The SHORT floor line, for a block that HAS a record. The long one exists to
  // stop an empty section reading as "nothing came down here"; a block showing
  // three demolitions cannot be misread that way, and on a 390 px screen the
  // long form ran six lines to say something the header already says.
  "us.sf.thecity.panel.dem_floor_short":
    "This record begins in {y}; what came down before is not published block by block.",
};

function tx(t: (k: string) => string, key: string): string {
  const v = t(key);
  return v === key ? (EN_DEM2[key] ?? key) : v;
}

/**
 * WHAT CAME DOWN — and the seventy-year hole, said out loud on every block.
 *
 * The map's buildings are survivorship only: every footprint it draws is one
 * standing today. This is the first thing on the page that shows the city
 * REMOVING something, and it reaches back only to 1980.
 *
 * **The floor sentence runs whether or not the block has anything**, which is
 * the whole design. 1,687 of 5,404 blocks carry a completed demolition; on the
 * other 3,717 an empty section would read as "nothing was ever demolished
 * here". For the Western Addition — cleared under redevelopment in the 1960s,
 * two decades before this series opens — that would be the single most
 * misleading sentence on the site. Same rule as the 810 blocks with no Census
 * ring: show the absence of the RECORD, never a zero.
 *
 * All ten `us.sf.thecity.panel.dem_*` keys are in `en.ts` and `fr.ts`
 * (`f72af9a1`), so this calls `t()` like the rest of the panel; the `EN_DEM`
 * fallback that stood in while they landed is gone, as `EN_NOW` was before it.
 */
function DemolitionRows({
  dem,
  blocksWithAny,
  blocksTotal,
  t,
}: {
  dem: BlockDemolitions;
  blocksWithAny: number;
  blocksTotal: number;
  t: (k: string) => string;
}) {
  const max = dem.byDecade.reduce((m, d) => Math.max(m, d.n), 0);
  const liveDecades = dem.byDecade.filter((d) => d.n > 0).length;
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {t("us.sf.thecity.panel.dem_head").replace(
          "{y}",
          String(dem.recordFrom),
        )}
      </div>
      {dem.total > 0 ? (
        <>
          <p className="fx-block-lead" style={{ marginTop: 0 }}>
            {(dem.total === 1
              ? t("us.sf.thecity.panel.dem_lead_one")
              : dem.firstYear === dem.lastYear
                ? tx(t, "us.sf.thecity.panel.dem_lead_year")
                : t("us.sf.thecity.panel.dem_lead")
            )
              .replace("{n}", nfInt.format(dem.total))
              .replace("{y0}", String(dem.firstYear))
              .replace("{y1}", String(dem.lastYear))}
          </p>
          {/* The same rail idiom the decades below use, so a reader meets one
              shape twice rather than two shapes once. Empty decades are drawn
              here too: a block cleared in the 1980s and untouched since is a
              different thing from one losing a building every decade.

              But ONLY where there is a shape to show. Where everything came
              down in ONE decade the rail is four flatlines and one bar, and it
              says nothing the sentence above it has not already said — the lead
              names the year. Measured on a phone: it cost fourteen lines of a
              390 px screen to report two buildings. */}
          {liveDecades > 1 ? (
          <div className="fx-block-rail" style={{ marginTop: 8 }}>
            {dem.byDecade.map((d) => (
              <div className="fx-block-blank" key={d.decade}>
                <div className="fx-block-head">
                  <span
                    className={d.n ? "fx-block-dec" : "fx-block-dec fx-block-dec-off"}
                  >
                    {d.decade}s
                  </span>
                  {d.n > 0 ? (
                    <span
                      className="fx-block-track"
                      aria-label={t("us.sf.thecity.panel.dem_aria")
                        .replace("{decade}", String(d.decade))
                        .replace("{n}", String(d.n))}
                    >
                      <span
                        className="fx-block-bar"
                        style={{ width: `${max ? (100 * d.n) / max : 0}%` }}
                      />
                    </span>
                  ) : (
                    <span className="fx-block-flat" />
                  )}
                  <span className="fx-block-n tnum">{d.n || ""}</span>
                </div>
              </div>
            ))}
          </div>
          ) : null}
          {dem.units > 0 ? (
            <dl className="fx-city-ledger-facts" style={{ marginTop: 8 }}>
              <div className="fx-city-fact-row">
                <dt>{t("us.sf.thecity.panel.dem_units")}</dt>
                <dd>{nfInt.format(dem.units)}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : (
        <p className="fx-block-lead" style={{ marginTop: 0 }}>
          {t("us.sf.thecity.panel.dem_none")}
        </p>
      )}
      <p className="fx-block-hint" style={{ marginTop: 7 }}>
        {(dem.total > 0
          ? tx(t, "us.sf.thecity.panel.dem_floor_short")
          : t("us.sf.thecity.panel.dem_floor")
        ).replace("{y}", String(dem.recordFrom))}{" "}
        {dem.total > 0 ? t("us.sf.thecity.panel.dem_counted") + " " : ""}
        {t("us.sf.thecity.panel.dem_cover")
          .replace("{n}", nfInt.format(blocksWithAny))
          .replace("{all}", nfInt.format(blocksTotal))}{" "}
        <a
          className="fx-block-jump"
          href="https://data.sfgov.org/d/i98e-djp9"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("us.sf.thecity.panel.dem_src")}
        </a>
      </p>
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
  zeroBlocks,
  t,
}: {
  now: BlockNow;
  /** how many blocks the roll values at nothing — so "$0" is not read as a hole */
  zeroBlocks: number;
  t: (k: string) => string;
}) {
  return (
    <>
      <div className="fx-city-ledger-head fx-block-sec">
        {t("us.sf.thecity.panel.now_head")}
      </div>
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
        <div className="fx-city-fact-row">
          <dt>{t("us.sf.thecity.panel.now_value")}</dt>
          <dd>{usdShort(now.valueUsd)}</dd>
        </div>
      </dl>
      <p className="fx-block-hint" style={{ marginTop: 7 }}>
        {t("us.sf.thecity.panel.now_src").replace("{y}", String(now.rollYear))}{" "}
        {/* 480 of 5,401 blocks are valued at nothing — the roll carries no
            figure on the ground the city, the state and the federal government
            own, and City Hall's own parcel is one of them. Alone, "$0" reads
            as a hole in the data; with the count beside it, it reads as what
            the roll says. */}
        {now.valueUsd === 0 && zeroBlocks > 0
          ? t("us.sf.thecity.panel.now_zero").replace(
              "{n}",
              nfInt.format(zeroBlocks),
            ) + " "
          : ""}
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
        <a className="fx-block-jump" href={href}>
          {t("us.sf.thecity.panel.money_link").replace("{place}", place.name)}
        </a>
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
          <span className="fx-block-flat" />
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
function SubjectRow({
  subjects,
  active,
  onPick,
  t,
}: {
  subjects: readonly BlockSubject[];
  active: string | null;
  onPick: (key: string | null) => void;
  t: (k: string) => string;
}) {
  return (
    <div
      className="fx-block-subjects"
      role="group"
      aria-label={t("us.sf.thecity.panel.subjects_aria")}
    >
      {subjects.map((s) => (
        <button
          key={s.key}
          type="button"
          className="fx-block-subject"
          aria-pressed={active === s.key}
          onClick={() => onPick(active === s.key ? null : s.key)}
        >
          <span>{s.label}</span>
          <span className="fx-block-subject-n tnum">{s.rows.length}</span>
        </button>
      ))}
    </div>
  );
}

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
  const [subject, setSubject] = useState<string | null>(null);
  // The two modern-fact files. One fetch each for the whole session — both are
  // memoised inside `block-records`, so a second panel does not re-request —
  // and both fail soft to null, which renders exactly what this panel rendered
  // before this section existed.
  const [facts, setFacts] = useState<BlockFactsFile | null>(null);
  const [money, setMoney] = useState<BlockMoneyFile | null>(null);

  useEffect(() => {
    let live = true;
    void loadBlockFacts().then((f) => {
      if (live) setFacts(f);
    });
    void loadBlockMoney().then((m) => {
      if (live) setMoney(m);
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
    setSubject(null);
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
  // array is a new dependency, so the subjects were recomputed on every
  // frame the map emitted while the panel was open.
  const here = useMemo(() => record?.decisions ?? EMPTY, [record]);
  const shape = blockShape(here);
  const subjects = useMemo(() => blockSubjects(here), [here]);
  const picked = subjects.find((s) => s.key === subject) ?? null;
  const shown = picked ? picked.rows : here;
  const groups = shown.length > 0 ? decadeGroups(shown) : [];
  const max = groups.reduce((m, g) => Math.max(m, g.rows.length), 0);
  const streetN = context?.streetDecisions ?? 0;

  // Both are keyed on the block id, and both are read only when the file has
  // actually arrived — a block with no row in either simply draws neither
  // section rather than a heading over nothing.
  const now = facts && context ? blockNow(facts, context.id) : null;
  const dem = facts && context ? blockDemolitions(facts, context.id) : null;
  const places = money && context ? blockPlaces(money, context.id) : [];

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
          <span className="fx-city-panel-kicker">
            {t("us.sf.thecity.panel.kicker")}
          </span>
          <h2 className="fx-city-panel-title">{context?.id ?? "—"}</h2>
          {context ? (
            <p className="fx-place-sub" style={{ margin: "2px 0 0" }}>
              {context.hood}
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
        {/* WHAT IS HERE NOW, above the record and outside its loading gate.
            The roll and the census arrive on their own fetch, and a block with
            no decisions at all still has residents on it — putting these inside
            the `shape ?` branch would have hidden them on exactly the 324
            blocks whose only content this is. */}
        {now && facts ? (
          <NowRows
            now={now}
            zeroBlocks={facts.coverage.blocks_with_no_assessed_value ?? 0}
            t={t}
          />
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

        {/* WHAT CAME DOWN, under the money rather than over it.
            Rendered whenever the file has loaded and the block is one the roll
            knows — NOT only when the block has a demolition — because the 1980
            floor is the point and 3,717 of 5,404 blocks need to be told it.

            It sits BELOW `Public money` because it is on every block and the
            money is on 66. Judged on a phone: with demolitions above, a block
            that HAS money pushed it most of a screen down, and the rarest thing
            the panel knows was the hardest to reach. The always-present section
            yields to the rare one. */}
        {dem && facts && now ? (
          <DemolitionRows
            dem={dem}
            blocksWithAny={facts.demolition.blocks_with_any}
            blocksTotal={facts.coverage.blocks_total}
            t={t}
          />
        ) : null}

        {loading ? (
          <p className="fx-fiche-note">{t("us.sf.thecity.panel.loading")}</p>
        ) : shape ? (
          <>
            <p className="fx-block-lead">
              {(shape.n === 1
                ? t("us.sf.thecity.panel.lead_one")
                : t("us.sf.thecity.panel.lead")
              )
                .replace("{n}", nfInt.format(shape.n))
                .replace("{y0}", String(shape.firstYear))
                .replace("{y1}", String(shape.lastYear))}
              {shape.busiest
                ? " " +
                  t("us.sf.thecity.panel.shape_busiest").replace(
                    "{decade}",
                    String(shape.busiest.decade),
                  )
                : ""}
              {shape.quietAfter
                ? " " +
                  t("us.sf.thecity.panel.shape_quiet").replace(
                    "{y}",
                    String(shape.quietAfter),
                  )
                : ""}
            </p>

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

            {subjects.length > 0 ? (
              <>
                <div className="fx-city-ledger-head fx-block-sec">
                  {t("us.sf.thecity.panel.subjects_head")}
                </div>
                <p className="fx-block-hint">
                  {t("us.sf.thecity.panel.subjects_hint")}
                </p>
                <SubjectRow
                  subjects={subjects}
                  active={subject}
                  onPick={setSubject}
                  t={t}
                />
              </>
            ) : null}

            <div className="fx-city-ledger-head fx-block-sec">
              {t("us.sf.thecity.panel.rail_head")}
            </div>
            {picked ? (
              <p className="fx-block-hint">
                {t(
                  picked.firstYear === picked.lastYear
                    ? "us.sf.thecity.panel.rail_filtered_one_year"
                    : "us.sf.thecity.panel.rail_filtered",
                )
                  .replace("{n}", String(picked.rows.length))
                  .replace("{label}", picked.label)
                  .replace("{y0}", String(picked.firstYear))
                  .replace("{y1}", String(picked.lastYear))}{" "}
                <button
                  type="button"
                  className="fx-block-jump"
                  onClick={() => setSubject(null)}
                >
                  {t("us.sf.thecity.panel.rail_unfilter").replace(
                    "{n}",
                    nfInt.format(shape.n),
                  )}
                </button>
              </p>
            ) : (
              <p className="fx-block-hint">{t("us.sf.thecity.panel.rail_hint")}</p>
            )}
            <div
              className="fx-block-rail"
              key={`${record?.blockId ?? "-"}:${subject ?? ""}`}
            >
              {groups.map((g) => (
                <DecadeRow key={g.decade} group={g} max={max} t={t} />
              ))}
            </div>
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
