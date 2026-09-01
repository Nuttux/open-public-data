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
 *
 * ── §THE ONES THE RECORD DOES NOT DESCRIBE GO LAST, AND COUNTED ───────────
 * `record-line.ts` scores 56 % of lines as readable. The rest keep only their
 * classification, and on a card showing one record that is fine. On a panel
 * showing sixty-two it is not: 2026 opened with **six consecutive rows all
 * reading "Landmarks and old buildings · Ordered"** and nothing else, which
 * looks like a broken list rather than like a record that does not say more.
 *
 * So the readable ones lead, and the rest are grouped by what they are and
 * counted — *"Landmarks and old buildings · Ordered — 6"*. Nothing is dropped
 * and nothing is invented: it is the same set, said once instead of six times.
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
  /** the year being shown — the rail's, or the record's own latest */
  readonly year: number | null;
  /**
   * true when the reader has not moved the rail and this is the record's
   * LATEST year rather than one they chose. The panel says so, because a
   * number nobody picked has to explain where it came from.
   */
  readonly latest: boolean;
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

/**
 * WHETHER THE ROW PRINTS THE MONEY SEPARATELY.
 *
 * A record can be ONE appropriation with numbered clauses — (1) Dudley Stone
 * equipment $11,000 … (5) Wilde avenue $3,039.48. `pl` reads the whole item and
 * reports the first figure; `line.sum` comes off the fragment on this row. Side
 * by side they read as a contradiction, so where our written line already
 * carries a figure it carries the money alone.
 */
function hasSum(d: { readonly pl?: string }, line: { readonly sum?: string | null }) {
  return Boolean(line.sum && !(d.pl && /[$£€]/.test(d.pl)));
}

