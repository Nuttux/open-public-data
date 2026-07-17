"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * DistributionStrip — histogram + percentile band for a money
 * distribution, scrubbed across years. New shared US primitive
 * (components/us/): nothing in fusion renders a per-bucket histogram or
 * a p25–p99 band evolving over years (Paris pages never had person-grain
 * distribution data).
 *
 * Locale-agnostic by construction: every string and number format comes
 * in through props (the fr-FR-welded internals of the fusion primitives
 * are exactly what this component exists to avoid — see LEARNINGS.md).
 *
 * Data-honesty rules encoded here:
 * - the y-scale is the SHARE of that year's employees (not counts), and
 *   is fixed across years so scrubbing compares like with like;
 * - the top bucket is open-ended (ceiling null) and rendered as a
 *   distinct hatched span up to the axis end — never as a fake $25k bin;
 * - buckets are drawn at their true dollar positions on a linear axis;
 * - the percentile band (p25→p99) and the median line are drawn from the
 *   export's exact percentiles, no interpolation of the histogram.
 */

export type DistributionStripBucket = {
  floor_usd: number;
  ceiling_usd: number | null; // null = open top bucket
  n_employees: number;
};

export type DistributionStripPoint = {
  /** Category label for the scrubber (e.g. fiscal year). */
  year: number;
  n_employees: number;
  p25_usd: number;
  p50_usd: number;
  p75_usd: number;
  p90_usd: number;
  p99_usd: number;
  histogram: DistributionStripBucket[];
};

type Labels = {
  /** aria-label builder for the chart of a given year. */
  chartAria: (year: number, nEmployees: string) => string;
  /** Group label for the year buttons. */
  scrubAria: string;
  /** "median" marker word. */
  median: string;
  /** Band edge labels. */
  p25: string;
  p99: string;
  /** Word appended to counts in tooltips (e.g. "employees"). */
  employees: string;
  /** Open-bucket tooltip prefix builder (e.g. (floor) => "$500k and above"). */
  openBucket: (floor: string) => string;
};

type Props = {
  points: DistributionStripPoint[];
  fmtUsd: (n: number) => string;
  /** Compact axis-grade dollars (e.g. $250k). */
  fmtUsdTick: (n: number) => string;
  fmtCount: (n: number) => string;
  labels: Labels;
  /** Initially selected year — defaults to the last point. */
  initialYear?: number;
  /** Annotation slot rendered under the chart (e.g. part-time bump note). */
  annotation?: ReactNode;
  height?: number;
};

const W = 760;
const PLOT_H = 172;
const AXIS_H = 46;
const BAND_H = 30;

