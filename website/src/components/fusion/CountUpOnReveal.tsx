"use client";

import { useRef } from "react";
import { useCountUp } from "@/lib/use-count-up";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

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
  const revealed = useRevealOnScroll(ref, { threshold });
  const target = revealed ? value : startValue;
  const animated = useCountUp(target, durationMs);
  return (
    <span ref={ref} className={className}>
      {format(animated)}
    </span>
  );
}
