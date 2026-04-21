export type NavLink = {
  href: string;
  labelKey: string;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/",                 labelKey: "fx.nav.link.home" },
  { href: "/budget",           labelKey: "fx.nav.link.budget" },
  { href: "/investissements",  labelKey: "fx.nav.link.invest" },
  { href: "/qui-recoit",       labelKey: "fx.nav.link.subventions" },
  { href: "/marches-publics",  labelKey: "fx.nav.link.marches" },
  { href: "/logement-social",  labelKey: "fx.nav.link.logement" },
  { href: "/dette-patrimoine", labelKey: "fx.nav.link.dette" },
  { href: "/analyses",         labelKey: "fx.nav.link.analyses" },
];
