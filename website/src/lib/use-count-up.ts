"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Material-design standard easing — `cubic-bezier(0.4, 0, 0.2, 1)`.
 * Approximated with a Hermite-like ease-out curve for value interpolation.
 * Not a perfect mathematical match, but visually equivalent.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Detect `prefers-reduced-motion: reduce` once at mount.
 * Returns `false` during SSR (safe default — animation will run client-side).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `useCountUp(target, durationMs)` — animates a numeric value smoothly from
 * its previous value to `target` over `durationMs`, using requestAnimationFrame.
 *
 * Behaviour :
 * - Premier render (mount) → renvoie `target` directement (pas de "0 → target"
 *   au load, et pas de mismatch d'hydration : on lance l'animation seulement
 *   au prochain changement).
 * - Changement de `target` post-mount → interpole depuis la valeur courante.
 * - `Math.abs(diff) < 1` → snap direct (évite les micro-anims pour des deltas
 *   sub-€1).
 * - `prefers-reduced-motion: reduce` → snap direct, pas de rAF.
 * - Cleanup : tout rAF en vol est annulé au démontage ou nouveau target.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState<number>(target);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(false);
  const startValueRef = useRef<number>(target);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Skip the very first effect run (mount) — we already render `target`
    // synchronously, so there's nothing to animate towards on first paint.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    // Edge cases : NaN, Infinity, identical, or sub-1 delta → snap direct.
    if (!Number.isFinite(target) || !Number.isFinite(value)) {
      setValue(target);
      return;
    }
    if (Math.abs(target - value) < 1) {
      setValue(target);
      return;
    }
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    // Cancel any in-flight animation before starting a new one.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    startValueRef.current = value;
    startTimeRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const from = startValueRef.current;
    const to = target;
    const start = startTimeRef.current;
    const duration = Math.max(1, durationMs);

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = from + (to - from) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setValue(to); // snap to exact target on completion
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // We intentionally exclude `value` from deps : we only restart the
    // animation when the *target* changes, otherwise each setValue call
    // would re-trigger this effect and cancel itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
