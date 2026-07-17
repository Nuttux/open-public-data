"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Overtime-by-department line chart, FY2017 → latest (the study's
 * label-clean window; series come pre-filtered from
 * payroll_overtime.json, keyed on stable department codes).
 *
 * Local to the payroll page (copy-then-diverge, ADR-0010 D3): same
 * ECharts/ink visual language as UsDebtChart, linear axis, en-US $
 * everywhere. Values are nominal dollars straight from the export.
 */

export type OtSeries = {
  department_code: string;
  department: string;
  series: Array<{ fiscal_year: number; overtime_usd: number }>;
};

type Props = {
  departments: OtSeries[];
  ariaLabel: string;
  height?: number;
};

// Editorial palette (same hues as the fusion stacked-bar palette) —
// Police carries the accent red: it is the section's story.
const LINE_COLORS: Record<string, string> = { POL: "#c12323" };
const FALLBACK_COLORS = ["#2a3680", "#2c7339", "#8c5e2a", "#546583", "#7b6aa3", "#36657a", "#b8495d"];

const nf = (digits: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function fmtM(v: number): string {
  return `$${nf(v >= 100e6 ? 0 : 1).format(v / 1e6)}M`;
}

export default function UsOtChart({ departments, ariaLabel, height = 380 }: Props) {
  const option = useMemo(() => {
    const years = Array.from(
      new Set(departments.flatMap((d) => d.series.map((s) => s.fiscal_year))),
    ).sort();
    const categories = years.map(String);

    let fallbackIdx = 0;
    const series = departments.map((d) => {
      const byYear = new Map(d.series.map((s) => [s.fiscal_year, s.overtime_usd]));
      const color =
        LINE_COLORS[d.department_code]
        ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
      return {
        name: d.department,
        type: "line" as const,
        data: years.map((y) => byYear.get(y) ?? null),
        symbol: "circle",
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { color, width: d.department_code === "POL" ? 2.5 : 1.6 },
        itemStyle: { color },
        z: d.department_code === "POL" ? 4 : 3,
      };
    });

    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      animation: false,
      grid: { left: 56, right: 18, top: 64, bottom: 32 },
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
          arr.sort((a, b) => (b.value as number) - (a.value as number));
          const lines = arr.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:1px"></span>` +
              `${p.seriesName} <b>${fmtM(p.value as number)}</b>`,
          );
          return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5f6672;margin-bottom:6px">FY ${arr[0].axisValueLabel}</div>${lines.join("<br/>")}`;
        },
      },
      legend: {
        top: 0,
        left: 0,
        textStyle: { fontSize: 11.5, color: "#0a0a0a" },
        itemWidth: 14,
        itemHeight: 8,
      },
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
        axisLabel: {
          fontSize: 11,
          color: "#5f6672",
          formatter: (v: number) => fmtM(v),
        },
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series,
    };
  }, [departments, ariaLabel]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      notMerge
      lazyUpdate
    />
  );
}
