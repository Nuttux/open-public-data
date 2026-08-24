"use client";

/**
 * THE BLOCK FICHE — what happened on one assessor block, and when.
 *
 * A reader clicks a block and gets four things, in this order:
 *
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
  blockShape,
  blockSubjects,
  decadeGroups,
  loadStreetRecord,
  streetLabel,
  KIND_WORDING,
  TIER_WORDING,
  type BlockDecision,
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
