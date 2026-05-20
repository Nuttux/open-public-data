"use client";

import { useT } from "@/lib/localeContext";

/**
 * Bandeau affiché en haut des pages d'une ville encore en v1 (POC partiel).
 * Statique pour l'instant — pourra lire depuis un seed `seed_city_status.csv`
 * quand on aura besoin de plus de villes.
 *
 * Affichage : barre fine en haut, fond ocré, dismissable visuellement (pas
 * fermable côté user) — signale honnêtement que le périmètre n'est pas
 * encore équivalent à Paris.
 */
export default function WipBanner({ city }: { city: "marseille" }) {
  const t = useT();
  return (
    <div className="fx-wip-banner" role="note" aria-label={t(`fx.wip.${city}.aria`)}>
      <div className="fx-wrap">
        <span className="fx-wip-banner-em">{t(`fx.wip.${city}.eyebrow`)}</span>
        <span className="fx-wip-banner-text">{t(`fx.wip.${city}.text`)}</span>
      </div>
    </div>
  );
}
