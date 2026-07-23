"use client";

import { useState } from "react";
import type { SfTimeline, SfTimelinePoint } from "@/lib/us/sf-budget-data";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";

/**
 * SF 150-year budget time machine — one scrubbable series of total city
 * finances from the 1880s to today, fusing the modern budget mart with verbatim
 * figures transcribed from Internet-Archive-scanned serial financial reports.
 *
 * Honesty is the whole design:
 *   - value_nominal (the scan figure) is the anchor; value_real_today and
 *     value_real_per_capita are clearly-labelled derived transforms toggled by
 *     the reader, each sourced in the footnote — they never replace the nominal.
 *   - Two tiers are NEVER merged into one authoritative line: `live` is solid,
 *     `archive` is dotted and captioned "as reported in the scan". The gap
 *     between them is left honest, not bridged.
 *   - Selecting an archive point shows its verbatim OCR quote + the scanned page
 *     thumbnail + a page-level deep link — visible in every toggle mode.
 *
 * Server-rendered inline SVG (no chart library), matching the SpendTimeline
 * house style: continuous year axis, one accent hue, theme-aware CSS vars,
 * native focus/hover. A log y-axis keeps an 1888 $3.7M figure and a 2025 $15.9B
 * figure both legible in the same frame; the axis says so.
 */

type ModeKey = "per_capita" | "real" | "nominal";

function money(v: number): string {
  return v >= 1_000_000 ? fmtUsdCompact(v) : fmtUsd(Math.round(v));
}