export default function CityRecordPanel({
  year, latest, decisions, subject, ink, classify, loading, hover, onHover, onOpen,
}: CityRecordPanelProps) {
  /* The rows are built once per year rather than per render: `recordLine` runs
     a dozen regular expressions a record, and the year moves on a drag. */
  const { told, mute } = useMemo(() => {
    const made = decisions.map((d, i) => {
      const line = recordLine(d.text, says(d, classify), null);
      /* ── A WRITTEN LINE OUTRANKS AN EXTRACTED ONE ────────────────────────
         `recordLine` finds the most readable sentence INSIDE the record, which
         is the best that can be done for a record nobody has written yet. `pl`
         is a sentence written from the item's whole text and checked twice, so
         where one exists it is the headline and the row always TELLS — it can
         never fall into the mute cohort, because the reason that cohort exists
         (the Clerk's line does not read) does not apply to a line we wrote.
         `d.text` stays on the row underneath; see the row markup. */
      // ── THE TAG STANDS DOWN WHERE THE LINE SPEAKS ──────────────────────
      // The classification is a LABEL for a record whose own words do not
      // read. Our line reads, so the label becomes noise — and worse than
      // noise when the two disagree: five rows of "LANDMARKS AND OLD BUILDINGS
      // · ORDERED" sat above five lines each saying "Landmark status PROPOSED",
      // which is the classification's verb against ours on the same row.
      // The map card already drops it for exactly this reason; this is the
      // same rule, so the two surfaces now read the same way.
      return { d, i, line: d.pl ? { ...line, headline: d.pl, tag: null } : line };
    });
    /* a row TELLS you something when its headline is the record's own words.
       Where the line did not read, `recordLine` puts the classification in the
       headline and leaves `tag` null — that is the mute cohort.

       ── AND THE EXTRACTED SENTENCE IS NO LONGER TRUSTED AT ALL ───────────
       `recordLine` used to be the best available for a record nobody had
       written, so a row it judged readable was allowed to tell. It judged
       this readable:

           Be APPROVED, and further directed the Clerk of the Board to
           prepare findings that include a three-unit project…

       That is the Clerk mid-sentence, and it was the top of a year panel.
       96.8% of rows now carry a line written from the whole record and
       checked twice, so the extraction is only ever reached on the 3.2%
       where the Clerk's own words do not read — which is precisely where it
       produces that. A row tells if we wrote it. Nothing else tells. */
    const told = made.filter((r) => Boolean(r.d.pl));
    const rest = made.filter((r) => !r.d.pl);
    const by = new Map<string, { label: string; n: number; first: number }>();
    for (const r of rest) {
      // the classification, not the mangled sentence: "Landmarks and old
      // buildings · Ordered" says what the record is about, and the row's
      // own link opens the scan for anyone who wants the Board's wording.
      const label = says(r.d, classify) ?? "Not yet summarised";
      const e = by.get(label);
      if (e) e.n += 1;
      else by.set(label, { label, n: 1, first: r.i });
    }
    return { told, mute: [...by.values()].sort((a, b) => b.n - a.n) };
  }, [decisions, classify]);
  const shown = told.slice(0, CAP);
  const hidden = told.length - shown.length;
  const total = decisions.length;

  return (
    <div className="fx-city-record">
      <div className="fx-city-record-head">
        <span className="fx-city-record-cap">The record</span>
        <div className="fx-city-record-count">
          {year === null ? "The record" : `${year} — ${total}`}
          {year !== null ? (
            <span className="fx-city-record-unit">
              {total === 1 ? " decision" : " decisions"}
            </span>
          ) : null}
        </div>
        <div className="fx-city-record-scope">
          {subject ? `in ${subject.toLowerCase()}` : "in the Board's minutes"}
          {latest && year !== null ? " — the latest year on file. Drag the rail to go back." : ""}
        </div>
      </div>

      <div className="fx-city-record-body">
        {loading ? (
          <p className="fx-city-record-quiet">Fetching the decade&hellip;</p>
        ) : total === 0 ? (
          <p className="fx-city-record-quiet">
            {subject
              ? `The Board decided nothing about ${subject.toLowerCase()} in ${year}. Drag the year, or clear the subject.`
              : `Nothing in this year's minutes has been placed on the map. Some years are quiet, and the scans thin out in places.`}
          </p>
        ) : (
          shown.map(({ d, line }, i) => (
            /* ── TWO THINGS A READER WANTS FROM A ROW, AND ONE OF THEM WAS
                   UNREACHABLE ──────────────────────────────────────────────
               The row flew the camera to the place, which is the thing only
               this map can do, and there was no way at all to reach the
               scanned page — the record itself. Writing "Open the minutes" on
               every row of a list hundreds long is absurd, so the source gets
               ONE character at the end of the row.

               A citywide decision has nowhere to fly. Its row used to return
               early and do nothing at all — a dead click, which is worse than
               no click. There the row itself opens the scan, because that is
               the only thing left to do with it. */
            <span
              key={`${d.url}-${i}`}
              className={`fx-city-record-line${hover === i ? " is-hot" : ""}`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
            >
            <button
              type="button"
              className="fx-city-record-row"
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              onClick={() => {
                if (d.at.length) onOpen(i);
                else window.open(d.url, "_blank", "noopener,noreferrer");
              }}
            >
              <span className="fx-city-record-dot" style={{ background: ink }} />
              <span className="fx-city-record-text">
                {line.tag ? <span className="fx-city-record-tag">{line.tag}</span> : null}
                {line.headline}
                {/* A record can be ONE appropriation with numbered clauses —
                    (1) Dudley Stone equipment $11,000 … (5) Wilde avenue
                    $3,039.48. `pl` reads the whole item and reports the first;
                    `line.sum` comes off the fragment on this row. Side by side
                    they read as a contradiction, so where our line already
                    prints a figure it carries the money alone. */}
                {/* A record can be ONE appropriation with numbered clauses —
                    (1) Dudley Stone equipment $11,000 … (5) Wilde avenue
                    $3,039.48. `pl` reads the whole item and reports the first;
                    `line.sum` comes off the fragment on this row. Side by side
                    they read as a contradiction, so where our line already
                    prints a figure it carries the money alone. */}
                {/* ── ONE META LINE UNDER THE SENTENCE, NOT A COLUMN BESIDE IT ──
                    The count of places used to sit against the right edge as a
                    bare "5". Two things were wrong with it. It did not say what
                    it counted — and the same slot said three different things
                    across the panels: here the places, below the number of
                    identical records, and in the block panel a DATE. And
                    naming it ("5 places") took enough width from a 288 px
                    margin to push a four-line sentence to five.

                    The money already sat under the sentence. The facts about a
                    decision belong together there, and the sentence gets the
                    full width it was written for. */}
                {(hasSum(d, line) || d.at.length > 1) ? (
                  <span className="fx-city-record-meta">
                    {hasSum(d, line) ? (
                      <span className="fx-city-record-sum">{line.sum}</span>
                    ) : null}
                    {d.at.length > 1 ? (
                      <span className="fx-city-record-n">
                        {d.at.length} places on the map
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </button>
            <a
              className="fx-city-record-src"
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the scanned page"
              title="Open the scanned page"
            >↗</a>
            </span>
          ))
        )}
        {hidden > 0 ? (
          <p className="fx-city-record-more">
            {hidden} more the record describes, not listed. Narrow it with a
            subject, or press a dot on the map.
          </p>
        ) : null}
        {/* §THE ONES THE RECORD DOES NOT DESCRIBE — said once each, with how
            many, rather than printed one identical row at a time. */}
        {mute.length ? (
          <div className="fx-city-record-mute">
            <p className="fx-city-record-more">
              And these, which the minutes name but do not describe:
            </p>
            {mute.map((m) => (
              <button
                key={m.label}
                type="button"
                className="fx-city-record-row is-mute"
                onMouseEnter={() => onHover(m.first)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(m.first)}
                onBlur={() => onHover(null)}
                onClick={() => onOpen(m.first)}
              >
                <span className="fx-city-record-dot" style={{ background: ink }} />
                <span className="fx-city-record-text">{m.label}</span>
                {/* how many rows this one stands for — a multiplier, so it
                    cannot be read as the count of places above */}
                <span className="fx-city-record-n">&times;{m.n}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
