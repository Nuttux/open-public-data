"use client";

import DistrictChoropleth, { type DistrictItem } from "./DistrictChoropleth";
import { cityDistrictGeometry } from "./city-districts";

type Props = {
  citySlug: string;
  items: DistrictItem[];
  height?: number;
  formatValue?: (v: number) => string;
  unitLabel?: string;
  /** Builds the drill href from a district id. Return null (or pass a builder
   *  that always returns null) to make tiles non-clickable — a city with a
   *  map but no district route yet. */
  hrefFor?: (arr: number) => string | null;
  onTileClick?: (arr: number) => void;
  showRanking?: boolean;
};

/**
 * City-agnostic district choropleth: resolves the city's geometry from the
 * shared registry (`city-districts`) and renders the universal
 * DistrictChoropleth. Renders nothing when the city has no geometry — the
 * caller shows a fallback (e.g. a ranking list). Paris keeps its dedicated
 * ParisChoropleth preset (the 1-4 merge); this powers every other city
 * without forking a component per city.
 */
export default function CityChoropleth({ citySlug, hrefFor, ...rest }: Props) {
  const geo = cityDistrictGeometry(citySlug);
  if (!geo) return null;
  return (
    <DistrictChoropleth
      {...rest}
      paths={geo.paths}
      regionByIndex={geo.regionByIndex}
      viewBox={geo.viewBox}
      regionForArr={geo.regionForArr}
      centreRegionId={geo.centreRegionId}
      centreLabel={geo.centreLabel}
      hrefFor={hrefFor}
    />
  );
}
