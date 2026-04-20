import type { ReactNode } from "react";

export type BarRowItem = {
  label: ReactNode;
  /** Raw numeric value (used for both display and bar width when max is set). */
  value: number;
  unit?: ReactNode;
  /** Optional display override; falls back to a compact French-locale format. */
  display?: ReactNode;
};

type Props = {
  items: BarRowItem[];
  /** Reference value for the 100% bar width. Defaults to the max of `items`. */
  max?: number;
  /** Header line shown above the rows. */
  header?: { left: ReactNode; right: ReactNode };
  className?: string;
};

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/**
 * Horizontal breakdown bars — label | fill | value. Used for the "scale"
 * breakdown on the landing and for per-function breakdowns on budget.
 */
export default function BarRow({ items, max, header, className }: Props) {
  const ref = max ?? (Math.max(...items.map((i) => i.value), 0) || 1);
  return (
    <div className={["fx-barbox", className ?? ""].filter(Boolean).join(" ")}>
      {header && (
        <div className="fx-barhead">
          <span>{header.left}</span>
          <span>{header.right}</span>
        </div>
      )}
      <div className="fx-breakdown">
        {items.map((row, i) => {
          const pct = Math.max(0, Math.min(100, (row.value / ref) * 100));
          return (
            <div key={i} className="fx-br-row">
              <span className="fx-br-label">{row.label}</span>
              <span className="fx-br-bar">
                <span className="fx-br-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="fx-br-val tnum">
                {row.display ?? fr.format(row.value)}
                {row.unit && <span className="fx-br-unit">{row.unit}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
