"use client";

import { useRef } from "react";
import { useCountUp } from "@/lib/use-count-up";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

type Locale = "fr" | "en";
type Mode = "bnEur" | "rawMd";

type Props = {
  /** Valeur en euros (pas en Md€). Sera divisée par 1e9 pour l'affichage. */
  value: number;
  locale: Locale;
  /**
   * - `bnEur` : formatte "12,3 Md€" / "€12.3 bn" (1 décimale < 100, entier ≥ 100).
   * - `rawMd` : valeur déjà en Md€, formatte le nombre avec séparateurs FR/EN
   *   (sans suffixe — le caller l'ajoute via un span séparé pour styliser).
   */
  mode?: Mode;
  durationMs?: number;
  threshold?: number;
  startValue?: number;
  className?: string;
};

/**
 * Variante server-component friendly de `CountUpOnReveal` pour les chiffres
 * en milliards d'euros : le formatting (séparateurs locale, suffixe Md€/bn)
 * est encapsulé côté client. Le server passe juste `locale` (string) et
 * `value` (number) — pas de fonction → compatible RSC.
 *
 * Pourquoi pas étendre `CountUpOnReveal` ? Sa prop `format: (n) => string`
 * impose au caller de fournir une fonction, ce qui ne traverse pas la
 * frontière server→client. Cette variante est dédiée au cas Md€ (la plus
 * répandue dans Budget Explorer) sans casser les call sites existants.
 *
 * Régression zéro : SSR rend la valeur cible (le hook démarre l'animation
 * uniquement quand `revealed` bascule à `true` côté client, sinon snap).
 */
export default function BnEurCountUp({
  value,
  locale,
  mode = "bnEur",
  durationMs = 900,
  threshold = 0.25,
  startValue = 0,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const revealed = useRevealOnScroll(ref, { threshold });
  const target = revealed ? value : startValue;
  const animated = useCountUp(target, durationMs);

  let display: string;
  if (mode === "bnEur") {
    if (!Number.isFinite(animated) || animated <= 0) {
      display = "—";
    } else {
      const md = animated / 1e9;
      const rounded = md >= 100 ? md.toFixed(0) : md.toFixed(1);
      display = locale === "fr"
        ? `${rounded.replace(".", ",")} Md€`
        : `€${rounded} bn`;
    }
  } else {
    // rawMd
    const md = animated;
    if (!Number.isFinite(md) || md <= 0) {
      display = "—";
    } else if (md >= 100) {
      display = Math.round(md).toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
    } else {
      const rounded = md.toFixed(1);
      display = locale === "fr" ? rounded.replace(".", ",") : rounded;
    }
  }

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
