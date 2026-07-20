"use client";

import { useCallback, useState, type ReactNode, type RefObject } from "react";

/**
 * Shared floating-tooltip plumbing for hand-rolled charts (bump chart,
 * beeswarm…). Extracts ONLY the mechanics — cursor-relative position
 * tracking and the edge-clamped positioned container. Each chart keeps its
 * own hover payload, tooltip content and typography.
 */

/**
 * Tracks the tooltip anchor position relative to `containerRef`, from mouse
 * event clientX/Y. Call `moveTo(e)` from the chart's mousemove handler.
 */
export function useChartTip<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const moveTo = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [containerRef],
  );
  return { pos, moveTo };
}

type ChartTipProps = {
  /** Anchor position (px, relative to the chart's positioned wrapper). */
  x: number;
  y: number;
  /** Current width of the chart wrapper — right-edge clamp bound. */
  containerWidth: number;
  /** Fixed tooltip width (px). */
  width: number;
  /** Width used for the right-edge clamp (historically width + margin). */
  clampWidth: number;
  /** Horizontal offset from the anchor before clamping (usually negative). */
  offsetX: number;
  /** Vertical offset below the cursor. */
  offsetY: number;
  /** Inner padding — kept per-chart to stay pixel-identical. */
  padding: string;
  children: ReactNode;
};

/**
 * The positioned, pointer-transparent tooltip container. Left edge is
 * clamped to [0, containerWidth - clampWidth] exactly like the previous
 * per-chart inline implementations.
 */
export function ChartTip({
  x,
  y,
  containerWidth,
  width,
  clampWidth,
  offsetX,
  offsetY,
  padding,
  children,
}: ChartTipProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: Math.min(Math.max(x + offsetX, 0), Math.max(0, containerWidth - clampWidth)),
        top: y + offsetY,
        width,
        background: "var(--ink)",
        color: "var(--bg)",
        padding,
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      {children}
    </div>
  );
}
