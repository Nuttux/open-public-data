import type { ReactNode } from "react";

export type KPI = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
};

type Props = {
  items: KPI[];
  /** Columns on desktop. Defaults to 2. */
  cols?: 2 | 3 | 4;
  className?: string;
};

/**
 * Grid of compact KPI cells with 1px borders. Used alongside HeroNumber
 * in the "Vue d'ensemble" pattern (big number + supporting KPIs).
 */
export default function KPIGrid({ items, cols = 2, className }: Props) {
  return (
    <div
      className={["fx-kpi-grid", `fx-kpi-cols-${cols}`, className ?? ""].filter(Boolean).join(" ")}
    >
      {items.map((k, i) => (
        <div key={i} className="fx-kpi-cell">
          <div className="fx-kpi-label">{k.label}</div>
          <div className="fx-kpi-value tnum">
            {k.value}
            {k.unit && <span className="fx-kpi-unit">{k.unit}</span>}
          </div>
          {k.delta && <div className="fx-kpi-delta">{k.delta}</div>}
        </div>
      ))}
    </div>
  );
}
