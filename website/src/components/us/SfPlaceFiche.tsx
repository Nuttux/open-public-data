import Link from "next/link";
import type { ReactNode } from "react";
import type { SfPlaceFicheData, SfPlaceDoc } from "@/lib/us/sf-places-data";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";

/**
 * SF place fiche — the SF analogue of the Paris LieuFiche, EN-only. Section
 * order mirrors the lieu exactly: photo hero → grounded summary → the money
 * → document shelf → cross-links. Every archive document carries its own
 * source label so SFPL partnership scans are never mislabelled as
 * Democracy's Library, and the shelf is grouped + salience-capped by
 * export_sf_places.py's curate_documents() rather than dumped in linkage
 * order. See DEFLUFF_AUDIT.md for the before/after review this came from.
 */

// A place that barely cleared the publication gate (GATE_MIN_DOCS = 3 in
// export_sf_places.py) gets an honest "limited archive coverage" flag on its
// summary instead of a shorter narrative dressed up to look complete.
const THIN_DOCS_THRESHOLD = 4;

function Amt({ usd, full = false, size = 13 }: { usd: number; full?: boolean; size?: number }) {
  return (
    <span
      className="tnum"
      style={{ fontFamily: "var(--f-disp)", fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap", fontSize: size }}
    >
      {full ? fmtUsd(usd) : fmtUsdCompact(usd)}
    </span>
  );
}

/** One source link — a curated shelf entry, NOT a quote dump. Raw OCR is kept
 *  out of the reading flow (récit visible, per the Paris BMO doctrine); what a
 *  row may carry is a single OCR-grounded gloss — one plain line on what this
 *  scan shows about this place, written from the document's own text, never the
 *  old verbatim 280-char match fragment. Its deep link opens the scanned page
 *  with the match already highlighted, so the source is one click away. */
function DocRow({ doc }: { doc: SfPlaceDoc }) {
  return (
    <li className="fx-doc-row">
      <a href={doc.deep_link} target="_blank" rel="noopener noreferrer" className="fx-doc-title">
        {doc.title}
        {doc.year ? <span className="fx-doc-year"> · {doc.year}</span> : null} ↗
      </a>
      {doc.gloss ? <p className="fx-doc-gloss">{doc.gloss}</p> : null}
      {doc.creator ? <div className="fx-doc-creator">{doc.creator}</div> : null}
      <div className="fx-doc-source">
        {doc.source_label}
        {doc.variant_note ? ` · ${doc.variant_note}` : ""}
      </div>
    </li>
  );
}

/** Groups an already curated+ordered document array by its `group` label,
 *  preserving the array's order (export_sf_places.py sorts group-then-salience,
 *  so a simple first-seen grouping reproduces the intended shelf layout). */
function GroupedDocs({ docs }: { docs: SfPlaceDoc[] }) {
  const groups: { group: string; docs: SfPlaceDoc[] }[] = [];
  for (const d of docs) {
    const last = groups[groups.length - 1];
    if (last && last.group === d.group) last.docs.push(d);
    else groups.push({ group: d.group, docs: [d] });
  }
  return (
    <>
      {groups.map((g, i) => (
        <div key={`${g.group}-${i}`}>
          <div className="fx-doc-group-h">{g.group}</div>
          <ul className="fx-doc-list">
            {g.docs.map((d) => <DocRow key={d.identifier} doc={d} />)}
          </ul>
        </div>
      ))}
    </>
  );
}

function FacilityRecord({ place }: { place: SfPlaceFicheData }) {
  const f = place.facility;
  if (!f || !f.primary_address) return null;
  const owned = f.primary_is_city_owned;
  const sqft = f.total_gross_sq_ft ?? f.primary_gross_sq_ft;
  const facts: { label: string; value: ReactNode }[] = [
    { label: "Address", value: titleCase(f.primary_address) },
  ];
  // Three place-specific facts, max — address, tenure, size. District/parcel/
  // dept are footnote-grade, not tiles (the review: "trim to the 3 that matter").
  if (owned !== null) facts.push({ label: "Tenure", value: owned ? "City-owned" : "Leased" });
  if (sqft) facts.push({ label: f.n_facilities > 1 ? "Floor area · all buildings" : "Floor area", value: `${sqft.toLocaleString("en-US")} sq ft` });
  else if (f.n_facilities > 1) facts.push({ label: "On site", value: `${f.n_facilities} buildings` });
  return (
    <section className="fx-fiche-section">
      <div className="fx-fiche-h">Facility record</div>
      <div className="fx-place-facts">
        {facts.map((x, i) => (
          <div className="fx-place-fact" key={i}>
            <div className="fx-place-fact-label">{x.label}</div>
            <div className="fx-place-fact-value">{x.value}</div>
          </div>
        ))}
      </div>
      <p className="fx-fiche-note" style={{ marginTop: 10 }}>
        City Facilities registry
        {f.n_facilities > 1 ? <> · {f.n_facilities} buildings on site</> : null}
        {f.primary_block_lot ? <> · parcel {f.primary_block_lot}</> : null}
        {f.supervisor_district != null ? <> · Supervisor District {f.supervisor_district}</> : null}
      </p>
    </section>
  );
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase());
}

const MEASURE_LABEL: Record<string, string> = {
  bond_expended: "voter-bond funds spent",
  contract_paid: "paid to contractors",
  permit_declared: "declared construction value",
};

/** Spend-by-year timeline (single series: permit declared value). A
 *  magnitude-over-time bar chart — one hue, no legend (title names it), bars to
 *  baseline, native <title> hover. Renders a CONTINUOUS year axis so quiet
 *  periods read as gaps and investment waves stand out. Server-rendered inline
 *  SVG (no client JS). Suppressed under 3 data-years — the itemized permit list
 *  carries those. */
function SpendTimeline({ series }: { series: Array<{ year: number; declared_usd: number }> }) {
  const withValue = series.filter((s) => s.declared_usd > 0);
  if (withValue.length < 3) return null;
  const y0 = withValue[0].year;
  const y1 = withValue[withValue.length - 1].year;
  const byYear = new Map(series.map((s) => [s.year, s.declared_usd]));
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  const max = Math.max(...withValue.map((s) => s.declared_usd));
  const peak = withValue.reduce((a, b) => (b.declared_usd > a.declared_usd ? b : a));

  // viewBox geometry (scales to container width). Plot area + a label gutter.
  const W = 640, plotH = 96, padB = 18, padT = 16, H = plotH + padB + padT;
  const n = years.length;
  const slot = W / n;
  const barW = Math.max(3, Math.min(slot - 2, 16));

  return (
    <figure style={{ margin: "0 0 18px" }}>
      <figcaption className="fx-place-sub" style={{ marginBottom: 6 }}>
        Construction on this parcel, by year
        <span className="fx-place-contract-meta"> · declared permit value, {y0}–{y1}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" preserveAspectRatio="none"
        aria-label={`Declared construction value by year, ${y0} to ${y1}, peaking at ${fmtUsdCompact(peak.declared_usd)} in ${peak.year}.`}
        style={{ display: "block", overflow: "visible" }}>
        {/* baseline */}
        <line x1={0} y1={padT + plotH} x2={W} y2={padT + plotH} stroke="var(--rule)" strokeWidth={1} />
        {years.map((y, i) => {
          const v = byYear.get(y) || 0;
          const h = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
          const x = i * slot + (slot - barW) / 2;
          const yTop = padT + plotH - h;
          const isPeak = y === peak.year;
          return v > 0 ? (
            <g key={y}>
              <rect x={x} y={yTop} width={barW} height={h} rx={2}
                fill={isPeak ? "var(--bleu, #1f5fbf)" : "var(--ink-3, #9aa4b2)"}>
                <title>{`${y} · ${fmtUsdCompact(v)} declared`}</title>
              </rect>
              {isPeak && (
                <text x={x + barW / 2} y={yTop - 4} textAnchor="middle"
                  style={{ fontFamily: "var(--f-mono)", fontSize: 10, fill: "var(--ink)" }}>
                  {fmtUsdCompact(v)}
                </text>
              )}
            </g>
          ) : null;
        })}
        {/* sparse x labels: first, peak, last */}
        {[y0, peak.year, y1].filter((y, i, a) => a.indexOf(y) === i).map((y) => {
          const i = years.indexOf(y);
          const x = i * slot + slot / 2;
          return (
            <text key={y} x={x} y={H - 4} textAnchor="middle"
              style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, fill: "var(--muted)" }}>
              {y}
            </text>
          );
        })}
      </svg>
    </figure>
  );
}