export default function DistributionStrip({
  points,
  fmtUsd,
  fmtUsdTick,
  fmtCount,
  labels,
  initialYear,
  annotation,
  height = 300,
}: Props) {
  const [year, setYear] = useState(
    initialYear ?? points[points.length - 1]?.year,
  );
  const point = points.find((p) => p.year === year) ?? points[points.length - 1];

  // Fixed geometry across years: axis ends one bucket-width past the
  // highest closed-bucket ceiling anywhere in the data (the open bucket's
  // drawing span), so the layout never jumps while scrubbing.
  const { axisMax, bucketWidth, maxShare } = useMemo(() => {
    let maxCeiling = 0;
    let bw = 25000;
    let ms = 0;
    for (const p of points) {
      for (const b of p.histogram) {
        if (b.ceiling_usd != null) {
          maxCeiling = Math.max(maxCeiling, b.ceiling_usd);
          bw = b.ceiling_usd - b.floor_usd;
        }
        ms = Math.max(ms, b.n_employees / p.n_employees);
      }
    }
    return { axisMax: maxCeiling + bw, bucketWidth: bw, maxShare: ms };
  }, [points]);

  const x = (usd: number) => (Math.min(usd, axisMax) / axisMax) * W;
  const yTop = (share: number) => PLOT_H - (share / maxShare) * (PLOT_H - 10);

  const totalH = PLOT_H + BAND_H + AXIS_H;
  const nStr = fmtCount(point.n_employees);

  // Regular ticks stop short of the open-bucket end label ("$500k+",
  // anchored at the right edge) so the two never collide.
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let v = 0; v < axisMax - bucketWidth; v += bucketWidth * 4) out.push(v);
    return out;
  }, [axisMax, bucketWidth]);

  return (
    <div>
      {/* Year scrubber */}
      <div
        role="group"
        aria-label={labels.scrubAria}
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}
      >
        {points.map((p) => {
          const on = p.year === year;
          return (
            <button
              key={p.year}
              type="button"
              aria-pressed={on}
              onClick={() => setYear(p.year)}
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                padding: "4px 8px",
                border: "1px solid #0a0a0a",
                background: on ? "#0a0a0a" : "transparent",
                color: on ? "#fff" : "#0a0a0a",
                cursor: "pointer",
              }}
            >
              {p.year}
            </button>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        style={{ width: "100%", height: "auto", maxHeight: height }}
        role="img"
        aria-label={labels.chartAria(point.year, nStr)}
      >
        {/* Bars */}
        {point.histogram.map((b, i) => {
          const share = b.n_employees / point.n_employees;
          const x0 = x(b.floor_usd);
          const x1 = b.ceiling_usd == null ? W : x(b.ceiling_usd);
          const top = yTop(share);
          const open = b.ceiling_usd == null;
          const rangeLabel = open
            ? labels.openBucket(fmtUsdTick(b.floor_usd))
            : `${fmtUsdTick(b.floor_usd)}–${fmtUsdTick(b.ceiling_usd as number)}`;
          return (
            <g key={`${point.year}-${i}`}>
              <rect
                x={x0 + 1}
                y={top}
                width={Math.max(x1 - x0 - 2, 1)}
                height={PLOT_H - top}
                fill={open ? "#9aa1ab" : "#0a0a0a"}
                opacity={open ? 0.55 : 0.85}
                style={{ transition: "y .25s ease, height .25s ease" }}
              >
                <title>
                  {`${rangeLabel} · ${fmtCount(b.n_employees)} ${labels.employees} (${(share * 100).toFixed(1)}%)`}
                </title>
              </rect>
            </g>
          );
        })}

        {/* Median line */}
        <line
          x1={x(point.p50_usd)}
          x2={x(point.p50_usd)}
          y1={6}
          y2={PLOT_H}
          stroke="#c12323"
          strokeWidth={2}
          style={{ transition: "x1 .25s ease, x2 .25s ease" }}
        />
        <text
          x={Math.min(x(point.p50_usd) + 6, W - 150)}
          y={16}
          fontSize={13.5}
          fontFamily="var(--f-mono)"
          fill="#c12323"
        >
          {labels.median} {fmtUsd(point.p50_usd)}
        </text>

        {/* Percentile band p25 → p99, with p75/p90 ticks */}
        <g transform={`translate(0 ${PLOT_H + 8})`}>
          <line x1={0} x2={W} y1={0} y2={0} stroke="#e4e6ea" />
          <rect
            x={x(point.p25_usd)}
            y={4}
            width={x(point.p99_usd) - x(point.p25_usd)}
            height={7}
            fill="#0a0a0a"
            opacity={0.18}
            style={{ transition: "x .25s ease, width .25s ease" }}
          />
          {[point.p25_usd, point.p75_usd, point.p90_usd, point.p99_usd].map(
            (v, i) => (
              <line
                key={i}
                x1={x(v)}
                x2={x(v)}
                y1={2}
                y2={13}
                stroke="#0a0a0a"
                strokeWidth={i === 0 || i === 3 ? 1.6 : 1}
                opacity={i === 0 || i === 3 ? 0.9 : 0.45}
              />
            ),
          )}
          <text
            x={x(point.p25_usd)}
            y={26}
            fontSize={12.5}
            fontFamily="var(--f-mono)"
            fill="#5f6672"
            textAnchor="middle"
          >
            {labels.p25} {fmtUsdTick(point.p25_usd)}
          </text>
          <text
            x={Math.min(x(point.p99_usd), W - 60)}
            y={26}
            fontSize={12.5}
            fontFamily="var(--f-mono)"
            fill="#5f6672"
            textAnchor="middle"
          >
            {labels.p99} {fmtUsdTick(point.p99_usd)}
          </text>
        </g>

        {/* $ axis ticks */}
        <g transform={`translate(0 ${PLOT_H + BAND_H + 18})`}>
          {ticks.map((v) => (
            <text
              key={v}
              x={x(v)}
              y={0}
              fontSize={12.5}
              fontFamily="var(--f-mono)"
              fill="#5f6672"
              textAnchor={v === 0 ? "start" : "middle"}
            >
              {fmtUsdTick(v)}
            </text>
          ))}
          <text
            x={W}
            y={0}
            fontSize={12.5}
            fontFamily="var(--f-mono)"
            fill="#5f6672"
            textAnchor="end"
          >
            {fmtUsdTick(axisMax - bucketWidth)}+
          </text>
        </g>
      </svg>

      {annotation}
    </div>
  );
}
