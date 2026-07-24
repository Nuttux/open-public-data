import type { ReactNode } from "react";
import type { FicheYearPoint } from "./types";

/**
 * Per-year bar chart scaled to the series' own peak, with a faint peak gridline
 * + label. `format` renders both the scale label and each bar's hover title.
 *
 * A point flagged `provisional` (an incomplete current year) renders with a
 * hatched fill + a "'YY" label suffixed with a dot, and — when `provisionalNote`
 * is passed — a caption below, so a partial year never reads as a real drop.
 */
export default function FicheYearBars({
  points,
  format,
  peakNote,
  provisionalNote,
}: {
  points: FicheYearPoint[];
  format: (n: number) => string;
  peakNote?: (peak: FicheYearPoint) => ReactNode;
  /** Caption shown when any point is provisional (e.g. "2026 · parcial …"). */
  provisionalNote?: ReactNode;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  // Peak note should describe a COMPLETE year, never the partial one.
  const peak = points.reduce<FicheYearPoint | null>(
    (best, p) => (p.provisional ? best : best == null || p.value > best.value ? p : best),
    null,
  );
  const hasProvisional = points.some((p) => p.provisional);
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
              <div
                className={`fx-fiche-year-bar${p.provisional ? " fx-fiche-year-bar--partial" : ""}`}
                style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
              />
            </div>
            <div className="fx-fiche-year-label">{`'${String(p.year).slice(2)}`}{p.provisional ? "·" : ""}</div>
          </div>
        ))}
      </div>
      {hasProvisional && provisionalNote ? (
        <p className="fx-fiche-sub" style={{ marginTop: 8, fontStyle: "italic" }}>
          {provisionalNote}
        </p>
      ) : null}
      {peak && peakNote ? (
        <p className="fx-fiche-sub" style={{ marginTop: 8 }}>
          {peakNote(peak)}
        </p>
      ) : null}
    </>
  );
}
