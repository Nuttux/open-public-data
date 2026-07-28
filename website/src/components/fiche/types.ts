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

/** One row of the archive shelf (FicheArchiveShelf) — the presentation
 *  contract's whole vocabulary. Deliberately narrower than FicheDoc: there is
 *  no snippet field, because raw archive text is not shown to readers, and no
 *  creator field, because a fourth line per document is what made the SF
 *  shelves three screens long. */
export type FicheArchiveDoc = {
  id: string;
  /** One line on what this document SAYS. Written from the document's own
   *  text upstream; never a raw OCR fragment. */
  gloss?: string | null;
  title: string;
  year?: number | null;
  /** Deep link to the document in the archive. */
  href: string;
  /** The collection it is held in, spelled out. */
  sourceLabel: string;
  /** e.g. "4 editions cited (1920–2005)" when repeat editions were collapsed. */
  variantNote?: string | null;
};

/** One bar in a per-year chart. `provisional` marks an incomplete current year
 *  (rendered with a distinct hatched style so it never reads as a real drop). */
export type FicheYearPoint = { year: number; value: number; provisional?: boolean };
