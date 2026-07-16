"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { UsDebtAnnualPoint } from "./us-types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Long-arc national-debt chart, 1790 → today.
 *
 * Local to /us/national: the shared `DebtLineChart` primitive hardwires
 * fr-FR formatting ("Mds €") and a linear axis sized for 30 years of
 * quarterly data — it cannot express 9 orders of magnitude of nominal
 * dollars. This variant keeps the same ECharts/ink visual language and
 * adds a log y-axis (each gridline = 10× the one below).
 *
 * Honesty rules encoded here:
 * - values are nominal dollars straight from the export (no inflation math);
 * - the annual series (Historical Debt Outstanding) and the latest daily
 *   observation (Debt to the Penny) are separate series — never spliced
 *   into one line, per the export's own notes.
 */

type Props = {
  annual: UsDebtAnnualPoint[];
  latest: { record_date: string; tot_pub_debt_out_usd: number };
  annualLabel: string;
  latestLabel: string;
  ariaLabel: string;
  height?: number;
};

const nf = (digits: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** $33,733 · $2.8B · $39.42T — tooltip-grade compact dollars. */
function fmtDollarCompact(v: number): string {
  if (v >= 1e12) return `$${nf(2).format(v / 1e12)}T`;
  if (v >= 1e9) return `$${nf(1).format(v / 1e9)}B`;
  if (v >= 1e6) return `$${nf(1).format(v / 1e6)}M`;
  return `$${nf(0).format(v)}`;
}

/** Axis ticks on a log axis land on powers of ten → short labels. */
function fmtAxisTick(v: number): string {
  if (v >= 1e12) return `$${nf(0).format(v / 1e12)}T`;
  if (v >= 1e9) return `$${nf(0).format(v / 1e9)}B`;
  if (v >= 1e6) return `$${nf(0).format(v / 1e6)}M`;
  if (v >= 1e3) return `$${nf(0).format(v / 1e3)}K`;
  return `$${nf(0).format(v)}`;
}

// Neutral era markers — dates only, so the sweep is legible without
// editorializing about the debt itself.
const ERAS: Array<{ from: string; to: string; label: string }> = [
  { from: "1861", to: "1865", label: "Civil War" },
  { from: "1917", to: "1918", label: "WWI" },
  { from: "1941", to: "1945", label: "WWII" },
];

export default function UsDebtChart({
  annual,
  latest,
  annualLabel,
  latestLabel,
  ariaLabel,
  height = 460,
}: Props) {
  const option = useMemo(() => {
    // Categories: one slot per annual observation (fiscal years; 1843 has
    // two published observations — both kept), plus one slot for the
    // latest daily figure so it reads as a distinct observation.
    const latestYear = latest.record_date.slice(0, 4);
    const categories = [
      ...annual.map((p) => String(p.fiscal_year)),
      latestYear,
    ];
    const lineData: Array<number | null> = [
      ...annual.map((p) => p.tot_pub_debt_out_usd),
      null,
    ];
    const scatterData: Array<number | null> = [
      ...annual.map(() => null),
      latest.tot_pub_debt_out_usd,
    ];

    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      animation: false,
      grid: { left: 64, right: 24, top: 40, bottom: 36 },
      aria: { enabled: true, label: { description: ariaLabel } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fff",
        borderColor: "#0a0a0a",
        borderWidth: 1,
        textStyle: { color: "#0a0a0a", fontSize: 12.5 },
        formatter: (params: unknown) => {
          const arr = (params as Array<{
            seriesName: string;
            value: number | null;
            axisValueLabel: string;
            color: string;
          }>).filter((p) => p.value != null);
          if (!arr.length) return "";
          const isLatest = arr[0].seriesName === latestLabel;
          const title = isLatest ? latest.record_date : `FY ${arr[0].axisValueLabel}`;
          const lines = arr.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:1px"></span>` +
              `${p.seriesName} <b>${fmtDollarCompact(p.value as number)}</b>`,
          );
          return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5f6672;margin-bottom:6px">${title}</div>${lines.join("<br/>")}`;
        },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { fontSize: 12, color: "#0a0a0a" },
        itemWidth: 14,
        itemHeight: 8,
      },
      xAxis: {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisLabel: {
          fontSize: 11,
          color: "#5f6672",
          interval: 0,
          formatter: (v: string) => {
            const y = Number(v);
            return Number.isFinite(y) && (y - 1790) % 30 === 0 ? v : "";
          },
        },
        axisLine: { lineStyle: { color: "#0a0a0a" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "log",
        logBase: 10,
        min: 1e4,
        name: "US$ · log scale · nominal",
        nameLocation: "end",
        nameGap: 14,
        nameTextStyle: { fontSize: 11, color: "#5f6672", align: "left" },
        axisLabel: {
          fontSize: 11,
          color: "#5f6672",
          formatter: (v: number) => fmtAxisTick(v),
        },
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series: [
        {
          name: annualLabel,
          type: "line" as const,
          data: lineData,
          smooth: false,
          symbol: "none",
          connectNulls: false,
          lineStyle: { color: "#0a0a0a", width: 2 },
          z: 3,
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(10,10,10,0.05)" },
            label: {
              show: true,
              position: "insideTop",
              fontSize: 10,
              color: "#5f6672",
              fontFamily: "'JetBrains Mono', monospace",
            },
            data: ERAS.map((e) => [
              { name: e.label, xAxis: e.from },
              { xAxis: e.to },
            ]),
          },
        },
        {
          name: latestLabel,
          type: "scatter" as const,
          data: scatterData,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: "#c12323" },
          z: 4,
        },
      ],
    };
  }, [annual, latest, annualLabel, latestLabel, ariaLabel]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      notMerge
      lazyUpdate
    />
  );
}
