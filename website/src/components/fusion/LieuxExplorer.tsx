"use client";

import { useEffect, useMemo } from "react";
import type { LieuIndexEntry } from "@/lib/lieux-data";
import { useT } from "@/lib/localeContext";
import { clearDrawerStack } from "./DetailDrawer";
import PlacesExplorer from "@/components/places/PlacesExplorer";
import type { PlaceEntry, PlacesConfig } from "@/components/places/types";

/** Familles de lieu — la taxonomie vient du seed (colonne `famille`). Palette
 *  validée par scripts/validate_palette.js du skill dataviz sur #fafaf7 : rouge
 *  et bleu de la marque, pire écart adjacent ΔE 14,4 en deutéranopie. */
const FAMILLES: { key: string; color: string; i18n: string }[] = [
  { key: "sport", color: "#1e45e4", i18n: "fx.lieux.fam.sport" },
  { key: "vert", color: "#1baf7a", i18n: "fx.lieux.fam.vert" },
  { key: "culture", color: "#c12323", i18n: "fx.lieux.fam.culture" },
  { key: "urbain", color: "#eda100", i18n: "fx.lieux.fam.urbain" },
  { key: "services", color: "#4a3aa7", i18n: "fx.lieux.fam.services" },
];

/** Cadrage constant sur Paris intra-muros (pas le rectangle des lieux couverts). */
const PARIS_BOUNDS: [[number, number], [number, number]] = [
  [48.8156, 2.2241],
  [48.9022, 2.4699],
];

const fmtArgent = (v: number) =>
  v >= 1e6
    ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`
    : `${Math.round(v / 1e3)} k€`;

const arrLabel = (n: number) => `${n}${n === 1 ? "er" : "e"}`;

/**
 * Adaptateur Paris → explorateur de lieux partagé. On mappe `LieuIndexEntry`
 * vers le modèle neutre `PlaceEntry` et on branche la config (carte de Paris,
 * rayon ∝ argent, « autour de moi »). Toute la mécanique carte+liste vit dans
 * `components/places`.
 */
export default function LieuxExplorer({ lieux }: { lieux: LieuIndexEntry[] }) {
  const t = useT();

  // On est sur la LISTE : aucune chaîne de drill-down en cours. On vide la pile
  // pour qu'une fiche ouverte d'ici n'affiche pas de pastille « ← Retour ».
  useEffect(() => { clearDrawerStack(); }, []);

  const entries = useMemo<PlaceEntry[]>(
    () =>
      lieux.map((l) => {
        const argent = l.argent_total_eur ?? 0;
        return {
          slug: l.slug,
          name: l.name,
          kind: l.kind_fr,
          lat: l.lat,
          lon: l.lon,
          photo: l.photo,
          familyKey: l.famille,
          areaKey: l.arrondissement > 0 ? String(l.arrondissement) : "",
          areaLabel: l.arrondissement > 0 ? arrLabel(l.arrondissement) : "",
          metric: argent,
          stat: argent > 0 ? fmtArgent(argent) : l.depuis ? `${t("fx.lieux.card_depuis")} ${l.depuis}` : "",
          statTone: argent > 0 ? "money" : "accent",
          tooltipStat: argent >= 1e6 ? ` · ${fmtArgent(argent)}` : "",
        };
      }),
    [lieux, t],
  );

  const config = useMemo<PlacesConfig>(
    () => ({
      families: FAMILLES.map((f) => ({ key: f.key, label: t(f.i18n), color: f.color })),
      hrefFor: (slug) => `/fr/city/paris/lieu/${slug}`,
      bounds: PARIS_BOUNDS,
      clampToBounds: true,
      minZoom: 11,
      maxZoom: 17,
      radiusByMetric: true,
      nearMe: false,
      sorts: [
        { key: "metric-desc", label: t("fx.lieux.sort.montant") },
        { key: "name-asc", label: t("fx.lieux.sort.nom") },
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
        nearMe: t("fx.lieux.autour_de_moi"),
        nearMeLoading: t("fx.lieux.geo_chargement"),
        geoRefused: t("fx.lieux.geo_refus"),
        geoUnavailable: t("fx.lieux.geo_indispo"),
        geoNear: (n, nom) => t("fx.lieux.geo_proches").replace("{n}", String(n)).replace("{nom}", nom),
        geoNone: (nom, km) => t("fx.lieux.geo_aucun").replace("{nom}", nom).replace("{km}", km),
        geoOutOfZone: (km) => t("fx.lieux.geo_hors_zone").replace("{km}", km),
      },
    }),
    [t],
  );

  return <PlacesExplorer entries={entries} config={config} />;
}
