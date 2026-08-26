/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/descriptor.ts — WHAT A CITY IS, TO THE ENGINE.

   THE RULE THIS FILE EXISTS TO ENFORCE: `lib/citygl/` contains no city.
   No San Francisco coordinate, no San Francisco constant, no `sf` in a
   path. Everything the engine needs about a city arrives here, and almost
   all of it arrives from that city's own `manifest.json` — the projection,
   the grid, the chunk inventory, the palettes, the schemas. A second city
   is a second descriptor pointing at a second manifest.

   `engine-is-city-free.test.ts` greps the directory and fails if that ever
   stops being true.
   ═══════════════════════════════════════════════════════════════════════ */

import type { FilmScript } from "./film";

/** The paper the city is drawn on. Colours only — no geometry, no place. */
export interface CityLook {
  /** the surround / far-field colour, and what the frame is cleared to */
  haze: string;
  /** the vertical exaggeration of the ground, by camera step */
  zexByStep: readonly number[];
  /** the vertical exaggeration of BUILT height */
  zexb: number;
}

/** One named camera stop, in the city's own world metres. */
export interface CityStop {
  /** what a reader is told this stop is */
  label: string;
  /** metres of world across the viewport's width at this stop */
  spanM: number;
  /** where it looks, in world metres; omitted = the city's own centre */
  at?: readonly [number, number];
}

export interface CityDescriptor {
  /** a stable id for caches and query strings — not shown to a reader */
  id: string;
  /** where `manifest.json` and the chunk tree live, no trailing slash */
  dataBaseUrl: string;
  look: CityLook;
  /** the zoom stops, wide first */
  stops: readonly CityStop[];
  /**
   * THE FILM, IF THIS CITY HAS ONE.
   *
   * A shot list is a set of framings in this city's own world metres and a set
   * of years out of this city's own record, so it is the same kind of thing
   * `stops` is: data, arriving from outside, never a constant in the engine.
   * `film.ts` plays it and knows nothing about where it points.
   *
   * Optional because a city with no scripted piece is a city with a map, not a
   * city that is broken.
   */
  film?: FilmScript;
}

/**
 * The look every city drawn in this register shares. A city may override any
 * of it in its own descriptor; none of it names a place.
 *
 * `haze` and the two exaggerations are the Canvas renderer's own values
 * (`lib/city/terrain.ts` §HAZE, `lib/city/projection.ts` §ZEX_BY_STEP), so
 * the two engines start from the same paper and a parity screenshot compares
 * renderers rather than palettes.
 */
export const DEFAULT_LOOK: CityLook = {
  haze: "#ece7dc",
  zexByStep: [3.3, 2.6, 2.0],
  zexb: 1.6,
};