export default function SfBudgetTimeline({ data }: { data: SfTimeline }) {
  const base = data.base_year;
  const MODES: Record<ModeKey, { short: string; get: (p: SfTimelinePoint) => number; axis: string; blurb: string }> = {
    per_capita: {
      short: "Per resident",
      get: (p) => p.value_real_per_capita,
      axis: `${base} $ per resident`,
      blurb: `Today's dollars (${base}), divided by that year's San Francisco population — the most honest single comparison across 140 years.`,
    },
    real: {
      short: `Total (${base} $)`,
      get: (p) => p.value_real_today,
      axis: `${base} dollars`,
      blurb: `Every year's total converted to ${base} dollars with the CPI-U deflator — a like-for-like size comparison.`,
    },
    nominal: {
      short: "As printed",
      get: (p) => p.value_nominal,
      axis: "dollars of the day",
      blurb: "The figure exactly as printed in the scan or adopted budget — dollars of the day, not adjusted for inflation.",
    },
  };

  const [mode, setMode] = useState<ModeKey>("per_capita");
  const points = [...data.points].sort((a, b) => a.year - b.year);
  const firstArchive = points.find((p) => p.source_type === "archive") ?? points[0];
  const [selectedYear, setSelectedYear] = useState<number>(firstArchive.year);
  const selected = points.find((p) => p.year === selectedYear) ?? firstArchive;

  const getV = MODES[mode].get;

  // ── geometry (viewBox scales to container width) ──
  const W = 780;
  const padL = 58, padR = 16, padT = 22, padB = 30;
  const plotW = W - padL - padR;
  const plotH = 210;
  const H = plotH + padT + padB;

  const X0 = 1880, X1 = 2026;
  const xScale = (yr: number) => padL + (plotW * (yr - X0)) / (X1 - X0);

  const vals = points.map(getV);
  const lmin = Math.floor(Math.log10(Math.min(...vals)));
  const lmax = Math.ceil(Math.log10(Math.max(...vals)));
  const yScale = (v: number) => padT + plotH * (1 - (Math.log10(v) - lmin) / (lmax - lmin));

  const decades: number[] = [];
  for (let k = lmin; k <= lmax; k++) decades.push(k);
  const xTicks = [1880, 1900, 1920, 1940, 1960, 1980, 2000, 2020];

  const archive = points.filter((p) => p.source_type === "archive");
  const live = points.filter((p) => p.source_type === "live");
  const path = (pts: SfTimelinePoint[]) => pts.map((p) => `${xScale(p.year)},${yScale(getV(p))}`).join(" ");

  const modeBtn = (key: ModeKey) => (
    <button
      key={key}
      type="button"
      aria-pressed={mode === key}
      onClick={() => setMode(key)}
      className="tnum"
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 11.5,
        padding: "6px 13px",
        border: "1px solid var(--ink)",
        borderLeft: key === "per_capita" ? "1px solid var(--ink)" : "none",
        background: mode === key ? "var(--ink)" : "transparent",
        color: mode === key ? "var(--bg)" : "var(--ink)",
        cursor: "pointer",
      }}
    >
      {MODES[key].short}
    </button>
  );

  return (
    <div>
      {/* ── mode toggle ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ display: "flex" }} role="group" aria-label="Value mode">
          {(["per_capita", "real", "nominal"] as ModeKey[]).map(modeBtn)}
        </div>
        <div className="fx-doc-source" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span><span style={{ color: "var(--bleu)" }}>●</span> live · adopted budget</span>
          <span><span style={{ color: "var(--muted)" }}>○</span> archive · as reported in the scan</span>
        </div>
      </div>
      <p className="fx-place-sub" style={{ margin: "0 0 8px" }}>{MODES[mode].blurb}</p>

      {/* ── chart ── */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Total San Francisco city finances by year, ${points[0].year} to ${points[points.length - 1].year}, ${MODES[mode].axis}, log scale. Live budget series solid, archival scanned figures dotted.`}
        style={{ display: "block", overflow: "visible", touchAction: "manipulation" }}>
        {/* y gridlines (log decades) */}
        {decades.map((k) => {
          const y = yScale(10 ** k);
          return (
            <g key={k}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--rule)" strokeWidth={1} strokeDasharray="2 3" />
              <text x={padL - 8} y={y + 3} textAnchor="end"
                style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, fill: "var(--muted)" }}>
                {fmtUsdCompact(10 ** k)}
              </text>
            </g>
          );
        })}
        {/* x axis baseline + decade ticks */}
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="var(--rule-hard, var(--ink))" strokeWidth={1} />
        {xTicks.map((yr) => (
          <text key={yr} x={xScale(yr)} y={H - 9} textAnchor="middle"
            style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, fill: "var(--muted)" }}>
            {yr}
          </text>
        ))}
        <text x={padL} y={12} textAnchor="start"
          style={{ fontFamily: "var(--f-mono)", fontSize: 9, fill: "var(--muted)", letterSpacing: ".04em" }}>
          {MODES[mode].axis.toUpperCase()} · LOG SCALE
        </text>

        {/* tier connectors — archive dotted, live solid, NEVER bridged */}
        {archive.length > 1 && (
          <polyline points={path(archive)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" />
        )}
        {live.length > 1 && (
          <polyline points={path(live)} fill="none" stroke="var(--bleu, #1f5fbf)" strokeWidth={2} />
        )}

        {/* markers */}
        {points.map((p) => {
          const x = xScale(p.year), y = yScale(getV(p));
          const isSel = p.year === selectedYear;
          const isArchive = p.source_type === "archive";
          return (
            <g key={p.year} role="button" tabIndex={0}
              aria-label={`${p.label}: ${money(getV(p))} ${MODES[mode].axis}. ${isArchive ? "Archival scan" : "Live budget"}.`}
              onClick={() => setSelectedYear(p.year)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedYear(p.year); } }}
              style={{ cursor: "pointer" }}>
              {/* generous transparent hit target */}
              <circle cx={x} cy={y} r={14} fill="transparent" />
              {isSel && <circle cx={x} cy={y} r={9} fill="none" stroke="var(--bleu, #1f5fbf)" strokeWidth={1.5} />}
              <circle cx={x} cy={y} r={isSel ? 5.5 : 4.5}
                fill={isArchive ? (isSel ? "var(--bleu, #1f5fbf)" : "var(--bg)") : "var(--bleu, #1f5fbf)"}
                stroke={isArchive ? "var(--muted)" : "var(--bleu, #1f5fbf)"} strokeWidth={1.5}>
                <title>{`${p.label} · ${money(getV(p))} (${MODES[mode].axis})`}</title>
              </circle>
            </g>
          );
        })}

        {/* value label on the selected point */}
        {(() => {
          const x = xScale(selected.year), y = yScale(getV(selected));
          const flip = y < padT + 26;
          return (
            <text x={Math.max(padL + 18, Math.min(W - padR - 18, x))} y={flip ? y + 18 : y - 12} textAnchor="middle"
              className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13, fill: "var(--ink)" }}>
              {money(getV(selected))}
            </text>
          );
        })()}
      </svg>

      {/* ── detail panel (persists across mode toggles) ── */}
      <PointPanel point={selected} mode={mode} base={base} modeAxis={MODES[mode].axis} />

      {/* ── one method caveat + sources ── */}
      <p className="fx-fiche-note" style={{ marginTop: 16 }}>{data.notes[0]}</p>
      <p className="fx-fiche-note" style={{ marginTop: 6 }}>
        <b>Inflation:</b> {data.deflator_source.index} ({data.deflator_source.base}) —{" "}
        <a href={data.deflator_source.source_url} target="_blank" rel="noopener noreferrer">BLS</a>
        {" · "}
        <a href={data.deflator_source.pre_1913_source_url} target="_blank" rel="noopener noreferrer">pre-1913 index</a>.
        {" "}<b>Population:</b> {data.population_source.series} —{" "}
        <a href={data.population_source.source_url} target="_blank" rel="noopener noreferrer">U.S. Census</a>.
        {" "}<b>Live budget:</b>{" "}
        <a href={data.live_source.source_url} target="_blank" rel="noopener noreferrer">{data.live_source.name}</a>.
      </p>
    </div>
  );
}

/** The selected point's story. For archive points the verbatim OCR quote, the
 *  scanned page thumbnail and a page-level deep link stay visible here in every
 *  toggle mode; for live points, a link to the budget page. */
function PointPanel({ point: p, mode, base, modeAxis }: { point: SfTimelinePoint; mode: ModeKey; base: number; modeAxis: string }) {
  const isArchive = p.source_type === "archive";
  const primary =
    mode === "per_capita" ? p.value_real_per_capita : mode === "real" ? p.value_real_today : p.value_nominal;

  const others: { label: string; value: number }[] = [
    { label: "as printed", value: p.value_nominal },
    { label: `total, ${base} $`, value: p.value_real_today },
    { label: `per resident, ${base} $`, value: p.value_real_per_capita },
  ];

  return (
    <div className="fx-fiche-section" style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* thumbnail (archive only) */}
        {isArchive && p.thumb && (
          <a href={p.url} target="_blank" rel="noopener noreferrer"
            style={{ flex: "0 0 auto", display: "block", width: 132 }}>
            <img src={p.thumb} alt={`Scanned page — ${p.label}, San Francisco municipal report`} loading="lazy"
              style={{ width: 132, height: "auto", border: "1px solid var(--rule)", display: "block", background: "var(--bg-warm, #f6f4ef)" }} />
            <span className="fx-doc-source" style={{ display: "block", marginTop: 4 }}>view original ↗</span>
          </a>
        )}

        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div className="fx-doc-source" style={{ marginBottom: 2 }}>
            {p.label} · {isArchive ? "archival scan" : "live adopted budget"}
          </div>
          <div className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            {money(primary)}
          </div>
          <div className="fx-place-sub" style={{ marginTop: 2 }}>{modeAxis}</div>

          {/* the other two transforms, always shown so the anchor is never hidden */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
            {others.map((o) => (
              <div key={o.label}>
                <div className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>{money(o.value)}</div>
                <div className="fx-doc-source">{o.label}</div>
              </div>
            ))}
          </div>

          <p className="fx-place-sub" style={{ marginTop: 12 }}>{p.caption}</p>

          {/* archive: verbatim quote + deep link, ALWAYS visible */}
          {isArchive && p.quote && (
            <blockquote style={{
              margin: "10px 0 0", padding: "8px 12px", borderLeft: "2px solid var(--bleu, #1f5fbf)",
              background: "var(--bg-cool, rgba(31,95,191,.05))", fontFamily: "var(--f-mono)", fontSize: 12, lineHeight: 1.5,
            }}>
              &ldquo;{p.quote}&rdquo;
              <span className="fx-doc-source" style={{ display: "block", marginTop: 6 }}>
                verbatim from the scan · {p.page_label} ·{" "}
                <a href={p.url} target="_blank" rel="noopener noreferrer">view original, {p.page_label} ↗</a>
              </span>
            </blockquote>
          )}
          {isArchive && p.ocr_note && (
            <p className="fx-fiche-note" style={{ marginTop: 8 }}>{p.ocr_note}</p>
          )}
          {isArchive && (
            <p className="fx-doc-source" style={{ marginTop: 8 }}>
              Source: San Francisco serial financial report, Internet Archive ({p.identifier}). Population for {p.year}: {p.population.toLocaleString("en-US")} — {p.population_note}.
            </p>
          )}

          {/* live: link to the budget page */}
          {!isArchive && (
            <p style={{ marginTop: 10 }}>
              <a href={p.url} className="fx-doc-title" style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>
                Open the FY {p.year} adopted budget →
              </a>
              <span className="fx-doc-source" style={{ display: "block", marginTop: 6 }}>
                Population for {p.year}: {p.population.toLocaleString("en-US")} — {p.population_note}.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
