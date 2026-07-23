"use client";

import { useMemo } from "react";
import { useT, useLocale } from "@/lib/localeContext";
import PlacesExplorer from "@/components/places/PlacesExplorer";
import type { PlaceEntry, PlacesConfig, PlaceFamily } from "@/components/places/types";
import type { MarseillePlace } from "@/lib/marseille/marseille-places-data";
import { fmtInt } from "@/lib/fmt";

const eur = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M€` : `${fmtInt(Math.round(n / 1e3))} k€`;

// Marseille place families → colours (repo palette, validated for the fusion bg).
const FAMILLES: { key: string; color: string; fr: string; en: string }[] = [
  { key: "culture", color: "#8c5e2a", fr: "Culture", en: "Culture" },
  { key: "sport", color: "#2c7339", fr: "Sport", en: "Sports" },
  { key: "vert", color: "#1baf7a", fr: "Espaces verts", en: "Parks & green" },
  { key: "urbain", color: "#4a3aa7", fr: "Patrimoine urbain", en: "Urban heritage" },
  { key: "services", color: "#1e45e4", fr: "Services publics", en: "Public services" },
];

// Marseille proper — default map framing [[S,W],[N,E]] (16 arrondissements).
const MARSEILLE_BOUNDS: [[number, number], [number, number]] = [
  [43.17, 5.28],
  [43.41, 5.53],
];

const arrSuffix = (n: number, locale: string) =>
  locale === "en" ? `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}` : `${n}${n === 1 ? "ᵉʳ" : "ᵉ"}`;

/**
 * Marseille adapter → shared PlacesExplorer. Maps MarseillePlace → the neutral
 * PlaceEntry, with a Wikimedia-Commons photo per place. v1 is a curated civic
 * directory (identity + geo + photo, no money metric yet) so markers are
 * uniform and the row stat shows the place kind + arrondissement.
 */
export default function MarseillePlacesExplorer({
  places,
}: {
  places: MarseillePlace[];
}) {
  const t = useT();
  const { locale } = useLocale();

  const families = useMemo<PlaceFamily[]>(
    () => FAMILLES.map((f) => ({ key: f.key, label: locale === "en" ? f.en : f.fr, color: f.color })),
    [locale],
  );

  const entries = useMemo<PlaceEntry[]>(
    () =>
      places.map((p) => {
        const kind = locale === "en" ? p.kind_en : p.kind_fr;
        const arrLabel = p.arrondissement ? arrSuffix(p.arrondissement, locale) : "";
        // Where a place is itself a grant beneficiary (Friche, La Criée…), surface
        // the money in the row + drive the marker size; others show no stat.
        const subv = p.subvention;
        return {
          slug: p.slug,
          name: p.name,
          kind,
          lat: p.lat,
          lon: p.lon,
          photo: p.photo,
          familyKey: p.famille,
          areaKey: p.arrondissement ? String(p.arrondissement) : "",
          areaLabel: arrLabel,
          metric: subv ? subv.montant_total : undefined,
          stat: subv
            ? `${eur(subv.montant_total)} ${locale === "en" ? "in grants" : "de subventions"}`
            : "",
          statTone: subv ? "money" : undefined,
        };
      }),
    [places, locale],
  );

  const config = useMemo<PlacesConfig>(
    () => ({
      families,
      hrefFor: (slug) => `/fr/city/marseille/lieu/${slug}`,
      bounds: MARSEILLE_BOUNDS,
      clampToBounds: true,
      minZoom: 11,
      maxZoom: 17,
      radiusByMetric: true,
      nearMe: false,
      sorts: [
        { key: "name-asc", label: t("fx.lieux.sort.nom") },
        { key: "metric-desc", label: t("fx.lieux.sort.montant") },
      ],
      areaSort: "numeric",
      locale: "fr-FR",
      strings: {
        searchPlaceholder: t("fx.lieux.search"),
        sortLabel: t("fx.lieux.sort_label"),
        areaLabel: t("fx.lieux.area_label"),
        areaAll: t("fx.lieux.area_all"),
        count: (n) => t("fx.lieux.count").replace("{n}", String(n)),
        empty: t("fx.lieux.empty"),
        filtersAria: t("fx.lieux.filtres_aria"),
        mapAria: t("fx.lieux.map_aria"),
        listAria: t("fx.lieux.list_aria"),
        mapNote: t("fx.lieux.map_note"),
        mapNoteTouch: t("fx.lieux.map_note_touch"),
        tooltipCta: t("fx.lieux.tooltip_cta"),
      },
    }),
    [families, t],
  );

  return <PlacesExplorer entries={entries} config={config} />;
}
