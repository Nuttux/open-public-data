export type NavLink = {
  href: string;
  labelKey: string;
};

// Top-nav links shown when the user is on a France-scope page
// (/fr/national*, /comparer, /fr/city/*/daily-bread).
export const NATIONAL_NAV_LINKS: NavLink[] = [
  { href: "/",                          labelKey: "fx.nav.link.home" },
  { href: "/fr/national/budget",             labelKey: "fx.nav.link.budget_france" },
  { href: "/fr/national/daily-bread",   labelKey: "fx.nav.link.daily_bread" },
];

const LIEUX = { section: "lieux", labelKey: "fx.nav.link.lieux" };
const BUDGET = { section: "budget", labelKey: "fx.nav.link.budget" };
const INVEST = { section: "investissements", labelKey: "fx.nav.link.invest" };
const SUBVENTIONS = { section: "subventions", labelKey: "fx.nav.link.subventions" };
const MARCHES = { section: "marches", labelKey: "fx.nav.link.marches" };
const LOGEMENT = { section: "logement", labelKey: "fx.nav.link.logement" };
const DETTE = { section: "dette", labelKey: "fx.nav.link.dette" };

// Nav sections shown per city — the nav promotes only FINALISED sections; WIP
// pages (still reachable by URL) stay off the menu until they're ready. This is
// the honest "show less" default until the place registry drives nav (ADR-0010).
const PARIS_SECTIONS = [LIEUX, BUDGET, INVEST, SUBVENTIONS, MARCHES, LOGEMENT, DETTE];
const CITY_SECTIONS: Record<string, { section: string; labelKey: string }[]> = {
  paris: PARIS_SECTIONS,
  // Marseille v1 — only the finalised verticals. investissements / logement /
  // dette are built but still WIP, so they're kept off the nav for now.
  marseille: [LIEUX, BUDGET, SUBVENTIONS, MARCHES],
};

// The finalised section links for a city — the SINGLE source shared by the top
// nav and the footer's "Pages" column, so the two can never drift (the footer
// must not advertise a section the nav has hidden as WIP). Links point at the
// active city's routes; "Lieux" leads (materiality before percentages).
export function citySectionLinks(citySlug: string): NavLink[] {
  const sections = CITY_SECTIONS[citySlug] ?? PARIS_SECTIONS;
  return sections.map((s) => ({
    href: `/fr/city/${citySlug}/${s.section}`,
    labelKey: s.labelKey,
  }));
}

// Whether a city surfaces the (currently Paris-only) editorial Analyses.
export function cityHasAnalyses(citySlug: string): boolean {
  return citySlug === "paris";
}

// Top-nav links scoped to a city — preserves the active city slug so
// switching between sections never bounces the user back to Paris.
export function villeNavLinks(citySlug: string): NavLink[] {
  const links: NavLink[] = [
    // Home = the city's OWN landing. Paris lives at the root URL; every other
    // city has its hub at /fr/city/<slug> (Marseille's landing exists now).
    { href: citySlug === "paris" ? "/" : `/fr/city/${citySlug}`, labelKey: "fx.nav.link.home" },
    ...citySectionLinks(citySlug),
  ];
  if (cityHasAnalyses(citySlug)) links.push({ href: "/analyses", labelKey: "fx.nav.link.analyses" });
  return links;
}

// Section id → { url suffix, label key } for a national commune. Only the
// pages that actually exist nationally are listed here; the nav is then built
// from the commune's DATA-DERIVED sections (getCommuneCapabilities), so a tail
// commune never gets a Paris-shaped link that 404s.
const COMMUNE_SECTION_META: Record<string, { suffix: string; labelKey: string }> = {
  budget:          { suffix: "/budget",         labelKey: "fx.nav.link.budget" },
  comparaison:     { suffix: "/comparaison",     labelKey: "fx.natcmp.link" },
  investissements: { suffix: "/investissements", labelKey: "fx.nav.link.invest" },
  marches:         { suffix: "/marches",         labelKey: "fx.nav.link.marches" },
  evolution:       { suffix: "/evolution",       labelKey: "fx.natev.link" },
};

// A national commune's section links, built from its DATA-DERIVED sections —
// the SINGLE source shared by the top nav and the footer (mirrors how
// citySectionLinks unifies the registry cities), so the two never drift and a
// tail commune never shows a Paris-shaped link that 404s.
export function communeSectionLinks(slug: string, sections: string[]): NavLink[] {
  return sections
    .map((s) => COMMUNE_SECTION_META[s])
    .filter((m): m is { suffix: string; labelKey: string } => Boolean(m))
    .map((m) => ({ href: `/fr/city/${slug}${m.suffix}`, labelKey: m.labelKey }));
}

// Top-nav links for a national commune (Home + its real sections).
export function communeNavLinks(slug: string, sections: string[]): NavLink[] {
  return [
    { href: "/", labelKey: "fx.nav.link.home" },
    ...communeSectionLinks(slug, sections),
  ];
}

// Hrefs that should match exactly (not startsWith) for the active state.
// `/` would otherwise match every page.
export const EXACT_MATCH_HREFS = new Set<string>(["/"]);
