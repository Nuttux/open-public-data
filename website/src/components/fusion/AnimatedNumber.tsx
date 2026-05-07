"use client";

import { useCountUp } from "@/lib/use-count-up";

type Props = {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
};

/**
 * Renders a number that smoothly interpolates to its current value when
 * `value` changes (typically driven by a year-picker or other user input).
 *
 * Mount renders the target directly — no 0→target sweep at page load.
 * Respects `prefers-reduced-motion`. See `useCountUp` for the underlying rAF.
 */
export default function AnimatedNumber({ value, format, durationMs = 600 }: Props) {
  const animated = useCountUp(value, durationMs);
  return <>{format(animated)}</>;
}
