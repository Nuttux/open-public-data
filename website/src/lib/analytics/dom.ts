/**
 * DOM helpers for the global instruments in AnalyticsProvider: which section
 * an element sits in, what role a link plays, how a fold is named. Kept out
 * of React so they can be unit-tested with plain strings where possible.
 */

/** "Qui l'a reçu ?" → "qui-l-a-recu" (40 chars max). Only used as a LAST
 *  resort for a section id — it depends on the locale, so ids built from
 *  text carry an `h:` prefix in the events. */
export function slugText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export type SectionRef = { id: string | null; source: "data" | "id" | "h2" | "text" | null };

const SECTION_SEL = "section, [data-section]";

/**
 * The section an element belongs to. Explicit ids first, walking up through
 * nested sections (a fiche section inside a page section reports the page
 * section's anchor if the fiche section has no id of its own); the heading
 * text only when nothing on the way up was named.
 */
export function sectionIdFor(el: Element | null): SectionRef {
  let node: Element | null = el;
  let nearest: HTMLElement | null = null;
  while (node) {
    const sec = node.closest(SECTION_SEL) as HTMLElement | null;
    if (!sec) break;
    if (!nearest) nearest = sec;
    const d = sec.dataset?.section;
    if (d) return { id: d, source: "data" };
    if (sec.id) return { id: sec.id, source: "id" };
    const h = sec.querySelector("h2[id], h3[id]");
    if (h?.id) return { id: h.id, source: "h2" };
    node = sec.parentElement;
  }
  const heading = nearest?.querySelector("h2, h3, .fx-fiche-h, .fx-v3-h2");
  const text = heading?.textContent?.trim();
  if (text) return { id: "h:" + slugText(text), source: "text" };
  return { id: null, source: null };
}

/** The fold's own name: `data-fold` from V3Fold / FicheMore, else its id. */
export function foldIdFor(el: HTMLElement): string | null {
  return el.dataset?.fold || el.id || null;
}

const ROLE_RULES: [string, string][] = [
  ["header.fx-nav", "nav"],
  ["footer.fx-foot", "footer"],
  [".fx-drawer-crumb", "crumb"],
  [".fx-drawer-head", "drawer_head"],
  [".fx-page-toc, .fx-pv-toc", "toc"],
  [".fx-year-picker", "year"],
  ["[data-cta]", "cta"],
  ["[data-block]", "block"],
  [".fx-v3-hero-meta", "hero_meta"],
  [".fx-v3-lead, .fx-v3-lead-src", "lead"],
  [".fx-v3-foot", "foot"],
  [".fx-v3-row, .fx-row-link, .fx-pv-line, .fx-bars-row", "row"],
  [".fx-v3-sentence, .fx-pv-link", "sentence"],
  [".fx-mosaic-tile", "tile"],
  [".fx-door", "door"],
  [".fx-next", "next"],
  // The kicker sits inside the section hero: it must be matched first.
  [".fx-drawer-kicker, .fx-page-kicker", "kicker"],
  [".fx-sec-hero", "hero"],
  [".fx-land-deck, .fx-hero-deck", "deck"],
  [".fx-land-marquee, .fx-marquee", "marquee"],
  [".fx-land-chips", "chips"],
];

/** Where on the page a link lives. `[data-block="x"]` wins with its own name
 *  so a component can label a block (deck, related, sources…) without code. */
export function linkRole(a: Element): string {
  for (const [sel, role] of ROLE_RULES) {
    const hit = a.closest(sel) as HTMLElement | null;
    if (!hit) continue;
    if (role === "block") return hit.dataset.block || "block";
    return role;
  }
  return "body";
}

const SOURCE_SEL = ".fx-v3-lead-src, .fx-v3-foot, #sec-sources, .fx-footer-sources, .fx-fiche-sources, [data-block=\"sources\"], .fx-src";

/** An outbound link that cites where a figure comes from. */
export function isSourceLink(a: Element): boolean {
  return Boolean(a.closest(SOURCE_SEL));
}
