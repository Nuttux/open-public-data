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

const VILLE_SECTIONS: { section: string; labelKey: string }[] = [
  { section: "budget",          labelKey: "fx.nav.link.budget" },
  { section: "investissements", labelKey: "fx.nav.link.invest" },
  { section: "subventions",     labelKey: "fx.nav.link.subventions" },
  { section: "marches",         labelKey: "fx.nav.link.marches" },
  { section: "logement",        labelKey: "fx.nav.link.logement" },
  { section: "dette",           labelKey: "fx.nav.link.dette" },
];

// Top-nav links scoped to a city — preserves the active city slug so
// switching between sections never bounces the user back to Paris.
export function villeNavLinks(citySlug: string): NavLink[] {
  return [
    { href: "/", labelKey: "fx.nav.link.home" },
    ...VILLE_SECTIONS.map((s) => ({
      href: `/fr/city/${citySlug}/${s.section}`,
      labelKey: s.labelKey,
    })),
    { href: "/analyses", labelKey: "fx.nav.link.analyses" },
  ];
}

// Hrefs that should match exactly (not startsWith) for the active state.
// `/` would otherwise match every page.
export const EXACT_MATCH_HREFS = new Set<string>(["/"]);
