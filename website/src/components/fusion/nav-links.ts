export type NavLink = {
  href: string;
  labelKey: string;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/",                 labelKey: "fx.nav.link.home" },
  { href: "/ville/paris/budget",           labelKey: "fx.nav.link.budget" },
  { href: "/ville/paris/investissements",  labelKey: "fx.nav.link.invest" },
  { href: "/ville/paris/subventions",       labelKey: "fx.nav.link.subventions" },
  { href: "/ville/paris/marches",  labelKey: "fx.nav.link.marches" },
  { href: "/ville/paris/logement",  labelKey: "fx.nav.link.logement" },
  { href: "/ville/paris/dette", labelKey: "fx.nav.link.dette" },
  { href: "/analyses",         labelKey: "fx.nav.link.analyses" },
];
