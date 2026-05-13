"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

export type BarRowItem = {
  label: ReactNode;
  /** Raw numeric value (used for both display and bar width when max is set). */
  value: number;
  unit?: ReactNode;
  /** Optional display override; falls back to a compact French-locale format. */
  display?: ReactNode;
  /** If set, the row becomes a silent <Link> (no visible arrow; just hover styling). */
  href?: string;
};

/**
 * Couleur institutionnelle du remplissage de barre. Permet de garder la
 * cohérence visuelle « Sécu = bleu / État = charbon / Local = rouge » entre
 * Daily Bread et Budget Explorer. Sans cette prop, la barre reste neutre
 * (`var(--ink)`) — comportement par défaut conservé pour les autres pages.
 */
export type BarRowColor = "secu" | "etat" | "local";

type Props = {
  items: BarRowItem[];
  /** Reference value for the 100% bar width. Defaults to the max of `items`. */
  max?: number;
  /** Header line shown above the rows. */
  header?: { left: ReactNode; right: ReactNode };
  /** Institutional color (secu/etat/local) — colorizes the fill + hover state. */
  color?: BarRowColor;
  /**
   * Si `true`, anime l'apparition des barres en cascade (chaque row entre
   * 80→100% width avec stagger ~80ms) quand le composant entre dans le
   * viewport. Sans JS / `prefers-reduced-motion: reduce` → snap direct.
   * Reproduit la cinétique des BarList Daily Bread §03/§04/§05.
   */
  reveal?: boolean;
  className?: string;
};

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/**
 * Horizontal breakdown bars — label | fill | value. Used for the "scale"
 * breakdown on the landing and for per-function breakdowns on budget.
 *
 * When an item has an `href`, the row becomes a `<Link>` with a subtle
 * hover state (same 3-col layout — no visible arrow, no extra column).
 *
 * Optional `color` and `reveal` props mirror the polished Daily Bread
 * BarList visuals (institutional fill + cascade reveal-on-scroll). They
 * are no-ops by default to preserve existing call sites.
 */
export default function BarRow({
  items,
  max,
  header,
  color,
  reveal = false,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // `useRevealOnScroll` no-ops gracefully when reveal=false : we still call
  // the hook (rules of hooks) but ignore its result. Cheap : observer is only
  // installed if the ref attaches.
  const revealed = useRevealOnScroll(ref, { threshold: 0.18 });
  const refValue = max ?? (Math.max(...items.map((i) => i.value), 0) || 1);

  // `armed` = post-mount marker. Tant que false (SSR + premier render
  // client), on ne pose PAS la classe `.fx-barbox-reveal` → les barres sont
  // rendues à scaleX(1) natif (pas de masquage si JS off, pas de flash en
  // SSR). Une fois mounted, on bascule armed=true → la classe apparaît, et
  // si l'observer a déjà flag revealed=true (in-view immédiat), on enchaîne
  // directement avec `.is-revealed`.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (reveal) setArmed(true);
  }, [reveal]);

  const showRevealClass = reveal && armed;
  const isRevealed = showRevealClass && revealed;
  const wrapClass = [
    "fx-barbox",
    color ? `fx-barbox-c-${color}` : "",
    showRevealClass ? "fx-barbox-reveal" : "",
    isRevealed ? "is-revealed" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={ref} className={wrapClass}>
      {header && (
        <div className="fx-barhead">
          <span>{header.left}</span>
          <span>{header.right}</span>
        </div>
      )}
      <div className="fx-breakdown">
        {items.map((row, i) => {
          const pct = Math.max(0, Math.min(100, (row.value / refValue) * 100));
          const body = (
            <>
              <span className="fx-br-label">{row.label}</span>
              <span className="fx-br-bar">
                <span
                  className="fx-br-fill"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="fx-br-val tnum">
                {row.display ?? fr.format(row.value)}
                {row.unit && <span className="fx-br-unit">{row.unit}</span>}
              </span>
            </>
          );
          const cls = ["fx-br-row", row.href ? "fx-br-row-link" : ""]
            .filter(Boolean)
            .join(" ");
          // Stagger via CSS custom prop — chaque row reçoit `--row-i` qui
          // pilote `transition-delay` (cf. fusion.css §fx-barbox-reveal).
          // On cap à 8 pour éviter les delays trop longs sur les longues
          // listes (10+ items) — au-delà, tout part en même temps.
          // On ne pose `--row-i` que si la classe reveal est armée — sinon
          // pas la peine de polluer le DOM avec un style inline.
          const staggerStyle = showRevealClass
            ? { ['--row-i' as string]: String(Math.min(i, 8)) }
            : undefined;
          return row.href ? (
            <Link
              key={i}
              href={row.href}
              className={cls}
              scroll={false}
              style={staggerStyle}
            >
              {body}
            </Link>
          ) : (
            <div key={i} className={cls} style={staggerStyle}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
