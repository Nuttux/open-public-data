/**
 * Shared, city-agnostic model for the "places" explorer (map + side list).
 *
 * Paris (`components/fusion`) and San Francisco (`components/us`) each build a
 * thin adapter that maps their own index entry into `PlaceEntry[]` + a
 * `PlacesConfig`, then render the shared `PlacesExplorer`. Nothing here imports
 * anything city-specific, so the US fork can lift `components/places/` whole.
 */

export type PlaceFamily = { key: string; label: string; color: string };

/** Colour intent for the one stat shown on a row / in the tooltip. */
export type PlaceStatTone = "money" | "muted" | "accent";

export type PlaceEntry = {
  slug: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  photo: string | null;
  /** Already the *display group* key (adapters collapse fine families first),
   *  so it resolves directly against `config.families`. */
  familyKey: string;
  /** Secondary filter axis (arrondissement / department). "" when unknown. */
  areaKey: string;
  /** Short label shown in the row meta line + area dropdown (e.g. "18e", "DPW"). */
  areaLabel: string;
  /** Numeric weight: drives the map marker radius (when `config.radiusByMetric`)
   *  and the "metric-desc" sort. Undefined → uniform marker, sorts last. */
  metric?: number;
  /** Pre-rendered stat for the row (e.g. "2,4 M€", "12 docs · 3 contrats"). */
  stat: string;
  statTone?: PlaceStatTone;
  /** Optional extra fragment appended in the map tooltip (e.g. " · 2,4 M€"). */
  tooltipStat?: string;
};

export type PlacesSort = "metric-desc" | "name-asc";

export type PlacesStrings = {
  searchPlaceholder: string;
  sortLabel: string;
  /** Header for the area dropdown ("Arrondissement" / "Department"). */
  areaLabel: string;
  areaAll: string;
  count: (n: number) => string;
  empty: string;
  filtersAria: string;
  mapAria: string;
  listAria: string;
  mapNote: string;
  mapNoteTouch: string;
  tooltipCta: string;
  // "Near me" — only read when `config.nearMe` is true.
  nearMe?: string;
  nearMeLoading?: string;
  geoRefused?: string;
  geoUnavailable?: string;
  geoNear?: (n: number, name: string) => string;
  geoNone?: (name: string, km: string) => string;
  geoOutOfZone?: (km: string) => string;
};

export type PlacesConfig = {
  families: PlaceFamily[];
  hrefFor: (slug: string) => string;
  /** Default map framing [[south, west], [north, east]]. */
  bounds: [[number, number], [number, number]];
  /** Paris clamps panning to the city; SF pans freely (out-of-city assets). */
  clampToBounds: boolean;
  minZoom: number;
  maxZoom: number;
  /** Scale marker radius by `entry.metric` (Paris €) vs uniform dots (SF). */
  radiusByMetric: boolean;
  nearMe: boolean;
  sorts: { key: PlacesSort; label: string }[];
  areaSort: "numeric" | "alpha";
  /** Number formatting for the geolocation distance readout. */
  locale: string;
  strings: PlacesStrings;
};
