"use client";

import { useMemo } from "react";
import type { SfPlaceIndexEntry } from "@/lib/us/sf-places-data";
import PlacesExplorer from "@/components/places/PlacesExplorer";
import type { PlaceEntry, PlacesConfig } from "@/components/places/types";

// Fine seed families → 5 display groups, on the repo's palette validated for
// #fafaf7 (see components/places/PlacesMap + scripts/validate_palette.js).
const GROUP_OF: Record<string, string> = {
  park: "green", water: "green",
  library: "learning", culture: "learning",
  health: "health",
  civic: "civic",
  port: "infra", transit: "infra", fire: "infra",
};
const GROUPS: { key: string; color: string; label: string }[] = [
  { key: "green", color: "#1baf7a", label: "Parks & water" },
  { key: "civic", color: "#1e45e4", label: "Civic buildings" },
  { key: "learning", color: "#c12323", label: "Libraries & culture" },
  { key: "health", color: "#4a3aa7", label: "Health" },
  { key: "infra", color: "#eda100", label: "Port, transit & fire" },
];

// San Francisco proper — the default framing. Panning beyond stays allowed so a
// place seed's out-of-city assets (Hetch Hetchy, Camp Mather) remain reachable.
const SF_VIEW: [[number, number], [number, number]] = [
  [37.708, -122.515],
  [37.833, -122.355],
];

/**
 * San Francisco adapter → shared places explorer. Maps `SfPlaceIndexEntry` to
 * the neutral `PlaceEntry` model. SF carries no dollar figure in the index yet,
 * so the row stat is document / contract counts and markers are uniform (metric
 * feeds only the "most documented" sort, not the radius).
 */
export default function SfPlacesExplorer({ places }: { places: SfPlaceIndexEntry[] }) {
  const entries = useMemo<PlaceEntry[]>(
    () =>
      places.map((p) => ({
        slug: p.slug,
        name: p.name,
        kind: p.kind,
        lat: p.lat,
        lon: p.lon,
        photo: p.photo,
        familyKey: GROUP_OF[p.family] ?? "civic",
        areaKey: p.owning_dept_code || "",
        areaLabel: p.owning_dept_code || "",
        metric: p.n_documents,
        stat: `${p.n_documents} docs${p.n_contracts > 0 ? ` · ${p.n_contracts} contracts` : ""}`,
        statTone: "muted",
        tooltipStat: ` · ${p.n_documents} archive docs`,
      })),
    [places],
  );

  const config = useMemo<PlacesConfig>(
    () => ({
      families: GROUPS,
      hrefFor: (slug) => `/us/city/sf/places/place/${slug}`,
      bounds: SF_VIEW,
      clampToBounds: false,
      minZoom: 10,
      maxZoom: 17,
      radiusByMetric: false,
      nearMe: false,
      sorts: [
        { key: "name-asc", label: "Name" },
        { key: "metric-desc", label: "Most documented" },
      ],
      areaSort: "alpha",
      locale: "en-US",
      strings: {
        searchPlaceholder: "Search a place…",
        sortLabel: "Sort",
        areaLabel: "Department",
        areaAll: "All",
        count: (n) => `${n} places`,
        empty: "No place matches these filters.",
        filtersAria: "Filter places by kind",
        mapAria: "Map of San Francisco places",
        listAria: "List of San Francisco places",
        mapNote: "Click a point for the place · double-click or ⌘+wheel to zoom",
        mapNoteTouch: "Tap a point for the place · pinch to zoom",
        tooltipCta: "Click to open →",
      },
    }),
    [],
  );

  return <PlacesExplorer entries={entries} config={config} />;
}
