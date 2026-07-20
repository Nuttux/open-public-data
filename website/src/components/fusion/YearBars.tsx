"use client";

import type { ReactNode } from "react";
import { useFmtEur } from "@/lib/use-fmt";

export type YearBarRow = { year: number; amount: number; count?: number };

/**
 * Year-by-year horizontal money bars: ocre year, ink bar, bold amount,
 * mono count column. Markup extracted verbatim from AssociationFiche's
 * "Historique" block (same copy lived in FournisseurFiche and ThemeFiche,
 * modulo bar color and count label).
 */
export default function YearBars({
  rows,
  max,
  barColor = "var(--ink)",
  countLabel,
}: {
  rows: YearBarRow[];
  /** Bar scale reference; defaults to the max amount of `rows`. */
  max?: number;
  barColor?: string;
  /** Right mono column content per row (e.g. `${count} subv.`). */
  countLabel?: (row: YearBarRow) => ReactNode;
}) {
  const fmtEur = useFmtEur();
  const ref = max ?? Math.max(...rows.map((r) => r.amount), 1);

  return (
    <div>
      {rows.map((y) => {
        const { v, u } = fmtEur(y.amount);
        const pct = (y.amount / ref) * 100;
        return (
          <div
            key={y.year}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr 100px 80px",
              gap: 14,
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid var(--rule)",
              fontFamily: "var(--f-ui)",
              fontSize: 13,
            }}
          >
            <span style={{ fontFamily: "var(--f-mono)", color: "var(--ocre)" }}>{y.year}</span>
            <span style={{ position: "relative", height: 8 }}>
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 1,
                  height: 6,
                  width: `${pct}%`,
                  background: barColor,
                }}
              />
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>
              {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11 }}>
              {countLabel ? countLabel(y) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
