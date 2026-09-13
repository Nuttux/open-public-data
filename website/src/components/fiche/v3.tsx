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

export function V3Section({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="fx-v3-section">
      <h2 className="fx-v3-h2">{title}</h2>
      {sub ? <p className="fx-v3-h2sub">{sub}</p> : null}
      <div className="fx-v3-rule" />
      {children}
    </section>
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
export function V3Row({ href, external, label, sub, subText, amount }: {
  href?: string | null;
  external?: boolean;
  label: ReactNode;
  sub?: ReactNode;
  subText?: ReactNode;
  amount?: ReactNode;
}) {
  const body = (
    <>
      <span className="lbl">
        {label}
        {href ? <span aria-hidden="true" className="muted">{external ? " ↗" : " →"}</span> : null}
        {sub ? <span className="sub">{sub}</span> : null}
        {subText ? <span className="subtext">{subText}</span> : null}
      </span>
      {amount}
    </>
  );
  if (!href) return <div className="fx-v3-row">{body}</div>;
  if (external) return <a className="fx-v3-row fx-row-link" href={href} target="_blank" rel="noopener noreferrer">{body}</a>;
  return <Link className="fx-v3-row fx-row-link" href={href} scroll={false}>{body}</Link>;
}

export function V3Fold({ label, text, children }: { label: string; text?: boolean; children: ReactNode }) {
  return (
    <details className="fx-v3-fold">
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
