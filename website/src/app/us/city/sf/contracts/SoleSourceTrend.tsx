"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Sole-source share of contract starts over time — the honest reading of
 * sole_source.by_start_year. Only the stability window (start years with at
 * least the recorded-starts floor) is charted; older years survive as a thin,
 * biased residue and are omitted upstream by the caller.
 *
 * Local to the contracts page (copy-then-diverge, ADR-0010 D3): same
 * ECharts/ink language as UsOtChart. Values are shares straight from the
 * export, rendered as percentages.
 */

export type SoleYearPoint = {
  year: number;
  n_contracts: number;
  n_sole: number;
  share_sole: number;
};

type Props = {
  points: SoleYearPoint[];
  legend: string;
  ariaLabel: string;
  height?: number;
};

const INK = "#0a0a0a";
const OCRE = "#8c5e2a";

export default function SoleSourceTrend({ points, legend, ariaLabel, height = 300 }: Props) {
  const option = useMemo(() => {
    const categories = points.map((p) => String(p.year));
    const byYear = new Map(points.map((p) => [String(p.year), p]));
    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      animation: false,
      grid: { left: 44, right: 18, top: 34, bottom: 30 },
      aria: { enabled: true, label: { description: ariaLabel } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fff",
        borderColor: INK,
        borderWidth: 1,
        textStyle: { color: INK, fontSize: 12.5 },
        formatter: (params: unknown) => {
          const p = (params as Array<{ axisValueLabel: string; value: number | null }>)[0];
          if (p?.value == null) return "";
          const row = byYear.get(p.axisValueLabel);
          const detail = row ? `${row.n_sole} of ${row.n_contracts} starts` : "";
          return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5f6672;margin-bottom:4px">FY ${p.axisValueLabel}</div><b>${(p.value as number).toFixed(1)}%</b> sole-source<br/><span style="color:#5f6672;font-size:11px">${detail}</span>`;
        },
      },
      legend: { top: 0, left: 0, textStyle: { fontSize: 11.5, color: INK }, itemWidth: 18, itemHeight: 8 },
      xAxis: {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisLabel: { fontSize: 11, color: "#5f6672" },
        axisLine: { lineStyle: { color: INK } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { fontSize: 11, color: "#5f6672", formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series: [
        {
          name: legend,
          type: "line" as const,
          data: points.map((p) => Number((p.share_sole * 100).toFixed(2))),
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: OCRE, width: 2.2 },
          itemStyle: { color: OCRE },
          areaStyle: { color: "rgba(140, 94, 42, 0.08)" },
        },
      ],
    };
  }, [points, legend, ariaLabel]);

  return <ReactECharts option={option} style={{ height, width: "100%" }} notMerge lazyUpdate />;
}
