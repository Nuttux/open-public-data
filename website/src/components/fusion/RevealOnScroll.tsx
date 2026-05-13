"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

type Props = {
  children: ReactNode;
  /** IntersectionObserver threshold (0..1). Default 0.15 — déclenche dès
   *  qu'un sixième de la section est visible. */
  threshold?: number;
  as?: "div" | "section";
  className?: string;
  /** Optional DOM id forwarded onto the wrapper — utile pour les anchor
   *  scrolls (`<a href="#bucket-secu">`) qui visent les sections. */
  id?: string;
};

/**
 * Wrapper qui pose `.fx-reveal is-revealed` quand l'élément entre dans le
 * viewport (one-shot). Mirroir de `db-panel-fade is-revealed` côté Daily
 * Bread, version `theme-fusion`. Utilisé pour faire entrer les sections du
 * Budget Explorer en cinétique douce (opacity + translateY).
 *
 * Régression zéro stricte (alignée sur Daily Bread `theme-db-scrolly.is-armed`) :
 *  - SSR / JS désactivé → la classe `.fx-reveal` n'est PAS posée du tout
 *    (rendu côté serveur sans `armed`). Contenu visible nativement
 *    (opacity 1, pas de transform). Pas de flash, pas de masquage si JS off.
 *  - Après mount client, on bascule armed=true → la classe `.fx-reveal`
 *    apparaît, et si l'élément est déjà in-view (cas hero ou refresh
 *    deep-scroll), `useRevealOnScroll` détecte ça via getBoundingClientRect
 *    et pose `revealed=true` immédiatement → on enchaîne directement avec
 *    `.is-revealed` (pas de flash hidden).
 *  - Sinon (élément sous la fold) → `.fx-reveal` posée → opacity 0 +
 *    translateY 30px. L'utilisateur ne voit rien car hors viewport. Quand
 *    il scroll vers le bas, l'observer pose `.is-revealed` → transition
 *    opacity + transform sur 500ms.
 *  - `prefers-reduced-motion: reduce` → hook retourne `true` immédiatement +
 *    media query CSS aplatit la transition à 0ms (snap direct).
 */
export default function RevealOnScroll({
  children,
  threshold = 0.15,
  as = "section",
  className,
  id,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const revealed = useRevealOnScroll(ref, { threshold });

  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(true);
  }, []);

  const cls = [
    armed ? "fx-reveal" : "",
    armed && revealed ? "is-revealed" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  if (as === "div") {
    return (
      <div ref={ref as React.RefObject<HTMLDivElement>} className={cls} id={id}>
        {children}
      </div>
    );
  }
  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className={cls}
      id={id}
    >
      {children}
    </section>
  );
}
