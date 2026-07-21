/**
 * Neutral fiche primitives — the shared building blocks every city's entity
 * fiche composes (shell → stat hero → sections → year bars / doc list → source
 * footer). City-agnostic by construction: no city data, components, or i18n
 * imports (enforced by the boundary rule in eslint.config.mjs). Adapters/fiches
 * map their own data onto these types. See docs/adding-a-city.md.
 */

/** A row in an archive paper-trail list — any city's document shape maps here. */
export type FicheDoc = {
  id: string;
  title: string;
  year?: number | null;
  href: string;
  /** Snippet with «…» guillemet spans marking hit terms to highlight. */
  snippet?: string | null;
  sourceLabel: string;
};

/** One bar in a per-year chart. */
export type FicheYearPoint = { year: number; value: number };
