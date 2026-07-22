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
  country: "fr" | "us" | "br";
  scale: "national" | "city";
  /** Route prefix, e.g. "/us/city/sf". */
  path: string;
  labelKey: string;
  schemaFamily: "fr-commune" | "fr-national" | "us-federal" | "us-municipal" | "br-municipal";
  defaultLocale: "fr" | "en" | "pt";
  currency: "EUR" | "USD" | "BRL";
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
    hub: true,
    modules: [
      { slug: "budget", labelKey: "us.sf.nav.budget" },
      { slug: "who-gets-paid", labelKey: "us.sf.nav.who_gets_paid" },
      { slug: "contracts", labelKey: "us.sf.nav.contracts" },
      { slug: "payroll", labelKey: "us.sf.nav.payroll" },
      { slug: "places", labelKey: "us.sf.nav.places" },
      { slug: "sources", labelKey: "us.sf.nav.sources" },
    ],
  },
  {
    slug: "recife",
    country: "br",
    scale: "city",
    path: "/br/city/recife",
    labelKey: "br.chrome.nav.recife",
    schemaFamily: "br-municipal",
    defaultLocale: "pt",
    currency: "BRL",
    dataNamespace: "br/recife",
    hub: false,
    modules: [
      { slug: "budget", labelKey: "br.recife.nav.budget" },
      { slug: "quem-recebe", labelKey: "br.recife.nav.quem_recebe" },
      { slug: "contratos", labelKey: "br.recife.nav.contratos" },
    ],
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

export function brPlaces(): Place[] {
  return PLACES.filter((p) => p.country === "br");
}

/** Registry-driven chrome selector — one chrome serves any country. */
export function placesForCountry(country: Place["country"]): Place[] {
  return PLACES.filter((p) => p.country === country);
}
