"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Total compensation by job family over time — the citywide display_family ×
 * year roll-up (payroll_by_family_citywide.json). Local to the payroll page
 * (copy-then-diverge, ADR-0010 D3): same ECharts/ink language as UsOtChart,
 * linear axis, en-US $. Police carries the accent red — it is the section's
 * tie-back to the overtime story.
 */

export type FamilySeries = {
  family: string;
  series: Array<{ fiscal_year: number; value: number }>;
};

type Props = {
  families: FamilySeries[];
  ariaLabel: string;
  height?: number;
};

const LINE_COLORS: Record<string, string> = { Police: "#c12323" };
const FALLBACK_COLORS = ["#2a3680", "#2c7339", "#8c5e2a", "#546583", "#7b6aa3", "#36657a", "#b8495d", "#4a7a4a"];

function fmtM(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${Math.round(v / 1e6)}M`;
}

export default function UsFamilyChart({ families, ariaLabel, height = 400 }: Props) {
  const option = useMemo(() => {
    const years = Array.from(
      new Set(families.flatMap((f) => f.series.map((s) => s.fiscal_year))),
    ).sort();
    const categories = years.map(String);

    let fallbackIdx = 0;
    // Stacked area — the composition of total compensation by kind of work over
    // time. Reads as "the pay stack growing", distinct from the overtime line
    // chart above it (separate lines).
    const series = families.map((f) => {
      const byYear = new Map(f.series.map((s) => [s.fiscal_year, s.value]));
      const color = LINE_COLORS[f.family] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
      return {
        name: f.family,
        type: "line" as const,
        stack: "comp",
        data: years.map((y) => byYear.get(y) ?? 0),
        symbol: "none",
        lineStyle: { color, width: 0.75 },
        areaStyle: { color, opacity: 0.82 },
        itemStyle: { color },
        emphasis: { focus: "series" as const },
      };
    });

    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      animation: false,
      grid: { left: 52, right: 18, top: 78, bottom: 30 },
      aria: { enabled: true, label: { description: ariaLabel } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fff",
        borderColor: "#0a0a0a",
        borderWidth: 1,
        textStyle: { color: "#0a0a0a", fontSize: 12.5 },
        formatter: (params: unknown) => {
          const arr = (params as Array<{ seriesName: string; value: number | null; axisValueLabel: string; color: string }>)
            .filter((p) => p.value != null)
            .sort((a, b) => (b.value as number) - (a.value as number));
          if (!arr.length) return "";
          const lines = arr.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:1px"></span>${p.seriesName} <b>${fmtM(p.value as number)}</b>`,
          );
          return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5f6672;margin-bottom:6px">FY ${arr[0].axisValueLabel}</div>${lines.join("<br/>")}`;
        },
      },
      legend: { top: 0, left: 0, textStyle: { fontSize: 11, color: "#0a0a0a" }, itemWidth: 14, itemHeight: 8, type: "scroll" as const },
      xAxis: {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisLabel: { fontSize: 11, color: "#5f6672" },
        axisLine: { lineStyle: { color: "#0a0a0a" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 11, color: "#5f6672", formatter: (v: number) => fmtM(v) },
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series,
    };
  }, [families, ariaLabel]);

  return <ReactECharts option={option} style={{ height, width: "100%" }} notMerge lazyUpdate />;
}
