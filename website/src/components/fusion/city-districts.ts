import { ARRONDISSEMENT_PATHS, C_AR_BY_INDEX } from "./paris-arrondissements";
import {
  MARSEILLE_ARRONDISSEMENT_PATHS,
  MARSEILLE_VIEWBOX,
} from "./marseille-arrondissements";

export type CityDistrictGeometry = {
  paths: string[];
  regionByIndex: (number | null)[];
  viewBox: string;
  regionForArr?: (arr: number) => number;
  centreRegionId?: number;
  centreLabel?: (locale: "fr" | "en") => string;
};

const PARIS_CENTRAL_ARRS = [1, 2, 3, 4];

// Marseille geometry is grouped (one entry per arrondissement, each with
// several MultiPolygon parts). DistrictChoropleth wants a flat path list
// parallel to a region-id list — flatten once here.
const MARSEILLE_PATHS = MARSEILLE_ARRONDISSEMENT_PATHS.flatMap((a) => a.paths);
const MARSEILLE_REGION_BY_INDEX = MARSEILLE_ARRONDISSEMENT_PATHS.flatMap((a) =>
  a.paths.map(() => a.arr),
);

/**
 * Resolve a city's SVG district geometry for the universal DistrictChoropleth.
 * Returns null for cities with no geometry yet — the caller degrades to a
 * ranking list (P3.2 option a). Paris keeps its 1-4 → "Paris Centre" merge;
 * other cities use identity regions until they declare otherwise.
 *
 * This is the single citySlug → geometry registry: adding a city's map is a
 * data change here, not a new forked component.
 */
export function cityDistrictGeometry(
  citySlug: string,
): CityDistrictGeometry | null {
  if (citySlug === "paris") {
    return {
      paths: ARRONDISSEMENT_PATHS,
      regionByIndex: C_AR_BY_INDEX,
      viewBox: "0 0 200 140",
      regionForArr: (arr) => (PARIS_CENTRAL_ARRS.includes(arr) ? 0 : arr),
      centreRegionId: 0,
      centreLabel: (locale) =>
        locale === "en" ? "Paris Centre (1-4th)" : "Paris Centre (1-4ᵉ)",
    };
  }
  if (citySlug === "marseille") {
    return {
      paths: MARSEILLE_PATHS,
      regionByIndex: MARSEILLE_REGION_BY_INDEX,
      viewBox: MARSEILLE_VIEWBOX,
    };
  }
  return null;
}
