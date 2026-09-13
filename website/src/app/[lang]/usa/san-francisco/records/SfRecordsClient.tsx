"use client";

import { useMemo, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   /us/city/sf/records — the record table, explained.

   THE PAGE'S ONE JOB IS TO STOP A READER MISCOUNTING. A table with a `topic`
   column invites exactly one mistake: reading the topic counts as if they
   described the whole record. They do not — about one row in eight is not a
   decision at all, and some decisions carry an action with no subject. Every
   number here is shown against the denominator it belongs to.

   AND THE SHARE WITHOUT A TOPIC IS NOT A QUEUE. Every row has now been read,
   so "rows minus rows-with-a-topic" is no longer backlog; it is two settled
   answers added together — rows with no act in them to have a subject, and
   decisions whose printed formula fixed what the Board did without saying
   what about. Shown as one grey remainder they read as unfinished work, which
   is the same miscounting in a different place, so they are shown apart.

   EVERY SUBJECT FIGURE ON THIS PAGE IS OVER DECISIONS. That is not a style
   choice: a bare vote outcome carries the topic running-the-city /
   vote-or-scheduling, which is true of the row and says the Board voted rather
   than what about. Counted into the topic chart it doubled that topic and
   lifted it from fifth place to third — the page breaking its own counting
   rule, printed at the bottom of the same page. `verify_all.py` now asserts the
   denominator instead of trusting this comment.
   ═══════════════════════════════════════════════════════════════════════ */

export interface RecordsSchema {
  name: string;
  rows: number;
  counting_rules: string[];
  columns: { name: string; what?: string; values?: string[] }[];
}

/* EVERY SUBJECT FIGURE HERE IS OVER DECISIONS. A bare vote outcome carries the
   topic `running-the-city / vote-or-scheduling`, which is true of the row and is
   not a subject — it says the Board voted, not what about. Tallied over all rows
   with a topic it doubled that topic and moved it up the chart. The fields are
   named `..._decisions` / `decisions_..._by_decade` so the denominator travels
   with the number and cannot be picked up by accident. */
export interface RecordsStats {
  rows: number;
  years: [number, number];
  read: number;
  decisions: number;
  decisions_with_topic: number;
  decisions_without_topic: number;
  download_bytes: number;
  record_type: [string, number][];
  topic_decisions: [string, number][];
  action: [string, number][];
  how_we_know_where: [string, number][];
  classified_by: [string, number][];
  decisions_by_decade: [number, number][];
  decisions_with_topic_by_decade: [number, number][];
}

/* The one categorical ramp this section uses. The same eight the map draws its
   marks in, in the same order — see `lib/citygl/layers/theme-marks.ts` §THE INK
   for the measurement that chose them, and re-run the validator there if this
   order changes, because the checks are on ADJACENT pairs.

   IT MATTERS MORE HERE THAN ON THE MAP. The map lights one subject at a time
   and says so; the topic chart below prints all eight at once, so a reader IS
   asked to tell them apart. The set this replaced could not support that: its
   orange and its red were ΔE 4.6 apart, near-twins in a chart that stacks them
   five rows from each other. These hold ΔE 13.8 across every pair. */
const INK = ["#a80391", "#e15f0a", "#6029c6", "#04a322",
             "#058dfa", "#d60b49", "#006b9a", "#00a19d"];
const UNCLASSIFIED = "#8a8578";

const n = (x: number) => x.toLocaleString("en-US");
const pct = (a: number, b: number) => `${((100 * a) / Math.max(b, 1)).toFixed(1)}%`;

function Bar({ parts, total }: {
  parts: { label: string; value: number; colour: string }[];
  total: number;
}) {
  return (
    <div style={{ display: "flex", height: 26, borderRadius: 5, overflow: "hidden",
                  border: "1px solid var(--rule, #e4e6ea)" }}>
      {parts.map((p) => (
        <div
          key={p.label}
          title={`${p.label} — ${n(p.value)} (${pct(p.value, total)})`}
          style={{ width: `${(100 * p.value) / Math.max(total, 1)}%`,
                   background: p.colour }}
        />
      ))}
    </div>
  );
}

export default function SfRecordsClient({ schema, stats }: {
  schema: RecordsSchema;
  stats: RecordsStats;
}) {
  const [openCol, setOpenCol] = useState<string | null>(null);

  /* NOT `rows - decisions`. `record_type` is only filled on rows that have been
     read, so subtracting from the whole corpus counted every unread row as
     "not a decision" and put 72% on the page — a false claim, and exactly the
     miscounting this page exists to prevent. The denominator is the read set. */
  const typed = stats.record_type.reduce((a, [, v]) => a + v, 0);
  const notADecision = typed - stats.decisions;

  /* The three-way split the honesty bar draws. It has to be three and not two:
     a row with no act in it and a decision whose formula named no subject are
     both final, and both would look like backlog inside one grey bar.
     `noSubject` is derived rather than read so the three always sum to `typed`
     even if a future column changes what counts as read. */
  const withSubject = stats.decisions_with_topic;
  const noSubject = stats.decisions_without_topic;
  const unread = stats.rows - stats.read;

  /* Read from `classified_by` rather than written down here, so the sentence
     below cannot drift from the seed. It is 0 before the purpose-clause pass
     has ever run, and the sentence is dropped at 0 rather than printed empty. */
  const fromPurpose =
    stats.classified_by.find(([k]) => k === "purpose-clause")?.[1] ?? 0;

  /* per decade: how much of each has been classified. The point of showing it
     by decade rather than as one number is that the Board's language changes
     completely across the century — a single figure would be carried by
     whichever era happens to be biggest and would hide a hole in another. */
  const decades = useMemo(() => {
    const done = new Map(stats.decisions_with_topic_by_decade);
    return stats.decisions_by_decade.map(([d, tot]) => ({
      decade: d, total: tot, done: done.get(d) ?? 0,
    }));
  }, [stats]);
  const maxDecade = Math.max(...decades.map((d) => d.total), 1);

  return (
    <main className="theme-fusion rec" style={{ padding: "0 0 80px" }}>
      {/* THE FIXED GRID COLUMNS HAD TO GO ON A PHONE. At 390px a 190px label
          column leaves 120px for a sentence, which is a strip rather than a
          line. Inline styles cannot carry a media query, so the three grids
          and the column list are named here and stacked below 720px. */}
      <style>{`
        .rec .row3 { display: grid; align-items: center; gap: 12px; }
        .rec .row-decade { grid-template-columns: 58px 1fr 118px; }
        .rec .row-topic  { grid-template-columns: 180px 1fr 108px; }
        .rec .row-by     { grid-template-columns: 104px 1fr 84px; }
        .rec .colhead    { display: grid; grid-template-columns: 190px 1fr 22px;
                           gap: 12px; align-items: baseline; }
        .rec .colvals    { padding: 0 16px 14px 206px; }
        @media (max-width: 720px) {
          /* 78px wrapped "27,633 · 25.9%" onto two lines against a one-line
             label, which read as a second row rather than a figure. */
          .rec .row-topic { grid-template-columns: 1fr 104px; }
          .rec .row-topic .bar { display: none; }
          .rec .row-by,
          .rec .colhead   { grid-template-columns: 1fr; gap: 4px; }
          .rec .colhead .plus { display: none; }
          .rec .colvals   { padding: 0 16px 14px 16px; }
          .rec h1         { font-size: 30px !important; }
        }
      `}</style>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 22px" }}>

        {/* ── what this is ─────────────────────────────────────────── */}
        <header style={{ padding: "48px 0 8px" }}>
          <p style={{ font: "600 11px/1 var(--f-mono, ui-monospace, monospace)",
                      letterSpacing: ".1em", textTransform: "uppercase",
                      color: "var(--muted, #6b6355)", margin: "0 0 14px" }}>
            San Francisco · the record, as data
          </p>
          <h1 style={{ font: "600 40px/1.1 var(--f-serif, Georgia, serif)",
                       margin: "0 0 16px", letterSpacing: "-.01em" }}>
            Everything the Board decided, {stats.years[0]}–{stats.years[1]}
          </h1>
          <p style={{ font: "17px/1.6 var(--f-sans, system-ui)", maxWidth: 660,
                      margin: "0 0 6px" }}>
            {n(stats.rows)} rows. One row is one thing the Board of Supervisors
            dealt with — a paving order, a liquor licence, a lawsuit settled, a
            street closed for an afternoon. Each carries the line as printed, a
            link to the scanned page it was read from, and, where we know it,
            where it happened.
          </p>
        </header>

        {/* ── the download ─────────────────────────────────────────── */}
        <section style={{ display: "flex", gap: 10, flexWrap: "wrap",
                          alignItems: "center", padding: "18px 0 34px" }}>
          <a
            href="/data/us/sf/city/records/sf_bos_records.csv.gz"
            style={{ font: "600 14px/1 var(--f-sans, system-ui)",
                     padding: "13px 18px", borderRadius: 7, textDecoration: "none",
                     background: "var(--ink, #1a1a19)", color: "var(--surface, #fff)" }}
          >
            Download the table · {(stats.download_bytes / 1e6).toFixed(0)} MB
          </a>
          <a
            href="/data/us/sf/city/records/sf_bos_records.preview.csv"
            style={{ font: "14px/1 var(--f-sans, system-ui)", padding: "13px 18px",
                     borderRadius: 7, textDecoration: "none",
                     border: "1px solid var(--rule, #e4e6ea)",
                     color: "var(--ink, #1a1a19)" }}
          >
            Preview the first 500 rows
          </a>
          <span style={{ font: "13px/1.5 var(--f-sans, system-ui)",
                         color: "var(--muted, #6b6355)" }}>
            gzipped CSV · every spreadsheet and every data tool opens it
          </span>
        </section>

        {/* ── the honesty block, before anything else ──────────────── */}
        <section style={{ border: "1px solid var(--rule, #e4e6ea)", borderRadius: 9,
                          padding: "22px 24px", margin: "0 0 40px" }}>
          <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                       margin: "0 0 14px" }}>
            What this table can and cannot tell you
          </h2>

          <p style={{ font: "15px/1.6 var(--f-sans, system-ui)", margin: "0 0 16px" }}>
            Every row has been read and sorted — {n(stats.read)} of{" "}
            {n(stats.rows)}. That does not mean every row has a subject.{" "}
            {noSubject > 0
              ? "The two reasons a row has none are different enough that adding them together would be misleading."
              : "A row without one is a row that is not a decision — a running footer, an index row, a line cut in half, a bare vote outcome, or what a member of the public said about a file. None of those is an act of the Board, and none of them has a subject to give."}
          </p>
          <Bar
            total={stats.rows}
            parts={[
              { label: "a decision, with a subject", value: withSubject,
                colour: INK[2] },
              /* Dropped at 0 rather than drawn as a zero-width sliver with a
                 label nobody can read. It reached 0 on 2026-09-03; the segment
                 stays in the code because the number can come back the moment
                 the corpus grows. */
              ...(noSubject > 0
                ? [{ label: "a decision, no subject in the line",
                     value: noSubject, colour: INK[3] }]
                : []),
              { label: "not a decision", value: notADecision,
                colour: UNCLASSIFIED },
              ...(unread > 0
                ? [{ label: "not yet read", value: unread, colour: "#c9c4b8" }]
                : []),
            ]}
          />
          <p style={{ font: "13px/1.5 var(--f-sans, system-ui)",
                      color: "var(--muted, #6b6355)", margin: "10px 0 22px" }}>
            <span style={{ color: INK[2] }}>■</span> a decision, with a subject{" "}
            {n(withSubject)}
            {"   "}
            {noSubject > 0 ? (
              <>
                <span style={{ color: INK[3] }}>■</span> a decision, no subject in
                the line {n(noSubject)}
                {"   "}
              </>
            ) : null}
            <span style={{ color: UNCLASSIFIED }}>■</span> not a decision{" "}
            {n(notADecision)}
          </p>

          <p style={{ font: "15px/1.6 var(--f-sans, system-ui)", margin: "0 0 12px" }}>
            <strong>{n(notADecision)}</strong> rows ({pct(notADecision, typed)}) are
            not a decision at all. Scanning a century of printed minutes picks up
            running footers, index rows, lines cut in half by a page break, and
            bare vote outcomes — <em>“Resolution No. 341-25 ADOPTED”</em>, where the
            description of what was voted on lives in a different row. They are
            kept, so what was set aside can be audited, and they are marked so
            nobody sums them by accident.
          </p>

          <p style={{ font: "15px/1.6 var(--f-sans, system-ui)", margin: "0 0 8px" }}>
            Of the {n(stats.decisions)} rows that are decisions,{" "}
            <strong>{n(withSubject)}</strong> ({pct(withSubject, stats.decisions)})
            say what they are about.{" "}
            {noSubject > 0
              ? `The remaining ${n(noSubject)} carry what the Board did and not what about.`
              : "There is no remainder: every decision in the corpus now carries one."}{" "}
            Most rows were sorted by their
            opening formula, which is shared by thousands of records at a time and
            settles the verb without settling the subject: <em>“the sum of $1,250
            be and the same is hereby set aside, appropriated and authorized to be
            expended”</em> is an appropriation every time, and the money is for a
            sewer in one line and for litigation in the next.
          </p>

          {fromPurpose > 0 ? (
            <p style={{ font: "15px/1.6 var(--f-sans, system-ui)", margin: "0 0 8px" }}>
              The subject, when the line carries one, is further along: after{" "}
              <em>for the purpose of</em>, <em>in payment to</em>,{" "}
              <em>for the construction of</em>. That clause was pulled out and read
              on its own — never keyed to the opening formula, which those rows
              share with thousands that are already sorted — and it recovered{" "}
              <strong>{n(fromPurpose)}</strong> subjects.{" "}
              {noSubject > 0
                ? `The ${n(noSubject)} left are the lines where it named nothing single either: an appropriation that pays for four unrelated things at once, a modern agenda line whose project is defined in the file it points at, a fragment of debate that never names the measure being debated. They keep their action and an empty topic rather than the topic of whichever record was read first.`
                : "What it did not reach was read afterwards, a sentence-shape at a time. Most of that turned out not to be a decision with a missing subject at all — it was a record cut in half by a page break, a supervisor’s remark during debate, or the Board’s own standing rule printed on the agenda — and those are typed as what they are rather than given a subject they never had."}
            </p>
          ) : null}
        </section>

        {/* ── how much of each decade ──────────────────────────────── */}
        <section style={{ margin: "0 0 44px" }}>
          <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                       margin: "0 0 6px" }}>
            How much of each decade says what it is about
          </h2>
          <p style={{ font: "14px/1.6 var(--f-sans, system-ui)",
                      color: "var(--muted, #6b6355)", margin: "0 0 18px",
                      maxWidth: 620 }}>
            Decisions only — the bar for a decade is the decisions in it
            {noSubject > 0
              ? ", and the grey is the ones that were read and name no subject"
              : ", and every one of them names a subject, so no decade carries a grey remainder"}.{" "}
            Every decade has
            been read end to end. Shown by decade rather than as one figure because
            the Board’s language changes completely across the century — a single
            number would be carried by whichever era is biggest and would hide a
            thin patch in another.
          </p>
          <div style={{ display: "grid", gap: 5 }}>
            {decades.map((d) => (
              <div key={d.decade} className="row3 row-decade">
                <span className="tnum"
                      style={{ font: "13px/1 var(--f-mono, ui-monospace, monospace)",
                               color: "var(--muted, #6b6355)" }}>
                  {d.decade}s
                </span>
                <div style={{ position: "relative", height: 17 }}>
                  <div style={{ position: "absolute", inset: 0,
                                width: `${(100 * d.total) / maxDecade}%`,
                                background: UNCLASSIFIED, opacity: 0.35,
                                borderRadius: 3 }} />
                  <div style={{ position: "absolute", inset: 0,
                                width: `${(100 * d.done) / maxDecade}%`,
                                background: INK[2], borderRadius: 3 }} />
                </div>
                <span className="tnum"
                      style={{ font: "12px/1 var(--f-mono, ui-monospace, monospace)",
                               color: "var(--muted, #6b6355)", textAlign: "right" }}>
                  {n(d.done)} / {n(d.total)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── where it happened ────────────────────────────────────── */}
        <section style={{ margin: "0 0 44px" }}>
          <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                       margin: "0 0 6px" }}>
            How precisely the record says where
          </h2>
          <p style={{ font: "14px/1.6 var(--f-sans, system-ui)",
                      color: "var(--muted, #6b6355)", margin: "0 0 18px",
                      maxWidth: 620 }}>
            Not a yes or a no. A record that prints its own assessor block and one
            that says “somewhere on Mission Street” are both located, and only one
            of them can carry a dot on a map. Merging them would be inventing a
            precision the Board never wrote down.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse",
                          font: "14px/1.5 var(--f-sans, system-ui)" }}>
            <tbody>
              {stats.how_we_know_where.map(([k, v]) => {
                const dottable = k !== "street only" && k !== "no place given";
                return (
                  <tr key={k} style={{ borderTop: "1px solid var(--rule, #e4e6ea)" }}>
                    <td style={{ padding: "9px 0" }}>{k}</td>
                    <td style={{ padding: "9px 0", color: "var(--muted, #6b6355)",
                                 fontSize: 13 }}>
                      {dottable ? "can carry a dot" : "located, but never dotted"}
                    </td>
                    <td className="tnum"
                        style={{ padding: "9px 0", textAlign: "right",
                                 font: "13px/1 var(--f-mono, ui-monospace, monospace)" }}>
                      {n(v)}
                    </td>
                    <td className="tnum"
                        style={{ padding: "9px 0 9px 14px", textAlign: "right",
                                 width: 62, color: "var(--muted, #6b6355)",
                                 font: "13px/1 var(--f-mono, ui-monospace, monospace)" }}>
                      {pct(v, stats.rows)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── what it is about ─────────────────────────────────────── */}
        {stats.topic_decisions.length > 0 ? (
          <section style={{ margin: "0 0 44px" }}>
            <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                         margin: "0 0 6px" }}>
              What the record is about
            </h2>
            <p style={{ font: "14px/1.6 var(--f-sans, system-ui)",
                        color: "var(--muted, #6b6355)", margin: "0 0 18px",
                        maxWidth: 620 }}>
              Out of the {n(withSubject)} <em>decisions</em> that say what they are
              about — not out of {n(stats.rows)} rows. Bare vote outcomes are left
              out on purpose: <em>“Resolution No. 341-25 ADOPTED”</em> is filed
              under running the city, which is true of the row and is not a
              subject; counting those rows in doubles that topic and moves it up
              the chart. Every decision has at most one topic, so these add up.
            </p>
            <p style={{ font: "14px/1.6 var(--f-sans, system-ui)",
                        color: "var(--muted, #6b6355)", margin: "0 0 18px",
                        maxWidth: 620 }}>
              <strong>The street being first is the record, not a sampling
              artefact.</strong> Grades, sidewalk widths, acceptances and closures
              are what a nineteenth-century board of supervisors mostly did, and it
              wrote them in the most repetitive language it had.{" "}
              {noSubject > 0
                ? `What this chart cannot show is the ${n(noSubject)} decisions (${pct(noSubject, stats.decisions)} of them) whose line names an act and no subject. They are too few to tilt the eight, and they are not missing evenly from them: an appropriation belongs to whatever it paid for, so where the line never says, the topic is left empty rather than guessed.`
                : "Every decision is on this chart — there is no set held back for want of a subject. Where an appropriation’s line never said what the money was for, the fund it came out of did: Sewer Fund, Municipal Railway Construction, Hospital-Jail Completion. That is the City’s own word for the purpose, printed in the record, not a guess about it."}
            </p>
            <div style={{ display: "grid", gap: 5 }}>
              {stats.topic_decisions.map(([label, v], i) => (
                <div key={label} className="row3 row-topic">
                  <span style={{ font: "14px/1.3 var(--f-sans, system-ui)" }}>
                    {label}
                  </span>
                  <div className="bar"
                       style={{ height: 17, borderRadius: 3,
                                width: `${(100 * v) / stats.topic_decisions[0][1]}%`,
                                background: INK[i % INK.length] }} />
                  <span className="tnum"
                        style={{ font: "12px/1 var(--f-mono, ui-monospace, monospace)",
                                 color: "var(--muted, #6b6355)", textAlign: "right" }}>
                    {n(v)} · {pct(v, withSubject)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── who read what ────────────────────────────────────────── */}
        <section style={{ margin: "0 0 44px" }}>
          <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                       margin: "0 0 6px" }}>
            How each row was sorted
          </h2>
          <p style={{ font: "14px/1.6 var(--f-sans, system-ui)",
                      color: "var(--muted, #6b6355)", margin: "0 0 16px",
                      maxWidth: 660 }}>
            The <code>classified_by</code> column says which. It is on every row so
            you can filter to only what was read directly, and judge the rest for
            yourself.
          </p>
          <dl style={{ margin: 0, font: "14px/1.6 var(--f-sans, system-ui)" }}>
            {[
              ["record", "a person read this row"],
              ["form", "a person read the sentence-shape this row shares with others. The Board wrote the same sentence thousands of times with the address swapped; the shape was read once"],
              ["purpose-clause", "a person read the purpose clause — what follows “for the purpose of”, “in payment to”, “for the construction of”. These rows already had an action from their opening formula; the clause is what named the subject, and it was read on its own so that a subject written here could not reach back and re-topic the thousands of rows sharing the same opening"],
              ["near-duplicate", "the same sentence as a row a person read, with different scan errors. The Journal reprints an ordinance at every reading and the two printings scan differently"],
              ["rule", "a pattern that agreed with a person 90–100% of the time on a blind sample. Only three families earned this — the rest scored between nothing and two-thirds and were thrown away"],
              ["", "not yet sorted"],
            ].map(([k, v]) => {
              /* The empty key is the rows no pass reached. It is derived, not
                 read, because `classified_by` only tallies keys that exist —
                 and it disappears from the list at zero like every other row,
                 so the page cannot keep advertising a queue that is empty. */
              const count = k === ""
                ? stats.rows - stats.classified_by.reduce((a, [, v2]) => a + v2, 0)
                : stats.classified_by.find(([kk]) => kk === k)?.[1];
              if (!count) return null;
              return (
                <div key={k || "none"} className="row3 row-by"
                     style={{ padding: "10px 0",
                              borderTop: "1px solid var(--rule, #e4e6ea)" }}>
                  <dt style={{ font: "13px/1.5 var(--f-mono, ui-monospace, monospace)" }}>
                    {k || "(empty)"}
                  </dt>
                  <dd style={{ margin: 0, color: "var(--muted, #6b6355)" }}>{v}</dd>
                  <dd className="tnum"
                      style={{ margin: 0, textAlign: "right",
                               font: "13px/1.5 var(--f-mono, ui-monospace, monospace)" }}>
                    {n(count)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        {/* ── the columns ──────────────────────────────────────────── */}
        <section style={{ margin: "0 0 44px" }}>
          <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                       margin: "0 0 18px" }}>
            The columns
          </h2>
          <div style={{ border: "1px solid var(--rule, #e4e6ea)", borderRadius: 9,
                        overflow: "hidden" }}>
            {schema.columns.map((c, i) => {
              const open = openCol === c.name;
              return (
                <div key={c.name}
                     style={{ borderTop: i ? "1px solid var(--rule, #e4e6ea)" : "none" }}>
                  <button
                    type="button"
                    onClick={() => setOpenCol(open ? null : c.name)}
                    aria-expanded={open}
                    className="colhead"
                    style={{ width: "100%", textAlign: "left",
                             padding: "12px 16px", background: "none",
                             border: "none", cursor: c.values ? "pointer" : "default",
                             font: "14px/1.5 var(--f-sans, system-ui)" }}
                  >
                    <code style={{ font: "13px/1.5 var(--f-mono, ui-monospace, monospace)" }}>
                      {c.name}
                    </code>
                    <span style={{ color: "var(--muted, #6b6355)" }}>
                      {c.what ??
                        (c.values ? `one of ${c.values.length}` : "")}
                    </span>
                    <span aria-hidden className="plus"
                          style={{ color: "var(--muted, #6b6355)" }}>
                      {c.values ? (open ? "−" : "+") : ""}
                    </span>
                  </button>
                  {open && c.values ? (
                    <div className="colvals"
                         style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {c.values.map((v) => (
                        <code key={v}
                              style={{ font: "12px/1 var(--f-mono, ui-monospace, monospace)",
                                       padding: "5px 8px", borderRadius: 4,
                                       border: "1px solid var(--rule, #e4e6ea)" }}>
                          {v || "(empty)"}
                        </code>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── counting rules ───────────────────────────────────────── */}
        <section style={{ margin: "0 0 20px" }}>
          <h2 style={{ font: "600 19px/1.3 var(--f-sans, system-ui)",
                       margin: "0 0 6px" }}>
            Counting rules
          </h2>
          <p style={{ font: "14px/1.6 var(--f-sans, system-ui)",
                      color: "var(--muted, #6b6355)", margin: "0 0 16px",
                      maxWidth: 660 }}>
            So that two people counting the same thing get the same answer.
          </p>
          <ol style={{ font: "15px/1.7 var(--f-sans, system-ui)",
                       paddingLeft: 22, margin: 0 }}>
            {schema.counting_rules.map((r) => (
              <li key={r} style={{ marginBottom: 8 }}>{r}</li>
            ))}
          </ol>
        </section>

        <p style={{ font: "13px/1.6 var(--f-sans, system-ui)",
                    color: "var(--muted, #6b6355)", borderTop:
                      "1px solid var(--rule, #e4e6ea)", paddingTop: 18 }}>
          Built from 142 Board of Supervisors Journal volumes (1906–1999), the
          Clerk’s own published minutes (2000–2026), and San Francisco’s parcel
          and assessor-block registers. Every row links to the scanned page it was
          read from. The pipeline that produces this table is in the repository.
        </p>
      </div>
    </main>
  );
}
