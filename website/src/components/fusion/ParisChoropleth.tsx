"use client";

import DistrictChoropleth, { type DistrictItem } from "./DistrictChoropleth";
import { ARRONDISSEMENT_PATHS, C_AR_BY_INDEX } from "./paris-arrondissements";

// Central arrondissements 1-4 fusionnés en secteur "Paris Centre" (c_ar=0).
const CENTRAL_ARRS = [1, 2, 3, 4];
const parisRegionForArr = (arr: number) => (CENTRAL_ARRS.includes(arr) ? 0 : arr);
const parisCentreLabel = (locale: "fr" | "en") =>
  locale === "en" ? "Paris Centre (1-4th)" : "Paris Centre (1-4ᵉ)";
const parisDefaultHref = (cAr: number) =>
  `/investissements/arrondissement/${cAr === 0 ? 1 : cAr}`;

type Props = {
  items: DistrictItem[];
  height?: number;
  formatValue?: (v: number) => string;
  unitLabel?: string;
  hrefFor?: (arr: number) => string | null;
  onTileClick?: (arr: number) => void;
  showRanking?: boolean;
};

/**
 * Paris district choropleth — a thin preset over the generic DistrictChoropleth
 * (Paris geometry + the arr 1-4 → "Paris Centre" merge + the /investissements
 * default href). Kept as a named component so the three Paris call sites
 * (investissements, logement, hors-bilan) are unchanged.
 */
export default function ParisChoropleth(props: Props) {
  return (
    <DistrictChoropleth
      {...props}
      hrefFor={props.hrefFor ?? parisDefaultHref}
      paths={ARRONDISSEMENT_PATHS}
      regionByIndex={C_AR_BY_INDEX}
      viewBox="0 0 200 140"
      regionForArr={parisRegionForArr}
      centreRegionId={0}
      centreLabel={parisCentreLabel}
    />
  );
}
