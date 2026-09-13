"use client";

import Link from "@/components/LocalizedLink";
import type { ReactNode } from "react";

/**
 * "Who is paid here" — the composition of one $25k band of the pay histogram,
 * by kind of work.
 *
 * The histogram alone shows the SHAPE of city pay and names nobody, which is
 * exactly the complaint it drew: a nice curve you cannot interpret. Clicking a
 * band answers it — these are the job families in that band, ranked, each
 * opening its fiche.
 *
 * Counts only: no dollar aggregate is attached to any row here. The pooled row
 * names no family (it is the bucket's cells that were too small to publish) and
 * is never clickable.
 */

export type BucketCompositionRow = {
  family: string;
  n_employees: number;
  is_pooled: boolean;
  href?: string;
};

export default function SfBucketComposition({
  kicker,
  title,
  rows,
  total,
  fmtCount,
  shareLabel,
  hint,
  cap = 7,
  moreLabel,
}: {
  kicker: ReactNode;
  title: ReactNode;
  rows: BucketCompositionRow[];
  /** Everyone in the band, for the share column and the honest remainder. */
  total: number;
  fmtCount: (n: number) => string;
  /** (share) => "12.4% of the band" */
  shareLabel: (share: string) => string;
  hint?: ReactNode;
  cap?: number;
  /** (n, people) => "+3 smaller groups · 41 people" */
  moreLabel?: (n: number, people: string) => string;
}) {
  const ranked = [...rows].sort((a, b) => {
    if (a.is_pooled !== b.is_pooled) return a.is_pooled ? 1 : -1;
    return b.n_employees - a.n_employees;
  });
  const shown = ranked.slice(0, cap);
  const tail = ranked.slice(cap);
  const tailN = tail.reduce((s, r) => s + r.n_employees, 0);
  const max = Math.max(...shown.map((r) => r.n_employees), 1);

  return (
    <div className="fx-bucketwho">
      <div className="fx-bucketwho-kicker">{kicker}</div>
      <p className="fx-bucketwho-title">
        {title}
        <span className="u">{fmtCount(total)}</span>
      </p>
      <div>
        {shown.map((r) => {
          const share = total > 0 ? r.n_employees / total : 0;
          const body = (
            <>
              <span>{r.family}</span>
              <span className="fx-bucketwho-track" aria-hidden="true">
                <span
                  className={`fx-bucketwho-fill${r.is_pooled ? " fx-bucketwho-fill--pooled" : ""}`}
                  style={{ width: `${Math.max(1.5, (r.n_employees / max) * 100)}%` }}
                />
              </span>
              <span className="fx-bucketwho-val tnum">
                {fmtCount(r.n_employees)}
                <span>{shareLabel(`${(share * 100).toFixed(1)}%`)}</span>
              </span>
            </>
          );
          return r.href && !r.is_pooled ? (
            <Link key={r.family} href={r.href} scroll={false} className="fx-bucketwho-row">
              {body}
            </Link>
          ) : (
            <div key={r.family} className="fx-bucketwho-row">
              {body}
            </div>
          );
        })}
      </div>
      {(tail.length > 0 || hint) && (
        <p className="fx-bucketwho-hint" style={{ marginTop: 10 }}>
          {tail.length > 0 && moreLabel ? moreLabel(tail.length, fmtCount(tailN)) : null}
          {tail.length > 0 && hint ? " · " : null}
          {hint}
        </p>
      )}
    </div>
  );
}
