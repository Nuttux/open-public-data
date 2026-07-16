"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";

/** Carte « Par exemple » — le langage visuel des hero cards de la landing
 *  (photo, kicker, titre, gros chiffre, meta, cta), réutilisé par les
 *  sections « exemples concrets » des pages (marchés, investissements,
 *  subventions…). Chaque page fournit ses items ; ce composant ne décide
 *  rien : il rend.
 *
 *  Honnêteté photo : `photoIllustration` affiche la mention explicite —
 *  un visuel générique ne se fait jamais passer pour le vrai chantier. */
export type ExempleCardItem = {
  href: string;
  kicker: string;
  /** Accentue le kicker en ocre (ex. attribution sur offre unique). */
  kickerOcre?: boolean;
  title: string;
  amount: string;
  amountUnit: string;
  meta: string;
  cta: string;
  photoUrl: string | null;
  photoCredit: string | null;
  photoIllustration?: boolean;
};

export default function ExempleCards({ items }: { items: ExempleCardItem[] }) {
  const t = useT();
  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 20,
        alignItems: "stretch",
      }}
    >
      {items.map((it) => (
        <Link key={it.href} className="fx-hero-deck-card fx-hero-deck-card-photo" href={it.href} scroll={false}>
          {it.photoUrl && (
            <figure className="fx-hero-deck-photo">
              <img src={it.photoUrl} alt="" loading="lazy" width={1200} height={675} />
              {(it.photoIllustration || it.photoCredit) && (
                <figcaption className="fx-hero-deck-photo-credit">
                  {it.photoIllustration ? t("fx.exemples.illustration") : `© ${it.photoCredit}`}
                </figcaption>
              )}
            </figure>
          )}
          <div className="fx-hero-deck-body">
            <span
              className="fx-hero-deck-kicker"
              style={it.kickerOcre ? { color: "var(--ocre)" } : undefined}
            >
              {it.kicker}
            </span>
            <h3
              className="fx-hero-deck-title"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {it.title}
            </h3>
            <p className="fx-hero-deck-num tnum">
              {it.amount} <span className="u">{it.amountUnit}</span>
            </p>
            <p className="fx-hero-deck-meta">{it.meta}</p>
            <p className="fx-hero-deck-cta">
              {it.cta} <span aria-hidden="true">→</span>
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
