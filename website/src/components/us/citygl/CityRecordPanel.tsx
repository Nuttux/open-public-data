/* ══ THE PANEL THAT HOLDS THE RECORD ═══════════════════════════════════════
 *
 * The right-hand column of the city page is 280 px wide and full height, it is
 * captioned **The record**, and until now it held a search box, four lines of
 * mouse instructions and six hundred pixels of nothing — with two filters lit
 * and a year chosen, it still said the same generic sentence. Daniel, looking
 * at it: *"decisions is too in the back and its our main thing"*.
 *
 * So it holds one. Drag the year and this lists what the Board decided in that
 * year, being exactly the dots lit on the map beside it — the same set, twice,
 * which is why there is no legend and nothing to explain.
 *
 * ── ONE YEAR, NOT A WINDOW ────────────────────────────────────────────────
 * The marks layer lights `WINDOW_YEARS` either side of the chosen year, so a
 * caption honest about it had to read *"within six years of 1939"* and a
 * reader had to do sums. This says **1939** and means it. Some years are
 * quiet — 1954 holds two decisions and 1925 holds 307 — and that
 * three-hundredfold spread is a fact about the record, not a defect: the
 * Journal was printed in full through the twenties and the corpus thins where
 * the scans do. The empty state says which of the two it is looking at.
 *
 * ── THE ROW IS NOT BUILT HERE ─────────────────────────────────────────────
 * `components/us/city/record-line.ts` decides whether a record's own sentence
 * can carry a row, and it was scored on 300 records before it shipped — 56 %
 * of lines read on the sample it was tuned against and 54 % on a held-out
 * 200. Where the line does not read, the classification becomes the row and
 * the line is not printed. That ruleset is the dot card's; this panel calls
 * it rather than owning a second copy, so the two surfaces cannot drift into
 * disagreeing about the same record.
 *
 * ── AND A LONG YEAR IS CAPPED, OUT LOUD ───────────────────────────────────
 * 307 rows is not a list a person reads. The panel shows the first `CAP` and
 * says how many it is not showing, because a silent truncation reads as
 * "that is all of it" when it is not.
 * ═══════════════════════════════════════════════════════════════════════ */

"use client";

import { useMemo } from "react";

import { recordLine } from "@/components/us/city/record-line";
import type { YearDecision } from "@/lib/citygl/year-record";

/** `blocks/classify.json`, the subject and act vocabularies */
export interface ClassifyLists {
  readonly sub: readonly string[];
  readonly act: readonly string[];
}

export interface CityRecordPanelProps {
  /** the year on the rail, or null for the present */
  readonly year: number | null;
  /** what the map is showing for that year — already narrowed by subject */
  readonly decisions: readonly YearDecision[];
  /** the chosen subject's label, or null when every subject is showing */
  readonly subject: string | null;
  /** the subject's ink, for the row dot */
  readonly ink: string;
  readonly classify: ClassifyLists | null;
  /** true while the decade's shard is still arriving */
  readonly loading: boolean;
  /** which row the cursor is over, so the map can raise the same decision */
  readonly hover: number | null;
  readonly onHover: (i: number | null) => void;
  readonly onOpen: (i: number) => void;
}

/** how many rows a year may print before it starts counting instead */
const CAP = 40;

/**
 * THE HEADING A RECORD GETS, WHICH IS THE CARD'S OWN RULE.
 *
 * `CityGLMap`'s dot card composes this from the shard's `cs` and `ca` against
 * `classify.json`, and refuses it outright on grade `h` — where the heading on
 * the page belongs to a different item printed beside this one. 8.3 % of lit
 * rows are `h`; they keep their line and lose the heading, because a wrong
 * heading is worse than none.
 */
function says(d: YearDecision, cf: ClassifyLists | null): string | null {
  if (d.grade === "h" || !cf || d.cs < 0) return null;
  const sub = cf.sub[d.cs];
  if (!sub) return null;
  const act = d.ca < 0 ? null : cf.act[d.ca];
  return act ? `${sub} · ${act}` : sub;
}

export default function CityRecordPanel({
  year, decisions, subject, ink, classify, loading, hover, onHover, onOpen,
}: CityRecordPanelProps) {
  /* The rows are built once per year rather than per render: `recordLine` runs
     a dozen regular expressions a record, and the year moves on a drag. */
  const rows = useMemo(
    () => decisions.map((d) => ({ d, line: recordLine(d.text, says(d, classify), null) })),
    [decisions, classify],
  );
  const shown = rows.slice(0, CAP);
  const hidden = rows.length - shown.length;

  return (
    <div className="fx-city-record">
      <div className="fx-city-record-head">
        <span className="fx-city-record-cap">The record</span>
        <div className="fx-city-record-count">
          {year === null ? "Today" : `${year} — ${rows.length}`}
          {year !== null ? (
            <span className="fx-city-record-unit">
              {rows.length === 1 ? " decision" : " decisions"}
            </span>
          ) : null}
        </div>
        <div className="fx-city-record-scope">
          {subject ? `in ${subject.toLowerCase()}` : "in the Board's minutes"}
        </div>
      </div>

      <div className="fx-city-record-body">
        {loading ? (
          <p className="fx-city-record-quiet">Fetching the decade&hellip;</p>
        ) : rows.length === 0 ? (
          <p className="fx-city-record-quiet">
            {subject
              ? `The Board decided nothing about ${subject.toLowerCase()} in ${year}. Drag the year, or clear the subject.`
              : `Nothing in this year's minutes has been placed on the map. Some years are quiet, and the scans thin out in places.`}
          </p>
        ) : (
          shown.map(({ d, line }, i) => (
            <button
              key={`${d.url}-${i}`}
              type="button"
              className={`fx-city-record-row${hover === i ? " is-hot" : ""}`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              onClick={() => onOpen(i)}
            >
              <span className="fx-city-record-dot" style={{ background: ink }} />
              <span className="fx-city-record-text">
                {line.tag ? <span className="fx-city-record-tag">{line.tag}</span> : null}
                {line.headline}
                {line.sum ? <span className="fx-city-record-sum">{line.sum}</span> : null}
              </span>
              {/* WHERE IT LANDED, when it landed in more than one place. A
                  decision naming twenty-four addresses is one act of the Board
                  and twenty-four dots, and a reader looking at the map needs to
                  know which of those is this row. */}
              {d.at.length > 1 ? (
                <span className="fx-city-record-n">{d.at.length}</span>
              ) : null}
            </button>
          ))
        )}
        {hidden > 0 ? (
          <p className="fx-city-record-more">
            {hidden} more this year, not listed. Narrow it with a subject, or
            press a dot on the map.
          </p>
        ) : null}
      </div>
    </div>
  );
}
