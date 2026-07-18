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

// Sections qui n'existent pas pour toutes les villes. En attendant le registre
// de places (ADR-0010 / PLAN 0.1) qui portera les modules activés par ville, on
// liste ici : un lien inconditionnel enverrait Marseille sur un 404.
const SECTIONS_PAR_VILLE: Record<string, { section: string; labelKey: string }[]> = {
  paris: [{ section: "lieux", labelKey: "fx.nav.link.lieux" }],
};

// Top-nav links scoped to a city — preserves the active city slug so
// switching between sections never bounces the user back to Paris.
export function villeNavLinks(citySlug: string): NavLink[] {
  return [
    { href: "/", labelKey: "fx.nav.link.home" },
    // Les sections propres à la ville passent EN TÊTE : « Lieux » est l'entrée
    // concrète (des lieux qu'on connaît) vers des données autrement abstraites —
    // la matérialité avant les pourcentages. Reléguée en fin de nav, elle était
    // invisible alors que c'est le meilleur point d'entrée du site.
    ...[...(SECTIONS_PAR_VILLE[citySlug] ?? []), ...VILLE_SECTIONS].map((s) => ({
      href: `/fr/city/${citySlug}/${s.section}`,
      labelKey: s.labelKey,
    })),
    { href: "/analyses", labelKey: "fx.nav.link.analyses" },
  ];
}

// Hrefs that should match exactly (not startsWith) for the active state.
// `/` would otherwise match every page.
export const EXACT_MATCH_HREFS = new Set<string>(["/"]);
