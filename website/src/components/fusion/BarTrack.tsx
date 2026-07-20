import type { CSSProperties } from "react";

/**
 * The `width: (value / max) * 100%` fill-bar idiom shared by the CSS-bar
 * family (BarRow, DualFlowBars, CofogCompareBars, TensionParArrondissement).
 *
 * Deliberately thin: it renders exactly the two-element track/fill markup
 * the charts already had, with the chart's own class names so all visual
 * styling (height, colors, hover, reveal transitions) keeps living in CSS.
 * `color` / `height` are optional inline overrides for call sites without
 * dedicated classes.
 *
 * The percentage is clamped to [0, 100] — a no-op for every migrated call
 * site (their `max` is computed as the max of the same values) but it
 * mirrors BarRow's historical guard.
 */
type Props = {
  value: number;
  max: number;
  /** Inline fill color override (otherwise the fill class decides). */
  color?: string;
  /** Inline track height override (otherwise the track class decides). */
  height?: number;
  /** Class for the outer track element. */
  trackClassName?: string;
  /** Class for the inner fill element. */
  fillClassName?: string;
  /** Element tag — matches the chart's historical markup (default span). */
  as?: "span" | "div";
};

export default function BarTrack({
  value,
  max,
  color,
  height,
  trackClassName,
  fillClassName,
  as = "span",
}: Props) {
  const Tag = as;
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const trackStyle: CSSProperties | undefined =
    height != null ? { height } : undefined;
  const fillStyle: CSSProperties = { width: `${pct}%` };
  if (color) fillStyle.background = color;
  return (
    <Tag className={trackClassName} style={trackStyle}>
      <Tag className={fillClassName} style={fillStyle} />
    </Tag>
  );
}
