"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { useCountUp } from "@/lib/use-count-up";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

/**
 * The number a count-up shows: the real value in the server HTML, an animation
 * only where nobody can see the swap.
 *
 * The count-ups used to render `startValue` until the client revealed them, so
 * the HTML a crawler reads said « — » or « 0 » where the page's headline figure
 * sits (1 808 Md€ on /fr/national/budget). AI crawlers do not run JavaScript:
 * for them the figure did not exist.
 *
 *   - server render and first client render: `value` (no hydration mismatch);
 *   - in view at mount: stays on `value` — rewinding it would flash the number
 *     the reader is already looking at;
 *   - below the fold at mount: rewinds to `startValue` off screen, then counts
 *     up when it scrolls into view, as before.
 */
export function useCountUpOnReveal(
  ref: RefObject<Element | null>,
  value: number,
  { threshold, startValue = 0, durationMs = 900 }: { threshold: number; startValue?: number; durationMs?: number },
): number {
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inView) setArmed(true);
    // Mount only: a later scroll is the reveal hook's business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revealed = useRevealOnScroll(ref, { threshold });
  const target = armed && !revealed ? startValue : value;
  return useCountUp(target, durationMs);
}