/** The money — one merged section. Every place-specific money view lives here:
 *  the spend-by-year graph, voter-bond capital, construction permits and the
 *  vendors paid, each labelled by ledger and never summed (a bond fund pays the
 *  contracts). The department budget/payroll — identical across every
 *  same-department place — is compressed to a single grey context line, not a
 *  headline. */
function MoneySection({ place }: { place: SfPlaceFicheData }) {
  const cap = place.capital;
  const bl = place.money.budget_line;
  const pl = place.money.payroll_line;
  const contracts = place.money.contracts;
  const hasCapital = !!cap && (cap.items.length > 0 || cap.payees.length > 0 || cap.permits.length > 0);
  // contracts with dollars committed but not yet paid out (no payee row)
  const committedTotal = contracts.reduce((a, c) => a + (c.agreed_usd || 0), 0);
  const showCommitted = contracts.length > 0 && (!cap || cap.payees.length === 0);
  if (!hasCapital && !showCommitted && !bl) return null;

  const withMoney = cap?.items.filter((i) => i.amount_usd != null) ?? [];
  const named = cap?.items.filter((i) => i.amount_usd == null) ?? [];
  const bondTotal = cap?.measure_totals.bond_expended;
  const hasBond = (cap?.items.length ?? 0) > 0;
  return (
    <section className="fx-fiche-section">
      <div className="fx-fiche-h">The money</div>
      {cap && <SpendTimeline series={cap.permits_by_year} />}
      {cap && hasBond && (bondTotal ? (
        <p className="fx-place-money-line">
          At least <Amt usd={bondTotal} /> of voter-approved bond funds have been spent on work
          named for this place{cap.bond_programs.length ? <> ({cap.bond_programs.join("; ")} bond{cap.bond_programs.length > 1 ? "s" : ""})</> : null}.
        </p>
      ) : (
        <p className="fx-place-money-line">
          Funded under {cap.bond_programs.length ? <>the {cap.bond_programs.join("; ")} bond{cap.bond_programs.length > 1 ? "s" : ""}</> : "voter-approved bonds"}.
          The dollar figures for these are reported at the program level, not per project.
        </p>
      ))}
      {withMoney.length > 0 && (
        <ul className="fx-place-contracts">
          {withMoney.map((i, k) => (
            <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ flex: 1 }}>
                {titleCaseItem(i.item_name)}
                <span className="fx-doc-source">
                  {i.bond_program ? `${i.bond_program} bond · ` : ""}
                  {i.amount_measure ? MEASURE_LABEL[i.amount_measure] : ""}
                  {i.voter_approved_date ? ` · approved ${i.voter_approved_date.slice(0, 4)}` : ""}
                </span>
              </span>
              {i.amount_usd != null && <Amt usd={i.amount_usd} />}
            </li>
          ))}
        </ul>
      )}
      {named.length > 0 && (
        <>
          <p className="fx-place-sub" style={{ marginTop: withMoney.length ? 14 : 6 }}>
            Bond-funded projects here:
          </p>
          <ul className="fx-place-named-projects">
            {named.map((i, k) => (
              <li key={k}>
                {titleCaseItem(i.item_name)}
                {i.bond_program ? <span className="fx-place-contract-meta"> · {i.bond_program}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {cap && cap.permits.length > 0 && (
        <>
          <p className="fx-place-sub" style={{ marginTop: hasBond ? 16 : 2 }}>
            Construction permits on this parcel
            <span className="fx-place-contract-meta"> · {cap.n_permits} permit{cap.n_permits === 1 ? "" : "s"}, {" "}
              {fmtUsdCompact(cap.permits_total_declared)} declared value</span>
          </p>
          <ul className="fx-place-contracts">
            {cap.permits.map((pm, k) => (
              <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ flex: 1 }}>
                  {sentenceCase(pm.description || "Construction permit")}
                  <span className="fx-doc-source">
                    {pm.permit_year ? `${pm.permit_year}` : ""}{pm.status ? ` · ${pm.status}` : ""}
                  </span>
                </span>
                {pm.declared_cost_usd != null && <Amt usd={pm.declared_cost_usd} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {cap && cap.payees.length > 0 && (
        <>
          <p className="fx-place-sub" style={{ marginTop: (hasBond || cap.permits.length) ? 16 : 2 }}>
            Paid for work here <span className="fx-place-contract-meta">· {cap.n_payees} vendor{cap.n_payees === 1 ? "" : "s"} on this place&rsquo;s contracts</span>
          </p>
          <ul className="fx-place-contracts">
            {cap.payees.map((py, k) => (
              <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ flex: 1 }}>
                  {titleCaseItem(py.vendor)}
                  {py.first_fiscal_year ? (
                    <span className="fx-doc-source">
                      FY{py.first_fiscal_year}{py.last_fiscal_year && py.last_fiscal_year !== py.first_fiscal_year ? `–${py.last_fiscal_year}` : ""}
                      {py.n_contracts > 1 ? ` · ${py.n_contracts} contracts` : ""}
                    </span>
                  ) : null}
                </span>
                <Amt usd={py.paid_usd} />
              </li>
            ))}
          </ul>
        </>
      )}
      {showCommitted && committedTotal > 0 && (
        <p className="fx-place-money-line" style={{ marginTop: hasCapital ? 14 : 2 }}>
          <b className="tnum">{contracts.length}</b> city contract{contracts.length === 1 ? "" : "s"} name{contracts.length === 1 ? "s" : ""} this
          place — <Amt usd={committedTotal} /> committed, payments not yet flowing.
        </p>
      )}
      {(hasCapital || showCommitted) && (
        <p className="fx-fiche-note" style={{ marginTop: 10 }}>
          Figures come from different city ledgers (voter bonds, contracts, permits) and are not additive —
          a bond fund pays the contracts for the same job. Sources: SF GO Bond program, vendor vouchers,
          building permits (DataSF).
        </p>
      )}
      {bl && (
        <p className="fx-fiche-note" style={{ marginTop: hasCapital || showCommitted ? 6 : 0 }}>
          Operated by the{" "}
          <Link href={`/us/city/sf/budget/dept/${deptSlug(bl.code)}?year=${bl.fiscal_year}`}>{bl.name}</Link>
          {" — "}department budget <Amt usd={bl.total_usd} />
          {pl ? <>, {pl.n_employees.toLocaleString("en-US")} staff citywide</> : null} (FY{bl.fiscal_year}), not this place&rsquo;s own.
        </p>
      )}
    </section>
  );
}

function titleCaseItem(s: string) {
  // Keep known acronyms upper; title-case the rest for readability.
  return s.replace(/\w\S*/g, (t) =>
    /^(ZSFG|LHH|SFGH|RP|COF|PES|EEI|NPC|IT|RR)$/i.test(t) ? t.toUpperCase() : t.charAt(0) + t.slice(1).toLowerCase(),
  );
}

/** Permit descriptions arrive all-lowercase; capitalize the first letter and
 *  trim to a readable length (they can be long paragraphs). */
function sentenceCase(s: string) {
  const clean = s.trim();
  const short = clean.length > 130 ? clean.slice(0, 127).replace(/\s+\S*$/, "") + "…" : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export default function SfPlaceFiche({ place }: { place: SfPlaceFicheData }) {
  const bl = place.money.budget_line;
  const contracts = place.money.contracts;

  const shownDocs = place.documents.filter((d) => d.salient);
  const hiddenDocs = place.documents.filter((d) => !d.salient);
  const thin = place.documents.length <= THIN_DOCS_THRESHOLD;

  // Headline: ONE place-specific money figure (the largest across ledgers,
  // labelled by its own measure) — replaces the old dept-budget KPI that read
  // identically on every same-department fiche. Falls back to nothing when the
  // place has no place-level money (its story is then the archive + facility).
  const cap = place.capital;
  const headlineCandidates = [
    cap?.measure_totals.bond_expended
      ? { value: cap.measure_totals.bond_expended, label: "voter-bond capital spent on work here" }
      : null,
    cap?.payees_total_paid
      ? { value: cap.payees_total_paid, label: "paid to contractors for work here" }
      : null,
    cap?.permits_total_declared
      ? { value: cap.permits_total_declared, label: "construction permitted on this parcel" }
      : null,
  ].filter((x): x is { value: number; label: string } => x != null && x.value > 0);
  const headline = headlineCandidates.sort((a, b) => b.value - a.value)[0] ?? null;

  const familyAll = loadSfPlacesIndex().filter((p) => p.slug !== place.slug);
  let related = familyAll.filter((p) => p.family === place.family);
  let relatedTitle = "Same kind";
  if (related.length < 2) {
    related = familyAll.filter((p) => p.owning_dept_code === place.owning_dept.code);
    relatedTitle = `Also from the ${place.owning_dept.name}`;
  }
  related = related.slice(0, 4);

  return (
    <div className="fx-place-fiche">
      {/* ── Photo hero ── */}
      {place.photo && (
        <div className="fx-fiche-thumb-wrap" style={{ position: "relative", marginBottom: 22 }}>
          <img
            src={place.photo}
            alt={place.name}
            className="fx-fiche-thumb"
            style={{ aspectRatio: "16 / 9", width: "100%", objectFit: "cover", display: "block" }}
          />
          {place.photo_credit && (
            <span
              style={{
                position: "absolute", right: 8, bottom: 8, background: "rgba(10,10,10,.72)",
                color: "#fff", fontFamily: "var(--f-mono)", fontSize: 9, padding: "3px 7px",
              }}
            >
              {place.photo_credit.source}
              {" · "}
              <a href={place.photo_credit.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
                {place.photo_credit.author}
              </a>
              {" · "}
              {place.photo_credit.license_url ? (
                <a href={place.photo_credit.license_url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
                  {place.photo_credit.license}
                </a>
              ) : (
                place.photo_credit.license
              )}
            </span>
          )}
        </div>
      )}

      {/* ── Grounded summary ── */}
      {place.summary_en && (
        <div className="fx-fiche-grounded" {...(thin ? { "data-low": "" } : {})}>
          <div className="fx-fiche-grounded-head">Grounded summary</div>
          <p className="fx-fiche-grounded-body">{place.summary_en}</p>
          <div className="fx-fiche-grounded-meta">
            <span>
              <b>Built from:</b> {place.documents.length} archive document{place.documents.length === 1 ? "" : "s"}
              {contracts.length > 0 ? `, ${contracts.length} contract${contracts.length === 1 ? "" : "s"}` : ""}
              {bl ? ", city budget data" : ""} — no outside knowledge added.
            </span>
          </div>
          {thin && (
            <p className="fx-fiche-note" style={{ marginTop: 8 }}>
              Archive coverage for this place is limited — only {place.documents.length} matched documents so far,
              so this summary stays short rather than padded.
            </p>
          )}
        </div>
      )}

      {/* ── Headline stat — one place-specific money figure ── */}
      {headline && (
        <div className="fx-place-headline">
          <div className="fx-place-headline-value tnum">{fmtUsd(headline.value)}</div>
          <div className="fx-place-headline-label">{headline.label}</div>
        </div>
      )}

      {/* ── Facility record (6A structured identity) ── */}
      <FacilityRecord place={place} />

      {/* ── The money — one merged section: graph + bonds + permits + payees ── */}
      <MoneySection place={place} />

      {/* ── Archive document shelf ── */}
      {place.documents.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h fx-fiche-h--moments">Sources in the archive</div>
          <p className="fx-place-sub">
            The {place.documents.length} document{place.documents.length === 1 ? "" : "s"} behind the summary above,
            held at the Internet Archive — Democracy&rsquo;s Library plus IA&rsquo;s San Francisco Public Library
            partnership scans. Every link opens the scanned page with the match highlighted.
          </p>
          <GroupedDocs docs={shownDocs} />
          {hiddenDocs.length > 0 && (
            <details>
              <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "12px 0" }}>
                See all {place.documents.length} documents →
              </summary>
              <GroupedDocs docs={hiddenDocs} />
            </details>
          )}
        </section>
      )}

      {/* ── Sources ── */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Sources</div>
        <p className="fx-fiche-note" style={{ marginTop: 0 }}>
          {place.sources.map((s, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              <b>{s.label}</b>: {s.note}
            </span>
          ))}
        </p>
      </section>

      {/* ── Cross-links ── */}
      {related.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{relatedTitle}</div>
          <div className="fx-voisins">
            {related.map((p) => (
              <Link key={p.slug} href={`/us/city/sf/places/place/${p.slug}`} scroll={false} className="fx-voisin">
                {p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span className="fx-voisin-noimg" />}
                <span className="fx-voisin-name">{p.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
