import type { LieuxCity, LieuxFamily } from "@/app/[lang]/france/paris/lieux/LieuxClient";

/**
 * San Francisco's places on the Lieux section (2026-09-18) : what differs
 * from Paris, and nothing that needs the file system.
 */

/** The seed's fine families (park, water, library, culture, health, civic,
 *  port, transit, fire) collapse into five display groups, on the palette
 *  validated for the Paris map (scripts/validate_palette.js on #fafaf7). */
export const SF_FAMILIES: LieuxFamily[] = [
  { key: "green", color: "#1baf7a", i18n: "fx.lieux.fam.green" },
  { key: "civic", color: "#1e45e4", i18n: "fx.lieux.fam.civic" },
  { key: "learning", color: "#c12323", i18n: "fx.lieux.fam.learning" },
  { key: "health", color: "#4a3aa7", i18n: "fx.lieux.fam.health" },
  { key: "infra", color: "#eda100", i18n: "fx.lieux.fam.infra" },
];

export const SF_FAMILY_KEY: Record<string, string> = {
  park: "green", water: "green",
  library: "learning", culture: "learning",
  health: "health",
  civic: "civic",
  port: "infra", transit: "infra", fire: "infra",
};

export const SF_LIEUX: LieuxCity = {
  slug: "sf",
  name: "San Francisco",
  hub: "/usa/san-francisco",
  section: "/usa/san-francisco/places",
  fiche: "/usa/san-francisco/places/place",
  seeds: ["Golden Gate Park", "Main Library", "Laguna Honda"],
  currency: "USD",
  // The money is what the City paid contractors for work at the place : paid, with no year on file.
  money: "paid",
  area: { kind: "dept", param: "department" },
  familyParam: "family",
  families: SF_FAMILIES,
  // San Francisco proper ; panning beyond stays allowed so a place's out-of-city
  // assets (Hetch Hetchy, Camp Mather) remain reachable.
  bounds: [[37.708, -122.515], [37.833, -122.355]],
  clampToBounds: false,
  sources: [
    { label: "DataSF", href: "https://data.sfgov.org/" },
    { label: "Internet Archive", href: "https://archive.org/details/sanfranciscopubliclibrary" },
  ],
  json: "/data/us/sf/places/index.json",
  chrome: "registry",
};
