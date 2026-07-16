/**
 * Place registry (ADR-0010 D2) — the manifest of places the app serves.
 *
 * Data, not code: adding a place, or enabling a module on one, is an entry
 * here — not new chrome. The /us chrome derives its nav from this registry.
 * France nav still reads lib/cities.ts + nav-links.ts and joins the registry
 * post-October (logged debt, ADR-0010 D3).
 *
 * A module is listed ONLY once its route actually renders — the nav shows
 * exactly what exists, never a dead link. Each SF block flips its module on
 * in the same branch that ships the page.
 */

export type PlaceModule = {
  /** Route segment under the place path (e.g. "budget" → /us/city/sf/budget). */
  slug: string;
  /** i18n key — us.* keys are English-only, mirrored verbatim into fr.ts. */
  labelKey: string;
};

export type Place = {
  slug: string;
  country: "fr" | "us";
  scale: "national" | "city";
  /** Route prefix, e.g. "/us/city/sf". */
  path: string;
  labelKey: string;
  schemaFamily: "fr-commune" | "fr-national" | "us-federal" | "us-municipal";
  defaultLocale: "fr" | "en";
  currency: "EUR" | "USD";
  /** Export namespace under public/data/. */
  dataNamespace: string;
  /** Does `path` itself render a page? (SF hub ships in Block 5.) */
  hub: boolean;
  modules: PlaceModule[];
};

export const PLACES: Place[] = [
  {
    slug: "us-national",
    country: "us",
    scale: "national",
    path: "/us/national",
    labelKey: "us.chrome.nav.national",
    schemaFamily: "us-federal",
    defaultLocale: "en",
    currency: "USD",
    dataNamespace: "us/national",
    hub: true,
    modules: [],
  },
  {
    slug: "sf",
    country: "us",
    scale: "city",
    path: "/us/city/sf",
    labelKey: "us.chrome.nav.sf",
    schemaFamily: "us-municipal",
    defaultLocale: "en",
    currency: "USD",
    dataNamespace: "us/sf",
    hub: false,
    modules: [],
  },
];

/**
 * First live URL for a place: its hub if it renders, else its first module.
 * Null means nothing to link yet — the place stays out of the nav.
 */
export function placeHref(p: Place): string | null {
  if (p.hub) return p.path;
  if (p.modules.length > 0) return `${p.path}/${p.modules[0].slug}`;
  return null;
}

export function usPlaces(): Place[] {
  return PLACES.filter((p) => p.country === "us");
}
