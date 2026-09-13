"use client";

import { useRef } from "react";
import { useCountUpOnReveal } from "@/lib/use-count-up-on-reveal";

type Props = {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  threshold?: number;
  startValue?: number;
  className?: string;
};

/**
 * One-shot count-up on first scroll-into-view. Use for hero numbers on
 * editorial entry pages (Landing, APU, Dette, Fiscalité) where there's no
 * year picker driving subsequent updates.
 *
 * Sweep is `startValue → value` once the element crosses `threshold`.
 * `prefers-reduced-motion: reduce` → `useCountUp` snaps direct.
 */
export default function CountUpOnReveal({
  value,
  format,
  durationMs = 900,
  threshold = 0.3,
  startValue = 0,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Server HTML carries the real figure (lib/use-count-up-on-reveal.ts).
  const animated = useCountUpOnReveal(ref, value, { threshold, startValue, durationMs });
  return (
    <span ref={ref} className={className}>
      {format(animated)}
    </span>
  );
}
