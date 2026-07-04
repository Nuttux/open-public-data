import type { ReactNode } from "react";
import Link from "next/link";

export type FlowRow = {
  label: ReactNode;
  /** Raw numeric value used for both display and bar width scaling. */
  value: number;
  /** Rouge (red) treatment for rows linked to emprunt / investissement / dette. */
  rouge?: boolean;
  /** Optional override for the displayed value. */
  display?: ReactNode;
  /** If set, the row becomes a <Link> (clickable — e.g. to open a drawer). */
  href?: string;
};

type Props = {
  /** Left column (Recettes). */
  left: { title: ReactNode; rows: FlowRow[] };
  /** Right column (Dépenses). */
  right: { title: ReactNode; rows: FlowRow[] };
  /** Center badge below both columns — the "Total équilibré X Md €" accent. */
  center?: { label: ReactNode; value: ReactNode; unit?: ReactNode };
  /** Optional callout paragraph under the box. */
  callout?: ReactNode;
};

const fmtBillions = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1_000_000_000);

/**
 * Dual-bars layout matching the budget mockup : Recettes on the left,
 * Dépenses on the right, sorted by value with a shared %-scale inside
 * each column. The "Total équilibré" badge sits below both columns.
 */
export default function DualFlowBars({ left, right, center, callout }: Props) {
  // Single shared scale across BOTH columns so a 2.5 Md bar can never visually
  // read as long as a 7.3 Md bar — critical once the two columns stack on
  // mobile and sit in one continuous list.
  const globalMax = Math.max(
    ...left.rows.map((r) => r.value),
    ...right.rows.map((r) => r.value),
    1,
  );

  const renderCol = (col: { title: ReactNode; rows: FlowRow[] }) => (
    <div className="fx-dualbars-col">
      <div className="fx-dualbars-col-head">{col.title}</div>
      {col.rows.map((r, i) => {
        const body = (
          <>
            <span className="l">{r.label}</span>
            <span className="track">
              <span className="fill" style={{ width: `${(r.value / globalMax) * 100}%` }} />
            </span>
            <span className="v tnum">{r.display ?? `${fmtBillions(r.value)} Md €`}</span>
          </>
        );
        const cls = [
          "fx-dualbars-row",
          r.rouge ? "fx-dualbars-rouge" : "",
          r.href ? "fx-dualbars-row-link" : "",
        ].filter(Boolean).join(" ");
        return r.href ? (
          <Link key={i} href={r.href} className={cls} scroll={false}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cls}>{body}</div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="fx-dualbars">
        <div className="fx-dualbars-cols">
          {renderCol(left)}
          {renderCol(right)}
        </div>
        {center && (
          <div className="fx-dualbars-center">
            <div className="t">{center.label}</div>
            <div className="v tnum">
              {center.value}
              {center.unit && <span className="u">{center.unit}</span>}
            </div>
          </div>
        )}
      </div>
      {callout && <div className="fx-callout">{callout}</div>}
    </>
  );
}
