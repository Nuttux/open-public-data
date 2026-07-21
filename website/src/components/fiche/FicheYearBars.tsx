import type { ReactNode } from "react";
import type { FicheYearPoint } from "./types";

/**
 * Per-year bar chart scaled to the series' own peak, with a faint peak gridline
 * + label. `format` renders both the scale label and each bar's hover title.
 */
export default function FicheYearBars({
  points,
  format,
  peakNote,
}: {
  points: FicheYearPoint[];
  format: (n: number) => string;
  peakNote?: (peak: FicheYearPoint) => ReactNode;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const peak = points.reduce<FicheYearPoint | null>(
    (best, p) => (best == null || p.value > best.value ? p : best),
    null,
  );
  return (
    <>
      <div className="fx-fiche-years" style={{ position: "relative" }}>
        <span
          aria-hidden="true"
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "var(--rule)" }}
        />
        <span
          aria-hidden="true"
          style={{ position: "absolute", top: 2, right: 0, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)" }}
        >
          {format(max)}
        </span>
        {points.map((p) => (
          <div key={p.year} className="fx-fiche-year">
            <div className="fx-fiche-year-bar-wrap" title={`${p.year}: ${format(p.value)}`}>
              <div className="fx-fiche-year-bar" style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }} />
            </div>
            <div className="fx-fiche-year-label">{`'${String(p.year).slice(2)}`}</div>
          </div>
        ))}
      </div>
      {peak && peakNote ? (
        <p className="fx-fiche-sub" style={{ marginTop: 8 }}>
          {peakNote(peak)}
        </p>
      ) : null}
    </>
  );
}
