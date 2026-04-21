import type { ReactNode } from "react";
import Link from "next/link";

export type BarRowItem = {
  label: ReactNode;
  /** Raw numeric value (used for both display and bar width when max is set). */
  value: number;
  unit?: ReactNode;
  /** Optional display override; falls back to a compact French-locale format. */
  display?: ReactNode;
  /** If set, the row becomes a link to this href. */
  href?: string;
};

type Props = {
  items: BarRowItem[];
  /** Reference value for the 100% bar width. Defaults to the max of `items`. */
  max?: number;
  /** If set, a "% of total" column is shown next to each value. */
  shareTotal?: number;
  /** Header line shown above the rows. */
  header?: { left: ReactNode; right: ReactNode };
  className?: string;
};

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/**
 * Horizontal breakdown bars — label | fill | value. Used for the "scale"
 * breakdown on the landing and for per-function breakdowns on budget.
 */
export default function BarRow({ items, max, shareTotal, header, className }: Props) {
  const ref = max ?? (Math.max(...items.map((i) => i.value), 0) || 1);
  const total = shareTotal ?? items.reduce((s, r) => s + r.value, 0);
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
          const shareText = shareTotal && total > 0
            ? `${Math.round((row.value / total) * 100)} %`
            : null;
          const body = (
            <>
              <span className="fx-br-label">{row.label}</span>
              <span className="fx-br-bar">
                <span className="fx-br-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="fx-br-val tnum">
                {row.display ?? fr.format(row.value)}
                {row.unit && <span className="fx-br-unit">{row.unit}</span>}
              </span>
              {shareText && <span className="fx-br-share">{shareText}</span>}
              {row.href && <span className="fx-br-arrow" aria-hidden="true">→</span>}
            </>
          );
          const cls = [
            "fx-br-row",
            shareText ? "fx-br-row-share" : "",
            row.href ? "fx-br-row-link" : "",
          ].filter(Boolean).join(" ");
          return row.href ? (
            <Link key={i} href={row.href} className={cls} scroll={false}>
              {body}
            </Link>
          ) : (
            <div key={i} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
