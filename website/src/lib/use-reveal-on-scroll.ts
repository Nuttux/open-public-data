"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * `useRevealOnScroll(ref, { threshold })` — renvoie `true` une fois que
 * l'élément référencé est entré dans le viewport.
 *
 * - One-shot : une fois `true`, ne revient jamais à `false` (pas de re-anim
 *   quand on scroll back).
 * - Fallback gracieux : si `IntersectionObserver` n'existe pas (SSR ou
 *   navigateur très ancien), renvoie immédiatement `true` pour que le
 *   contenu reste visible (régression zéro sur le rendu statique).
 * - `prefers-reduced-motion: reduce` → renvoie `true` immédiatement, le
 *   composant sautera l'animation.
 */
export function useRevealOnScroll(
  ref: RefObject<Element | null>,
  { threshold = 0.3 }: { threshold?: number } = {},
): boolean {
  const [revealed, setRevealed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Reduced motion → reveal immediately, skip observer.
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setRevealed(true);
      return;
    }

    // No IntersectionObserver → reveal immediately (graceful fallback).
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    // If the element is already in view at mount (e.g. very tall viewport,
    // or scrolled deep into the page on hard refresh), reveal immediately.
    const rect = node.getBoundingClientRect();
    const inView =
      rect.top < window.innerHeight && rect.bottom > 0 && rect.height > 0;
    if (inView) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [ref, threshold]);

  return revealed;
}
