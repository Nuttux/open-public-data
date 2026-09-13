"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Budget-vs-actual over time (all funds). Actual spending reaches back to
 * FY1999; the adopted budget begins FY2010 — both from budget_vs_actual.json,
 * the one file where the two perimeters are constructed to be comparable.
 *
 * Local to the budget page (copy-then-diverge, ADR-0010 D3): same
 * ECharts/ink language as UsOtChart, linear axis, en-US $ everywhere. Values
 * are nominal dollars straight from the export.
 */

export type TrendPoint = {
  fiscal_year: number;
  budget_net_usd: number | null;
  actual_all_usd: number | null;
};

type Props = {
  points: TrendPoint[];
  labels: { actual: string; budget: string };
  ariaLabel: string;
  height?: number;
};

const INK = "#0a0a0a";
const ACTUAL = "#2a3680"; // spending — the long, solid line
const BUDGET = "#8c5e2a"; // adopted budget — the shorter overlay

function fmtB(v: number): string {
  return `$${(v / 1e9).toFixed(1)}B`;
}

export default function UsBudgetTrend({ points, labels, ariaLabel, height = 380 }: Props) {
  const option = useMemo(() => {
    const years = points.map((p) => p.fiscal_year);
    const categories = years.map(String);

    // Future / not-yet-closed fiscal years carry no actual (0 or null) — plot
    // them as gaps, never as a plunge to zero.
    const pos = (v: number | null): number | null => (v != null && v > 0 ? v : null);

    const series = [
      {
        name: labels.actual,
        type: "line" as const,
        data: points.map((p) => pos(p.actual_all_usd)),
        symbol: "circle",
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { color: ACTUAL, width: 2.4 },
        itemStyle: { color: ACTUAL },
        z: 4,
      },
      {
        name: labels.budget,
        type: "line" as const,
        data: points.map((p) => pos(p.budget_net_usd)),
        symbol: "circle",
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { color: BUDGET, width: 1.8, type: "dashed" as const },
        itemStyle: { color: BUDGET },
        z: 3,
      },
    ];

    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      animation: false,
      grid: { left: 52, right: 18, top: 44, bottom: 32 },
      aria: { enabled: true, label: { description: ariaLabel } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fff",
        borderColor: INK,
        borderWidth: 1,
        textStyle: { color: INK, fontSize: 12.5 },
        formatter: (params: unknown) => {
          const arr = (params as Array<{
            seriesName: string;
            value: number | null;
            axisValueLabel: string;
            color: string;
          }>).filter((p) => p.value != null);
          if (!arr.length) return "";
          const fyLabel = arr[0].axisValueLabel;
          const lines = arr.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:1px"></span>` +
              `${p.seriesName} <b>${fmtB(p.value as number)}</b>`,
          );
          // Add the gap when both series are present for this year.
          if (arr.length === 2) {
            const gap = Math.abs((arr[0].value as number) - (arr[1].value as number));
            lines.push(
              `<span style="color:#5f6672">Gap <b>${fmtB(gap)}</b></span>`,
            );
          }
          return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5f6672;margin-bottom:6px">FY ${fyLabel}</div>${lines.join("<br/>")}`;
        },
      },
      legend: {
        top: 0,
        left: 0,
        textStyle: { fontSize: 11.5, color: INK },
        itemWidth: 18,
        itemHeight: 8,
      },
      xAxis: {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisLabel: { fontSize: 11, color: "#5f6672", interval: 1 },
        axisLine: { lineStyle: { color: INK } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 11, color: "#5f6672", formatter: (v: number) => fmtB(v) },
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series,
    };
  }, [points, labels, ariaLabel]);

  return (
    <ReactECharts option={option} style={{ height, width: "100%" }} notMerge lazyUpdate />
  );
}
