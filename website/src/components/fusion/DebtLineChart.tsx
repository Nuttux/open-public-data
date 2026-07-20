"use client";

import { useMemo } from "react";

import ReactECharts from "./EChart";

export type DebtSeriesProp = {
  code: string;
  label: string;
  /** Time-stamped values in the chart's chosen unit. */
  points: Array<{ t: string; v: number | null }>;
  /** Bold = APU consolidated; the others are thinner sub-sectors. */
  emphasized?: boolean;
};

type Props = {
  series: DebtSeriesProp[];
  /** Y-axis unit suffix, e.g. "% PIB" or "Md €". */
  unitLabel: string;
  /** "pct" rounds to 1 decimal; "billions" formats as Mds €. */
  unitMode: "pct" | "billions";
  height?: number;
};

const COLORS = {
  // Debt by sub-sector
  S13: "#0a0a0a",
  S1311: "#2a3680",
  S1313: "#a67638",
  S1314: "#c12323",
  // Tax revenue top-level (gov_10a_taxag)
  D61: "#0a0a0a",
  D2: "#2a3680",
  D5: "#c12323",
  D91: "#a67638",
} as const;

const formatVal = (v: number | null | undefined, mode: "pct" | "billions") => {
  if (v == null) return "—";
  if (mode === "pct") return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
  return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Mds €`;
};

export default function DebtLineChart({
  series,
  unitLabel,
  unitMode,
  height = 460,
}: Props) {
  const option = useMemo(() => {
    // X axis: union of all timestamps, sorted
    const allTimes = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.t))),
    ).sort();

    const seriesSpec = series.map((s) => {
      const pointMap = new Map(s.points.map((p) => [p.t, p.v]));
      const data = allTimes.map((t) => {
        const v = pointMap.get(t);
        return v == null ? null : v;
      });
      const isEmph = !!s.emphasized;
      const color = (COLORS as Record<string, string>)[s.code] ?? "#5f6672";
      return {
        name: s.label,
        type: "line" as const,
        data,
        smooth: false,
        symbol: "none",
        lineStyle: {
          color,
          width: isEmph ? 2.4 : 1.2,
          opacity: isEmph ? 1 : 0.85,
        },
        emphasis: {
          focus: "series",
          lineStyle: { width: isEmph ? 3 : 2 },
        },
        z: isEmph ? 3 : 2,
      };
    });

    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      animation: false,
      grid: { left: 56, right: 24, top: 32, bottom: 36 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fff",
        borderColor: "#0a0a0a",
        borderWidth: 1,
        textStyle: { color: "#0a0a0a", fontSize: 12.5 },
        formatter: (params: unknown) => {
          const arr = params as Array<{
            seriesName: string;
            value: number | null;
            axisValueLabel: string;
            color: string;
          }>;
          const t = arr[0]?.axisValueLabel ?? "";
          const lines = arr.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:1px"></span>` +
              `${p.seriesName} <b>${formatVal(p.value, unitMode)}</b>`,
          );
          return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5f6672;margin-bottom:6px">${t}</div>${lines.join("<br/>")}`;
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
        data: allTimes,
        boundaryGap: false,
        axisLabel: {
          fontSize: 11,
          color: "#5f6672",
          formatter: (v: string) => (v.endsWith("Q1") ? v.slice(0, 4) : ""),
          interval: 0,
        },
        axisLine: { lineStyle: { color: "#0a0a0a" } },
        axisTick: { lineStyle: { color: "#0a0a0a" } },
      },
      yAxis: {
        type: "value",
        name: unitLabel,
        nameLocation: "end",
        nameGap: 12,
        nameTextStyle: { fontSize: 11, color: "#5f6672", align: "left" },
        axisLabel: {
          fontSize: 11,
          color: "#5f6672",
          formatter: (v: number) =>
            unitMode === "billions"
              ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`
              : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`,
        },
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series: seriesSpec,
    };
  }, [series, unitLabel, unitMode]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      notMerge
      lazyUpdate
    />
  );
}
