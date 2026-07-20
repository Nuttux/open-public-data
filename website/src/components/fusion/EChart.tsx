"use client";

import dynamic from "next/dynamic";

/**
 * Single client-only ECharts entry point. ECharts can't render during SSR,
 * so every chart used to declare its own `dynamic(() => import(...))` —
 * this wrapper centralises that one declaration. Props pass through
 * unchanged to `echarts-for-react`.
 */
const EChart = dynamic(() => import("echarts-for-react"), { ssr: false });

export default EChart;
