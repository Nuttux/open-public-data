"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CityCtx = {
  /** City slug as used in data paths, e.g. "paris". */
  slug: string;
  /** Route prefix for city-scoped links, e.g. "/fr/city/paris". */
  basePath: string;
};

/**
 * Which city the surrounding page is about. Defaults to Paris so existing
 * pages need no provider; a second city wraps its layout in <CityProvider>.
 * Fiche components must build internal links from `useCity().basePath`
 * instead of hardcoding "/fr/city/paris".
 */
const CityContext = createContext<CityCtx>({ slug: "paris", basePath: "/fr/city/paris" });

export function CityProvider({ city, children }: { city: CityCtx; children: ReactNode }) {
  return <CityContext.Provider value={city}>{children}</CityContext.Provider>;
}

export function useCity(): CityCtx {
  return useContext(CityContext);
}
