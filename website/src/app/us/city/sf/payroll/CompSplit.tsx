"use client";

import type { PayrollYearPoint } from "./payroll-types";

/**
 * Salary / overtime / other pay / benefits — 100% stacked bar per fiscal
 * year. Local fork of the StackedBarTheme visual language (fusion):
 * the shared component hardwires fr-FR € formatting, fx.* locale keys and
 * theme-filter links, none of which survive the EN-only rule — see the
 * LEARNINGS row. Same editorial palette, same flat-bar aesthetic, one
 * slim row per year so the drift of the overtime share (red) reads at a
 * glance. All four components are non-negative at citywide grain every
 * year (verified in the export) — a share bar cannot lie here.
 */

type Props = {
  points: PayrollYearPoint[];
  labels: { salaries: string; overtime: string; other: string; benefits: string };
  fmtUsdCompact: (n: number) => string;
  fmtShare: (n: number) => string;
  ariaLabel: string;
};

const COLORS = {
  salaries: "#2a3680",
  overtime: "#c12323",
  other: "#546583",
  benefits: "#5a5e68",
} as const;

export default function CompSplit({
  points,
  labels,
  fmtUsdCompact,
  fmtShare,
  ariaLabel,
}: Props) {
  const parts = (p: PayrollYearPoint) =>
    [
      { key: "salaries", label: labels.salaries, v: p.salaries_usd },
      { key: "overtime", label: labels.overtime, v: p.overtime_usd },
      { key: "other", label: labels.other, v: p.other_salaries_usd },
      { key: "benefits", label: labels.benefits, v: p.total_benefits_usd },
    ] as const;

  return (
    <div role="img" aria-label={ariaLabel}>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 18px",
          marginBottom: 12,
          fontSize: 12.5,
        }}
      >
        {parts(points[points.length - 1]).map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, background: COLORS[s.key], display: "inline-block" }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        {points.map((p) => {
          const total = p.total_compensation_usd;
          return (
            <div
              key={p.fiscal_year}
              style={{ display: "grid", gridTemplateColumns: "44px 1fr 76px", gap: 10, alignItems: "center" }}
            >
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "#5f6672" }}>
                {p.fiscal_year}
              </span>
              <span style={{ display: "flex", height: 20, overflow: "hidden" }}>
                {parts(p).map((s) => (
                  <span
                    key={s.key}
                    style={{ width: `${(s.v / total) * 100}%`, background: COLORS[s.key] }}
                    title={`FY${p.fiscal_year} · ${s.label}: ${fmtUsdCompact(s.v)} (${fmtShare(s.v / total)})`}
                  />
                ))}
              </span>
              <span
                className="tnum"
                style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "#c12323", textAlign: "right" }}
              >
                {labels.overtime} {fmtShare(p.overtime_usd / p.total_compensation_usd)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
