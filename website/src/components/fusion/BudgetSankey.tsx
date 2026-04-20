"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

// ECharts is client-only — defer import so SSR doesn't try to render it.
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Link = { source: string; target: string; value: number };

type Node = { name: string; category?: string };

type Props = {
  nodes: Node[];
  links: Link[];
  /** Central node name (e.g. "Budget Paris"). Used to colour the hub. */
  central: string;
  height?: number;
};

const CATEGORY_COLORS: Record<string, string> = {
  revenue: "#2a3680",
  central: "#0a0a0a",
  expense: "#c12323",
};

/**
 * Sankey 3-tiers : recettes → Budget Paris → fonctions. Rendered with
 * ECharts so interactivity (tooltips, hover) comes for free.
 */
export default function BudgetSankey({ nodes, links, central, height = 520 }: Props) {
  const option = useMemo(() => {
    const nodeSpec = nodes.map((n) => ({
      name: n.name,
      itemStyle: {
        color: n.category ? CATEGORY_COLORS[n.category] ?? "#5f6672" : "#5f6672",
        borderColor: "#0a0a0a",
      },
      label: {
        fontFamily: "Inter Tight, Inter, sans-serif",
        fontSize: n.name === central ? 14 : 12,
        fontWeight: n.name === central ? 700 : 500,
        color: "#0a0a0a",
      },
    }));

    const linkSpec = links.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.value,
      lineStyle: {
        color: "source",
        opacity: 0.35,
        curveness: 0.5,
      },
    }));

    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, sans-serif" },
      tooltip: {
        trigger: "item",
        formatter: (params: { dataType: string; name?: string; data?: { source?: string; target?: string; value?: number } }) => {
          if (params.dataType === "edge" && params.data) {
            const v = params.data.value ?? 0;
            const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v / 1_000_000_000);
            return `${params.data.source} → ${params.data.target}<br/><b>${fmt} Md €</b>`;
          }
          return params.name ?? "";
        },
        backgroundColor: "#0a0a0a",
        borderColor: "#0a0a0a",
        textStyle: { color: "#fafaf7", fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
      },
      series: [
        {
          type: "sankey",
          data: nodeSpec,
          links: linkSpec,
          nodeAlign: "justify",
          nodeGap: 14,
          nodeWidth: 12,
          layoutIterations: 64,
          emphasis: {
            focus: "adjacency",
            lineStyle: { opacity: 0.6 },
          },
          left: 8,
          right: 120,
          top: 16,
          bottom: 16,
          label: {
            position: "right",
          },
        },
      ],
    };
  }, [nodes, links, central]);

  return (
    <div className="fx-sankey">
      <ReactECharts option={option} style={{ height, width: "100%" }} />
    </div>
  );
}
