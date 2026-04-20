import type { ReactNode } from "react";

export type FlowRow = {
  label: ReactNode;
  /** Raw numeric value used for both display and bar width scaling. */
  value: number;
  /** Rouge (red) treatment for rows linked to emprunt / investissement / dette. */
  rouge?: boolean;
  /** Optional override for the displayed value. */
  display?: ReactNode;
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
  const leftMax = Math.max(...left.rows.map((r) => r.value), 1);
  const rightMax = Math.max(...right.rows.map((r) => r.value), 1);

  return (
    <>
      <div className="fx-dualbars">
        <div className="fx-dualbars-heads">
          <span>{left.title}</span>
          <span>{right.title}</span>
        </div>
        <div className="fx-dualbars-cols">
          <div>
            {left.rows.map((r, i) => (
              <div key={i} className={r.rouge ? "fx-dualbars-row fx-dualbars-rouge" : "fx-dualbars-row"}>
                <span className="l">{r.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(r.value / leftMax) * 100}%` }} />
                </span>
                <span className="v tnum">{r.display ?? `${fmtBillions(r.value)} Md`}</span>
              </div>
            ))}
          </div>
          <div>
            {right.rows.map((r, i) => (
              <div key={i} className={r.rouge ? "fx-dualbars-row fx-dualbars-rouge" : "fx-dualbars-row"}>
                <span className="l">{r.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(r.value / rightMax) * 100}%` }} />
                </span>
                <span className="v tnum">{r.display ?? `${fmtBillions(r.value)} Md`}</span>
              </div>
            ))}
          </div>
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
