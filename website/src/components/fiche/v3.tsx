"use client";

import Link from "@/components/LocalizedLink";
import type { ReactNode } from "react";

/**
 * Le kit « fiche v3 » — un chiffre, des sections en français courant.
 *
 * Né de la fiche lieu (2026-09-03, maquette avant/après validée avec Daniel),
 * généralisé à l'association et au fournisseur : une phrase de tête, UN
 * chiffre héros avec sa légende, puis des sections titrées en Inter Tight
 * sous un filet noir, faites de rangées « libellé, sous-ligne grise, montant
 * à droite ». Pas de bandeau KPI à cellules, pas d'encadré : les notes sont
 * du texte gris sous la section. Le style vit dans fusion.css (`.fx-v3-*`).
 *
 * Règle du dépliant : on ne plie jamais UNE ligne — le caller ne replie qu'à
 * partir de deux lignes cachées (voir `foldRest`).
 */

export function V3Lead({ children, src }: { children: ReactNode; src?: ReactNode }) {
  return (
    <div>
      <p className="fx-v3-lead">{children}</p>
      {src ? <p className="fx-v3-lead-src">{src}</p> : null}
    </div>
  );
}

export function V3Hero({ v, u, caption, meta }: { v: ReactNode; u?: ReactNode; caption: ReactNode; meta?: ReactNode }) {
  return (
    <div className="fx-v3-hero">
      <div className="fx-v3-hero-num tnum">
        {v}
        {u ? <span className="u">{u}</span> : null}
      </div>
      <div className="fx-v3-hero-cap">{caption}</div>
      {meta ? <div className="fx-v3-hero-meta">{meta}</div> : null}
    </div>
  );
}

/** `id` names the section for analytics (section_view, details_toggle,
 *  link_click carry it as section_id) — a short English word, stable across
 *  locales: "who", "years", "contracts". Rendered as data-section, not a DOM
 *  id, so a fiche in a drawer never collides with the page's own anchors. */
export function V3Section({ id, title, sub, hint, children }: { id?: string; title: ReactNode; sub?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="fx-v3-section" data-section={id}>
      <h2 className="fx-v3-h2">{title}</h2>
      {sub ? <p className="fx-v3-h2sub">{sub}</p> : null}
      {hint ? <V3Hint>{hint}</V3Hint> : null}
      <div className="fx-v3-rule" />
      {children}
    </section>
  );
}

/** The one line that says what the scene does when touched — « Cliquez sur une
 *  politique pour voir le détail de ses dépenses. » Alone on its line, in ink,
 *  with the pointer, so it is read (2026-09-16: the grey sub-line was not). */
export function V3Hint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={className ? `fx-v3-hint ${className}` : "fx-v3-hint"}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 8.5V2.75a1.25 1.25 0 0 1 2.5 0V7.5" />
        <path d="M9 7.25a1.25 1.25 0 0 1 2.5 0V8" />
        <path d="M11.5 8a1.25 1.25 0 0 1 2.5 0v3.2c0 2.1-1.7 3.8-3.8 3.8H9.2a3.8 3.8 0 0 1-3.1-1.6L3.6 10a1.2 1.2 0 0 1 1.9-1.5l1 1.2" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export function V3Amt({ v, u, size = 14 }: { v: string; u: string; size?: number }) {
  return (
    <span className="fx-v3-amt tnum" style={{ fontSize: size }}>
      {v}
      <span className="u">{u}</span>
    </span>
  );
}

/**
 * Une rangée : libellé (+ sous-ligne), montant à droite. `href` interne →
 * Link ; `external` → lien nouvel onglet avec ↗ ; sans href → texte.
 * `sub` est en petites capitales mono (fournisseur · année), `subText` en
 * texte courant gris (une phrase, un motif).
 */
export function V3Row({ href, external, label, sub, subText, amount, onClick }: {
  href?: string | null;
  external?: boolean;
  label: ReactNode;
  sub?: ReactNode;
  subText?: ReactNode;
  amount?: ReactNode;
  /** A component-level event on top of the universal link_click (search results report their rank). */
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="lbl">
        {label}
        {href ? <span aria-hidden="true" className="muted">{external ? " ↗" : " ›"}</span> : null}
        {sub ? <span className="sub">{sub}</span> : null}
        {subText ? <span className="subtext">{subText}</span> : null}
      </span>
      {amount}
    </>
  );
  if (!href) return <div className="fx-v3-row">{body}</div>;
  if (external) return <a className="fx-v3-row fx-row-link" href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>{body}</a>;
  return <Link className="fx-v3-row fx-row-link" href={href} scroll={!opensInDrawer(href)} onClick={onClick}>{body}</Link>;
}

/**
 * Whether a link opens a fiche in the drawer over the current page, where the
 * page must keep its scroll position. Fiches live four segments deep or more
 * (/france/paris/marches/contrat/…, /france/paris/lieu/…, /brasil/recife/orgao/…);
 * an article (/analyses/…) or a section page (/france/paris/logement) is a new
 * page and opens at its top — it used to open on whatever chart sat at the
 * same height (Daniel, 2026-09-16).
 */
export function opensInDrawer(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/^\/(fr|en|pt)(?=\/)/, "");
  return path.split("/").filter(Boolean).length >= 4;
}

/** `id` names the fold for analytics (details_toggle.fold_id): "more-contracts",
 *  "more-years". Never derive it from the label — the label carries a count
 *  and a locale, so it changes on every fiche. */
export function V3Fold({ id, label, text, children }: { id?: string; label: string; text?: boolean; children: ReactNode }) {
  return (
    <details className="fx-v3-fold" data-fold={id}>
      <summary className={text ? "text" : undefined}>{label}</summary>
      {children}
    </details>
  );
}

export function V3Foot({ children }: { children: ReactNode }) {
  return <p className="fx-v3-foot">{children}</p>;
}

/** Jamais un dépliant pour une seule ligne : en dessous de deux lignes
 *  cachées, tout est montré. */
export function foldRest<T>(items: T[], cap: number): { shown: T[]; rest: T[] } {
  if (items.length - cap < 2) return { shown: items, rest: [] };
  return { shown: items.slice(0, cap), rest: items.slice(cap) };
}
