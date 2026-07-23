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

/**
 * Canonical module kind — the SAME concept across places regardless of local
 * slug/label (Paris `lieux`, SF `places`, Recife `lugares` are all `places`).
 * MODULE_KIND_ORDER fixes the nav sequence so a kind always sits in the same
 * slot everywhere: places first (materiality before percentages, the Paris
 * convention), then the money views, with place-specific extras trailing.
 */
export type ModuleKind =
  | "places"
  | "budget"
  | "investments"
  | "recipients"
  | "contracts"
  | "payroll"
  | "housing"
  | "debt"
  | "analyses"
  | "sources";

export const MODULE_KIND_ORDER: ModuleKind[] = [
  "places",
  "budget",
  "investments",
  "recipients",
  "contracts",
  "payroll",
  "housing",
  "debt",
  "analyses",
  "sources",
];

export type PlaceModule = {
  /** Route segment under the place path (e.g. "budget" → /us/city/sf/budget). */
  slug: string;
  /** i18n key — us.* keys are English-only, mirrored verbatim into fr.ts. */
  labelKey: string;
  /** Canonical kind, used to order the nav coherently across places. */
  kind?: ModuleKind;
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
  /**
   * Proper-noun label for the place switcher (language-invariant: "Paris",
   * "Recife", "San Francisco"). Preferred over `labelKey` when set so a city
   * name needs no per-locale translation.
   */
  name?: string;
  /**
   * Prototype / proof-of-concept: shows the POC disclaimer banner and is
   * flagged in the switcher. Flagship places (Paris, France-national landing)
   * leave this false.
   */
  poc?: boolean;
  /**
   * Where the switcher navigates when this is NOT `hub` at `path` — used for
   * places whose live URL differs from the registry path (Paris = root URLs).
   */
  switchHref?: string;
  /**
   * Keep this place OUT of the switcher menu (its route still exists). Used for
   * scopes too thin to be a switch target yet (US national is a working-title
   * single page).
   */
  hideFromSwitcher?: boolean;
  /**
   * This place renders its own status/WIP strip (e.g. Marseille's WipBanner), so
   * the chrome must NOT also stack the generic POC banner. Still shows the "PoC"
   * tag in the switcher.
   */
  ownWipBanner?: boolean;
};

/** Country display order + flag for the switcher's grouping. */
export const COUNTRY_ORDER: Place["country"][] = ["fr", "us", "br"];
export const COUNTRY_FLAG: Record<Place["country"], string> = {
  fr: "🇫🇷",
  us: "🇺🇸",
  br: "🇧🇷",
};

