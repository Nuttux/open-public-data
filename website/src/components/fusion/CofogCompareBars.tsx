"use client";

import type { ReactNode } from "react";
import BarTrack from "./BarTrack";

export type CofogCompareRow = {
  code: string;
  label: ReactNode;
  fr: number;
  eu: number;
};

type Props = {
  rows: CofogCompareRow[];
  /** Reference value for the 100% bar width. Defaults to max across all rows. */
  max?: number;
  unit?: ReactNode;
  header?: { left: ReactNode; right: ReactNode };
  /** Translatable short labels for the two series (default: "FR" / "UE27"). */
  frLabel?: string;
  euLabel?: string;
  /** Translatable label for the gap shown on each row (default: "Écart"). */
  gapLabel?: string;
  className?: string;
};

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtSigned = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/**
 * Paired horizontal bars: one row per category, two bars per row (FR vs EU27).
 *
 * Visual hierarchy:
 *   [Label .................]  FR ━━━━━━━━━━━━━━━ 23,7
 *                              UE ━━━━━━━━━━━ 19,6
 *                                              Δ +4,1
 */
export default function CofogCompareBars({
  rows,
  max,
  unit,
  header,
  frLabel = "FR",
  euLabel = "UE27",
  gapLabel = "Écart",
  className,
}: Props) {
  const ref =
    max ??
    (Math.max(...rows.flatMap((r) => [r.fr, r.eu]), 0) || 1);

  return (
    <div className={["fx-cofog-box", className ?? ""].filter(Boolean).join(" ")}>
      {header && (
        <div className="fx-cofog-head">
          <span>{header.left}</span>
          <span>{header.right}</span>
        </div>
      )}
      <div className="fx-cofog-list">
        {rows.map((r) => {
          const gap = r.fr - r.eu;
          return (
            <div key={r.code} className="fx-cofog-row">
              <div className="fx-cofog-label">{r.label}</div>
              <div className="fx-cofog-pair">
                <div className="fx-cofog-line">
                  <span className="fx-cofog-tag">{frLabel}</span>
                  <BarTrack
                    value={r.fr}
                    max={ref}
                    trackClassName="fx-cofog-bar"
                    fillClassName="fx-cofog-fill fx-cofog-fill-fr"
                  />
                  <span className="fx-cofog-val tnum">
                    {fmt.format(r.fr)}
                    {unit && <span className="fx-cofog-unit">{unit}</span>}
                  </span>
                </div>
                <div className="fx-cofog-line">
                  <span className="fx-cofog-tag fx-cofog-tag-eu">{euLabel}</span>
                  <BarTrack
                    value={r.eu}
                    max={ref}
                    trackClassName="fx-cofog-bar"
                    fillClassName="fx-cofog-fill fx-cofog-fill-eu"
                  />
                  <span className="fx-cofog-val tnum">
                    {fmt.format(r.eu)}
                    {unit && <span className="fx-cofog-unit">{unit}</span>}
                  </span>
                </div>
              </div>
              <div
                className={[
                  "fx-cofog-gap tnum",
                  gap > 0 ? "fx-cofog-gap-pos" : gap < 0 ? "fx-cofog-gap-neg" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="fx-cofog-gap-tag">{gapLabel}</span>
                <span>{fmtSigned.format(gap)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
