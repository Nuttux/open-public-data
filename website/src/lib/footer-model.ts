/**
 * Footer model (ADR-0010 D2 spirit) — normalises the site footer into ONE shape
 * that a single presentational <SiteFooter> renders for every country.
 *
 * The top nav owns *where you are* (the current place + its sections). The footer
 * owns *what this is*, *everywhere else you can go* (cross-city), and *trust*
 * (project + legal + data credit). Only two slots vary by place: the section list
 * and the legal / data-credit block; everything else is invariant.
 *
 * Two builders feed the same model:
 *   • franceFooterModel()   — France still reads nav-links.ts (ADR-0010 D3).
 *   • registryFooterModel() — US/BR derive from the place registry (places.ts).
 */

import {
  PLACES,
  currentPlace,
  placesForCountry,
  switchTarget,
  orderedModules,
  getPlace,
  type Place,
} from "@/lib/places";
import { citySectionLinks, cityHasAnalyses } from "@/components/fusion/nav-links";

export type FooterLink = { href: string; label: string; external?: boolean };

export type FooterModel = {
  wordmark: string;
  mission: string;
  /** Cross-place rail — sibling cities, invariant across every footer. */
  cities: FooterLink[];
  /** France-only "find your city" entry (35 000+ communes). */
  findCity?: FooterLink;
  /** The one place-aware column: the current place's sections. */
  placeHeading: string;
  sections: FooterLink[];
  projectHeading: string;
  project: FooterLink[];
  legalHeading: string;
  legal: FooterLink[];
  /** Baseline strip — year already substituted, includes the data credit. */
  baseline: string;
};

/** Simple translation function shape (matches useT); caller substitutes {year}. */
type T = (key: string) => string;

const GITHUB_URL = "https://github.com/Nuttux/open-public-data";

/**
 * The cross-place rail — every city-scale place with a proper name and a live
 * switch target, in registry order (fr → us → br). Invariant: the same list
 * shows under Paris, San Francisco and Recife alike.
 */
function cityRail(): FooterLink[] {
  return PLACES.filter((p) => p.scale === "city" && p.name && switchTarget(p)).map((p) => ({
    href: switchTarget(p)!,
    label: p.name!,
  }));
}

function withYear(s: string, year: number): string {
  return s.replace("{year}", String(year));
}

// ── France ──────────────────────────────────────────────────────────────────
function footerCitySlug(pathname: string): string {
  const m = pathname.match(/^\/fr\/city\/([^/]+)/);
  return m ? m[1] : "paris";
}

export function franceFooterModel(pathname: string, t: T, year: number): FooterModel {
  const citySlug = footerCitySlug(pathname);
  const placeHeading = getPlace(citySlug)?.name ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);

  // Analyses is city editorial (it sits in the place's nav), so it belongs in
  // the place column — NOT "The project". Method stays project-level: a single
  // shared /methode ("how we work") is cheaper to maintain than per-city ones.
  const sections = citySectionLinks(citySlug).map((l) => ({ href: l.href, label: t(l.labelKey) }));
  if (cityHasAnalyses(citySlug)) sections.push({ href: "/analyses", label: t("fx.foot.link.analyses") });

  const project: FooterLink[] = [
    { href: "/methode", label: t("fx.foot.link.methode") },
    { href: GITHUB_URL, label: t("fx.foot.link.github"), external: true },
    { href: "/contact", label: t("fx.foot.link.contact") },
  ];

  const legal: FooterLink[] = [
    { href: "/accessibilite", label: t("fx.foot.legal.accessibilite") },
    { href: "/confidentialite", label: t("fx.foot.legal.confidentialite") },
    { href: "/mentions-legales", label: t("fx.foot.legal.mentions") },
    { href: "/licence", label: t("fx.foot.legal.licence") },
    { href: "/corrections", label: t("fx.foot.legal.corrections") },
    { href: "/signalement", label: t("fx.foot.legal.signaler") },
  ];
  const statusUrl = process.env.NEXT_PUBLIC_STATUS_PAGE_URL;
  if (statusUrl) legal.push({ href: statusUrl, label: t("fx.foot.legal.status"), external: true });

  return {
    wordmark: `${t("chrome.wordmark")}.`,
    mission: t("fx.foot.mission"),
    cities: cityRail(),
    findCity: { href: "/", label: t("fx.foot.find_city") },
    placeHeading,
    sections,
    projectHeading: t("fx.foot.col.project"),
    project,
    legalHeading: t("fx.foot.col.legal"),
    legal,
    baseline: withYear(t("fx.foot.license"), year),
  };
}

// ── Registry (US / BR) ───────────────────────────────────────────────────────
export function registryFooterModel(
  country: Place["country"],
  pathname: string,
  t: T,
  year: number,
): FooterModel {
  const place = currentPlace(pathname) ?? placesForCountry(country)[0];
  const placeHeading = place?.name ?? (place ? t(place.labelKey) : "");

  const sections: FooterLink[] = place
    ? orderedModules(place).map((m) => ({ href: `${place.path}/${m.slug}`, label: t(m.labelKey) }))
    : [];

  // Project column — invariant GitHub/Contact, plus a Sources link where the
  // place actually ships one (SF). No méthode/analyses under US/BR yet: those
  // pages are France-authored, so we don't advertise them as this place's.
  const project: FooterLink[] = [];
  if (place?.slug === "sf") project.push({ href: `${place.path}/sources`, label: t("fx.foot.link.sources") });
  project.push({ href: GITHUB_URL, label: t("fx.foot.link.github"), external: true });
  project.push({ href: "/contact", label: t("fx.foot.link.contact") });

  // Legal column — POC-honest minimum: the jurisdiction-neutral pages only.
  // Localised accessibility / legal-notice statements per jurisdiction are a
  // follow-up, so we don't mis-attribute the French ones here.
  const legal: FooterLink[] = [
    { href: "/licence", label: t("fx.foot.legal.licence") },
    { href: "/signalement", label: t("fx.foot.legal.signaler") },
  ];

  const creditKey = country === "us" ? "fx.foot.credit.sf" : country === "br" ? "fx.foot.credit.recife" : "fx.foot.license";

  return {
    wordmark: `${t("chrome.wordmark")}.`,
    mission: t("fx.foot.mission"),
    cities: cityRail(),
    placeHeading,
    sections,
    projectHeading: t("fx.foot.col.project"),
    project,
    legalHeading: t("fx.foot.col.legal"),
    legal,
    baseline: withYear(t(creditKey), year),
  };
}