export const PLACES: Place[] = [
  // ── France ────────────────────────────────────────────────────────────────
  // Additive-only for now: the France chrome still reads lib/cities.ts +
  // nav-links.ts (ADR-0010 D3), so these entries drive ONLY the place switcher
  // (jump targets), not France's nav. Paris lives at ROOT URLs, so it carries a
  // `switchHref`; its per-module registry migration is Block B.
  {
    slug: "fr-national",
    country: "fr",
    scale: "national",
    path: "/fr/national/budget",
    labelKey: "chrome.scope.national",
    name: undefined,
    schemaFamily: "fr-national",
    defaultLocale: "fr",
    currency: "EUR",
    dataNamespace: "fr/national",
    hub: true,
    poc: true,
    modules: [],
  },
  {
    slug: "paris",
    country: "fr",
    scale: "city",
    path: "/fr/city/paris",
    switchHref: "/",
    labelKey: "chrome.place.paris",
    name: "Paris",
    schemaFamily: "fr-commune",
    defaultLocale: "fr",
    currency: "EUR",
    dataNamespace: "fr/paris",
    hub: true,
    modules: [],
  },
  {
    slug: "marseille",
    country: "fr",
    scale: "city",
    path: "/fr/city/marseille",
    labelKey: "chrome.place.marseille",
    name: "Marseille",
    schemaFamily: "fr-commune",
    defaultLocale: "fr",
    currency: "EUR",
    dataNamespace: "fr/marseille",
    hub: true, // its landing renders at /fr/city/marseille → switcher lands there
    poc: true,
    modules: [
      { slug: "budget", labelKey: "fx.nav.link.budget" },
      { slug: "lieux", labelKey: "fx.nav.link.lieux" },
    ],
  },
  // ── United States ─────────────────────────────────────────────────────────
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
    poc: true,
    hideFromSwitcher: true,
    modules: [],
  },
  {
    slug: "sf",
    name: "San Francisco",
    country: "us",
    scale: "city",
    path: "/us/city/sf",
    labelKey: "us.chrome.nav.sf",
    schemaFamily: "us-municipal",
    defaultLocale: "en",
    currency: "USD",
    dataNamespace: "us/sf",
    hub: true,
    poc: true,
    modules: [
      { slug: "budget", labelKey: "us.sf.nav.budget", kind: "budget" },
      { slug: "who-gets-paid", labelKey: "us.sf.nav.who_gets_paid", kind: "recipients" },
      { slug: "contracts", labelKey: "us.sf.nav.contracts", kind: "contracts" },
      { slug: "payroll", labelKey: "us.sf.nav.payroll", kind: "payroll" },
      { slug: "places", labelKey: "us.sf.nav.places", kind: "places" },
      // "sources" route exists but is intentionally kept out of the nav (parity
      // with Paris, whose méthode/sources live outside the main nav).
    ],
  },
  {
    slug: "recife",
    name: "Recife",
    country: "br",
    scale: "city",
    path: "/br/city/recife",
    labelKey: "br.chrome.nav.recife",
    schemaFamily: "br-municipal",
    defaultLocale: "pt",
    currency: "BRL",
    dataNamespace: "br/recife",
    hub: true,
    poc: true,
    modules: [
      { slug: "budget", labelKey: "br.recife.nav.budget", kind: "budget" },
      { slug: "quem-recebe", labelKey: "br.recife.nav.quem_recebe", kind: "recipients" },
      { slug: "contratos", labelKey: "br.recife.nav.contratos", kind: "contracts" },
      { slug: "lugares", labelKey: "br.recife.nav.lugares", kind: "places" },
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

export function getPlace(slug: string): Place | undefined {
  return PLACES.find((p) => p.slug === slug);
}

/**
 * A place's modules in the canonical nav order (MODULE_KIND_ORDER). Modules with
 * no `kind` keep their declared order, after all kinded ones. Stable — equal
 * ranks preserve registry order. This is what the chrome renders so the nav
 * sequence is coherent across every place.
 */
export function orderedModules(place: Place): PlaceModule[] {
  const rank = (m: PlaceModule) => {
    const i = m.kind ? MODULE_KIND_ORDER.indexOf(m.kind) : -1;
    return i === -1 ? MODULE_KIND_ORDER.length : i;
  };
  return place.modules
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i)
    .map((x) => x.m);
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

/**
 * Where the place switcher navigates for a place: its explicit `switchHref`
 * (Paris = root URLs), else its hub/first-module href. Null = nothing linkable.
 */
export function switchTarget(p: Place): string | null {
  return p.switchHref ?? placeHref(p);
}

/**
 * The place a pathname is inside — longest registry `path` prefix wins so
 * `/us/city/sf/budget` resolves to SF, not US-national. Paris (root URLs) is
 * matched by its `switchHref` when that is a real prefix. Used by the switcher
 * to mark the current place; France's own chrome still uses lib/cities.ts.
 */
export function currentPlace(pathname: string): Place | undefined {
  return [...PLACES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`));
}

/** Registry grouped by country in display order, empty groups dropped. */
export function placesByCountry(): { country: Place["country"]; places: Place[] }[] {
  return COUNTRY_ORDER.map((country) => ({
    country,
    places: PLACES.filter(
      (p) => p.country === country && switchTarget(p) !== null && !p.hideFromSwitcher,
    ),
  })).filter((g) => g.places.length > 0);
}
