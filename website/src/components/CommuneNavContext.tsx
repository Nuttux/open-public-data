"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Commune navigation context.
 *
 * National tail communes (the ~35k not in the cities.ts registry) have no entry
 * in any nav registry, so the chrome would otherwise fall back to a Paris shape:
 * the switcher labels them "Paris" and the section nav emits Paris's fixed links
 * (subventions/logement/dette) that 404. The `[slug]` layout computes each
 * commune's REAL sections (from getCommuneCapabilities) server-side and provides
 * them here, so Navbar + PlaceSwitcher render commune-accurate navigation.
 *
 * Value is null on pages with no commune scope (default chrome unchanged).
 */
export type CommuneNav = {
  slug: string;
  nom: string;
  /** Section ids the commune actually has, e.g. ["budget","comparaison",...]. */
  sections: string[];
};

const CommuneNavCtx = createContext<CommuneNav | null>(null);

export function CommuneNavProvider({
  value,
  children,
}: {
  value: CommuneNav | null;
  children: ReactNode;
}) {
  return <CommuneNavCtx.Provider value={value}>{children}</CommuneNavCtx.Provider>;
}

export function useCommuneNav(): CommuneNav | null {
  return useContext(CommuneNavCtx);
}
