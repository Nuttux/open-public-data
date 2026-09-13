"use client";

import Link from "@/components/LocalizedLink";

/**
 * The pay ladder — one range row per kind of work: the p25–p75 band where the
 * middle half of that family sits, a whisker out to p90, and the median marked.
 *
 * This is the answer to "the spread is a nice picture, but WHAT WORK is paid at
 * what level?". The citywide histogram shows the shape of city pay and names
 * nobody; this names the work at every rung and opens the family's fiche.
 *
 * Form: a range plot, not a bar chart — the quantity being read is an interval,
 * and a bar from zero would imply the low edge is a magnitude. One measure, one
 * hue (ink) with the median in the same red the distribution chart already uses
 * for its median line, so the two graphics read as one system. No categorical
 * palette is introduced: identity comes from the row label, never from colour.
 *
 * Every number comes from exact per-person percentiles computed in the mart;
 * nothing here is interpolated from the histogram.
 */

export type PayLadderRow = {
  family: string;
  n_people: number;
  p25_usd: number;
  p50_usd: number;
  p75_usd: number;
  p90_usd: number;
  href?: string;
};

type Props = {
  rows: PayLadderRow[];
  /** Citywide median, drawn as a reference line across every row. */
  cityMedianUsd?: number | null;
  fmtUsd: (n: number) => string;
  fmtUsdTick: (n: number) => string;
  fmtCount: (n: number) => string;
  labels: {
    /** e.g. (fy) => "Job family, FY2025" */
    head: string;
    /** Right-hand column header, e.g. "Median total compensation". */
    headRight: string;
    median: string;
    cityMedian: string;
    /** (n) => "3,574 people" */
    people: (n: string) => string;
    /** aria description of one row. */
    rowAria: (r: PayLadderRow, p25: string, p50: string, p75: string) => string;
  };
};

export default function SfPayLadder({
  rows,
  cityMedianUsd,
  fmtUsd,
  fmtUsdTick,
  fmtCount,
  labels,
}: Props) {
  if (rows.length === 0) return null;

  // Shared scale across every row — the whole point is that rungs are
  // comparable. The axis ends on a round tick past the highest whisker.
  const maxVal = Math.max(...rows.map((r) => r.p90_usd), cityMedianUsd ?? 0);
  const step = 50000;
  const axisMax = Math.ceil(maxVal / step) * step;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / axisMax) * 100));
  const ticks: number[] = [];
  for (let v = 0; v <= axisMax; v += step * 2) ticks.push(v);

  const cityPct = cityMedianUsd != null ? pct(cityMedianUsd) : null;

  return (
    <div className="fx-ladder">
      <div className="fx-ladder-head">
        <span>{labels.head}</span>
        <span>{labels.headRight}</span>
      </div>

      <div className="fx-ladder-rows">
        {rows.map((r) => {
          const body = (
            <>
              <span className="fx-ladder-label">
                {r.family}
                <span className="fx-ladder-meta">{labels.people(fmtCount(r.n_people))}</span>
              </span>
              <span
                className="fx-ladder-track"
                role="img"
                aria-label={labels.rowAria(
                  r,
                  fmtUsd(r.p25_usd),
                  fmtUsd(r.p50_usd),
                  fmtUsd(r.p75_usd),
                )}
              >
                {cityPct != null && (
                  <span
                    className="fx-ladder-cityline"
                    style={{ left: `${cityPct}%` }}
                    aria-hidden="true"
                  />
                )}
                {/* whisker p25 → p90 */}
                <span
                  className="fx-ladder-whisker"
                  style={{
                    left: `${pct(r.p25_usd)}%`,
                    width: `${Math.max(0.4, pct(r.p90_usd) - pct(r.p25_usd))}%`,
                  }}
                  aria-hidden="true"
                />
                {/* interquartile band p25 → p75 */}
                <span
                  className="fx-ladder-band"
                  style={{
                    left: `${pct(r.p25_usd)}%`,
                    width: `${Math.max(0.8, pct(r.p75_usd) - pct(r.p25_usd))}%`,
                  }}
                  aria-hidden="true"
                />
                <span
                  className="fx-ladder-median"
                  style={{ left: `${pct(r.p50_usd)}%` }}
                  aria-hidden="true"
                />
              </span>
              <span className="fx-ladder-value tnum">{fmtUsd(r.p50_usd)}</span>
            </>
          );
          return r.href ? (
            <Link key={r.family} href={r.href} scroll={false} className="fx-ladder-row fx-ladder-row--link">
              {body}
            </Link>
          ) : (
            <div key={r.family} className="fx-ladder-row">
              {body}
            </div>
          );
        })}
      </div>

      <div className="fx-ladder-axis" aria-hidden="true">
        <span className="fx-ladder-label" />
        <span className="fx-ladder-track fx-ladder-track--axis">
          {ticks.map((v) => (
            <span key={v} className="fx-ladder-tick" style={{ left: `${pct(v)}%` }}>
              {fmtUsdTick(v)}
            </span>
          ))}
        </span>
        <span />
      </div>

      <p className="fx-ladder-legend">
        <span className="fx-ladder-key">
          <span className="fx-ladder-key-band" aria-hidden="true" />
          the middle half (p25–p75)
        </span>
        <span className="fx-ladder-key">
          <span className="fx-ladder-key-whisker" aria-hidden="true" />
          out to p90
        </span>
        <span className="fx-ladder-key">
          <span className="fx-ladder-key-median" aria-hidden="true" />
          {labels.median}
        </span>
        {cityMedianUsd != null && (
          <span className="fx-ladder-key">
            <span className="fx-ladder-key-city" aria-hidden="true" />
            {labels.cityMedian} {fmtUsd(cityMedianUsd)}
          </span>
        )}
      </p>
    </div>
  );
}
