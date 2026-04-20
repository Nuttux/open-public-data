export type NavLink = {
  href: string;
  label: string;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/",                   label: "Accueil" },
  { href: "/budget",             label: "Le budget" },
  { href: "/qui-recoit",         label: "Subventions" },
  { href: "/marches-publics",    label: "Marchés publics" },
  { href: "/investissements",    label: "Investissements" },
  { href: "/logement-social",    label: "Logement social" },
  { href: "/dette-patrimoine",   label: "Dette" },
  { href: "/analyses",           label: "Analyses" },
];
