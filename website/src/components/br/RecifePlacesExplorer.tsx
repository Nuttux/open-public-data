"use client";

import { useMemo } from "react";
import { useT } from "@/lib/localeContext";
import PlacesExplorer from "@/components/places/PlacesExplorer";
import type { PlaceEntry, PlacesConfig, PlaceFamily } from "@/components/places/types";
import type { PlaceIndexEntry } from "@/lib/br/recife-places-data";
import { fill, fmtBrlCompact } from "@/lib/br/format";

// Recife civic-facility families → colours (repo palette, validated for #fafaf7).
const GROUPS: PlaceFamily[] = [
  { key: "Saúde", label: "Saúde", color: "#4a3aa7" },
  { key: "Educação", label: "Educação", color: "#1e45e4" },
  { key: "Cultura", label: "Cultura", color: "#8c5e2a" },
  { key: "Esporte", label: "Esporte", color: "#2c7339" },
  { key: "Praças", label: "Praças", color: "#1baf7a" },
];

// Recife proper — default map framing [[S,W],[N,E]].
const RECIFE_VIEW: [[number, number], [number, number]] = [
  [-8.14, -35.02],
  [-7.93, -34.83],
];

const FAMILY_LABEL: Record<"pt" | "en", Record<string, string>> = {
  pt: { "Saúde": "Saúde", "Educação": "Educação", "Cultura": "Cultura", "Esporte": "Esporte", "Praças": "Praças" },
  en: { "Saúde": "Health", "Educação": "Education", "Cultura": "Culture", "Esporte": "Sports", "Praças": "Parks & squares" },
};

/**
 * Recife adapter → shared PlacesExplorer. Maps PlaceIndexEntry → the neutral
 * PlaceEntry. Phase 1 = directory/identity (no money metric yet), so markers are
 * uniform and the row stat shows the facility type + bairro. Bilingual via useT.
 */
export default function RecifePlacesExplorer({
  places, locale,
}: {
  places: PlaceIndexEntry[];
  locale: "pt" | "en";
}) {
  const t = useT();
  const families = useMemo<PlaceFamily[]>(
    () => GROUPS.map((g) => ({ ...g, label: FAMILY_LABEL[locale][g.key] ?? g.key })), [locale]);

  const entries = useMemo<PlaceEntry[]>(
    () => places.map((p) => {
      const obras = p.obras_total ?? 0;
      const baseStat = [p.tipo ? titleCase(p.tipo) : null, p.bairro ? titleCase(p.bairro) : null].filter(Boolean).join(" · ") || (p.detalhe ?? "");
      return {
        slug: p.slug, name: titleCase(p.nome), kind: p.tipo ?? "",
        lat: p.lat, lon: p.lon, photo: null,
        familyKey: p.familia,
        areaKey: p.bairro ?? "", areaLabel: p.bairro ? titleCase(p.bairro) : "",
        metric: obras > 0 ? obras : undefined,
        stat: obras > 0 ? `${fmtBrlCompact(obras)} ${t("br.recife.lugares.em_obras")} · ${baseStat}` : baseStat,
        statTone: obras > 0 ? "money" : "muted",
        tooltipStat: obras > 0 ? ` · ${fmtBrlCompact(obras)} ${t("br.recife.lugares.em_obras")}` : undefined,
      };
    }), [places, t]);

  const config = useMemo<PlacesConfig>(() => ({
    families,
    hrefFor: (slug) => `/br/city/recife/lugares/${slug}`,
    bounds: RECIFE_VIEW,
    clampToBounds: true,
    minZoom: 11,
    maxZoom: 18,
    radiusByMetric: true,
    nearMe: false,
    sorts: [
      { key: "metric-desc", label: t("br.recife.lugares.sort_obras") },
      { key: "name-asc", label: t("br.recife.lugares.sort_name") },
    ],
    areaSort: "alpha",
    locale: "pt-BR",
    strings: {
      searchPlaceholder: t("br.recife.lugares.search_ph"),
      sortLabel: t("br.recife.qr.ordenar"),
      areaLabel: t("br.recife.lugares.bairro"),
      areaAll: t("br.recife.lugares.bairro_all"),
      count: (n) => fill(t("br.recife.lugares.count"), { n }),
      empty: t("br.recife.lugares.empty"),
      filtersAria: t("br.recife.lugares.filters_aria"),
      mapAria: t("br.recife.lugares.map_aria"),
      listAria: t("br.recife.lugares.list_aria"),
      mapNote: t("br.recife.lugares.map_note"),
      mapNoteTouch: t("br.recife.lugares.map_note_touch"),
      tooltipCta: t("br.recife.lugares.tooltip_cta"),
    },
  }), [families, t]);

  return <PlacesExplorer entries={entries} config={config} />;
}

const SMALL = new Set(["e", "de", "da", "do", "dos", "das", "a", "o", "à", "em", "para"]);
function titleCase(s: string) {
  return s.toLocaleLowerCase("pt-BR").split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w)) ? w : w ? w[0].toLocaleUpperCase("pt-BR") + w.slice(1) : w).join(" ");
}
