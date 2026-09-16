"use client";

import { scopeOf } from "@/lib/urls";

import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import PlaceSwitcher from "../PlaceSwitcher";
import LangSwitcher from "./LangSwitcher";
import {
  NATIONAL_NAV_LINKS,
  SITE_NAV_LINKS,
  citySectionLinks,
  communeSectionLinks,
  cityHasAnalyses,
  EXACT_MATCH_HREFS,
  type NavLink,
} from "./nav-links";
import { getPlace } from "@/lib/places";
import { useCommuneNav, type CommuneNav } from "@/components/CommuneNavContext";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { useDrawerOpen } from "@/lib/drawerState";

// France scope is on France's national pages (/france, /france/dette,
// /france/comparer…) or the Daily Bread tool under a city.
function isFranceScope(pathname: string): boolean {
  const s = scopeOf(pathname);
  return s?.country === "france" && (s.place === null || s.section === "daily-bread");
}

/** The French city or commune a path is about, if any. */
function frPlace(pathname: string): string | null {
  const s = scopeOf(pathname);
  return s?.country === "france" ? s.place : null;
}

// The place's own sections, for the row under the bar (desktop) and the menu
// (phone). Empty on the commune page itself — its sticky chips are that row —
// and on the site pages (explainers, method, contact), which belong to no place.
function placeLinksForPath(pathname: string, commune: CommuneNav | null): NavLink[] {
  if (isFranceScope(pathname)) return NATIONAL_NAV_LINKS.filter((l) => l.href !== "/");
  if (commune) {
    if (pathname === `/france/${commune.slug}`) return [];
    return communeSectionLinks(commune.slug, commune.sections);
  }
  if (pathname === "/") return citySectionLinks("paris");
  const place = frPlace(pathname);
  return place ? citySectionLinks(place) : [];
}

// The name the menu gives the place row: the commune, the registry city, France.
function placeNameForPath(pathname: string, commune: CommuneNav | null, france: string): string | null {
  if (isFranceScope(pathname)) return france;
  if (commune) return commune.nom;
  const place = pathname === "/" ? "paris" : frPlace(pathname);
  return place ? (getPlace(place)?.name ?? place) : null;
}

// The registry slug of the current France scope, for the unified switcher.
// France's routing is irregular (Paris = root URLs + homepage),
// so we resolve it here rather than by registry path matching.
function currentFrSlug(pathname: string): string {
  if (isFranceScope(pathname)) return "fr-national";
  return frPlace(pathname) ?? "paris";
}

/**
 * `scopePath` : pour une page qui n'appartient à aucun lieu, la barre choisit
 * ses liens et son lieu courant d'après ce chemin plutôt que d'après l'adresse.
 * Le choix entre communes homonymes vit sous /fr/city/<nom> sans être une
 * ville : lue depuis l'adresse, la barre y proposait sept sections
 * /fr/city/<nom>/… qui n'existent pas. L'adresse réelle reste la référence du
 * lien actif et de la mesure d'audience.
 */
export default function Navbar({ scopePath }: { scopePath?: string } = {}) {
  const pathname = usePathname() ?? "/";
  const commune = useCommuneNav();
  const scope = scopePath ?? pathname;
  const siteLinks = SITE_NAV_LINKS.filter((l) => l.href !== "/analyses" || cityHasAnalyses("paris"));
  const placeLinks = placeLinksForPath(scope, commune);
  const placeName = placeNameForPath(scope, commune, "France");
  const frSlug = currentFrSlug(scope);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useT();
  const track = useTrack();

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("no-scroll");
      return () => document.body.classList.remove("no-scroll");
    }
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const drawerOpen = useDrawerOpen();
  const isActive = (href: string) => {
    // A drawer is a modal over the current page — don't light up whatever
    // section the entity URL falls under (e.g. a grant fiche opened from Home).
    if (drawerOpen) return false;
    // Bare city-landing hrefs (/fr/city/<slug>) match exactly too, so "Accueil"
    // isn't highlighted on every sub-page of the city.
    return EXACT_MATCH_HREFS.has(href) || /^\/france\/[^/]+$/.test(href)
      ? pathname === href
      : pathname.startsWith(href);
  };

  const trackNav = (href: string, labelKey: string, surface: "nav" | "overlay" | "brand" | "subnav") => {
    track("nav_click", { href, label: labelKey, surface, from: pathname });
  };
  // « Paris » is lit on every Paris page and on the home (Paris's showcase);
  // the other site entries light on their own tree; a drawer lights nothing.
  const siteActive = (href: string) => {
    if (drawerOpen) return false;
    if (href === "/france/paris") return pathname === "/" || frPlace(pathname) === "paris";
    return pathname.startsWith(href);
  };
  const openSearch = (surface: "nav" | "overlay") => {
    trackNav("#commune", "fx.nav.link.commune", surface);
    setMenuOpen(false);
    window.dispatchEvent(new CustomEvent("fx:open-search"));
  };
  const searchIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.5" y2="16.5" />
    </svg>
  );

  return (
    <>
      <header className="fx-nav">
        {/* The mark always leads home: on a commune page it used to link to the
            commune itself, and nobody left the page (2026-09-16). On the phone the
            switcher at the right is hidden, so the commune's name sits next to the
            mark and stays the link to its own page while the reader scrolls. */}
        <div className="fx-brand">
          <Link href="/" className="fx-brand-home" onClick={() => trackNav("/", "fx.nav.brand", "brand")}>
            <BrandMark />
            <span>{t("fx.nav.brand")}</span>
          </Link>
          {commune ? <Link href={`/france/${commune.slug}`} className="fx-brand-city" onClick={() => trackNav(`/france/${commune.slug}`, "fx.nav.brand_city", "brand")}>{commune.nom}</Link> : null}
        </div>
        {/* The site bar (2026-09-16): the same four entries everywhere, so a reader
            who lands mid-site sees in one glance that there are other communes,
            Paris in depth, explainers, a page for towns. */}
        <nav className="fx-links" aria-label={t("fx.nav.main_aria")}>
          <button type="button" className="fx-link fx-link-search" onClick={() => openSearch("nav")}>
            {searchIcon}
            <span>{t("fx.nav.link.commune")}</span>
          </button>
          {siteLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={siteActive(l.href) ? "fx-link fx-link-on" : "fx-link"}
              onClick={() => trackNav(l.href, l.labelKey, "nav")}
            >
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        <PlaceSwitcher variant="nav" currentSlug={frSlug} />
        <LangSwitcher />
        {/* On the phone the bar folds to the mark and the menu; the search stays
            one tap away, and the menu button says its name (2026-09-16). */}
        <button type="button" className="fx-nav-search" aria-label={t("fx.nav.link.commune")} onClick={() => openSearch("nav")}>
          {searchIcon}
        </button>
        <button
          type="button"
          className="fx-menu-btn"
          aria-label={t("fx.nav.menu_aria")}
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen(true);
            track("mobile_menu_toggle", { open: true });
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="4" y1="8" x2="20" y2="8" />
            <line x1="4" y1="16" x2="20" y2="16" />
          </svg>
          <span className="fx-menu-btn-l">{t("fx.nav.menu_aria")}</span>
        </button>
      </header>
      {/* The place's own row: Paris's seven sections, a commune sub-page's anchors,
          France's national pages. Desktop only — the phone menu carries it. */}
      {placeLinks.length > 0 ? (
        <nav className="fx-subnav" aria-label={placeName ?? t("fx.nav.place_aria")}>
          {placeName ? <span className="fx-subnav-tag" aria-hidden="true">{placeName}</span> : null}
          {placeLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(l.href) ? "fx-sublink fx-sublink-on" : "fx-sublink"}
              onClick={() => trackNav(l.href, l.labelKey, "subnav")}
            >
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className={menuOpen ? "fx-overlay fx-overlay-open" : "fx-overlay"} aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="fx-overlay-top">
          <div className="fx-overlay-brand">
            <BrandMark />
            <span>{t("fx.nav.brand")}</span>
          </div>
          <button
            type="button"
            className="fx-overlay-close"
            aria-label={t("fx.nav.close")}
            onClick={() => {
              setMenuOpen(false);
              track("mobile_menu_toggle", { open: false });
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="fx-overlay-nav" aria-label={t("fx.nav.main_aria")}>
          <button type="button" className="fx-overlay-scope-search" onClick={() => openSearch("overlay")}>
            {searchIcon}
            <span>{t("fx.nav.link.commune")}</span>
          </button>
          {siteLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={siteActive(l.href) ? "fx-overlay-on" : undefined}
              onClick={() => trackNav(l.href, l.labelKey, "overlay")}
            >
              {t(l.labelKey)}
            </Link>
          ))}
          {placeLinks.length > 0 ? (
            <>
              <span className="fx-overlay-scope-tag">{placeName}</span>
              {placeLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={isActive(l.href) ? "fx-overlay-place fx-overlay-on" : "fx-overlay-place"}
                  onClick={() => trackNav(l.href, l.labelKey, "overlay")}
                >
                  {t(l.labelKey)}
                </Link>
              ))}
            </>
          ) : null}
        </nav>
        <div className="fx-overlay-foot">
          <div className="fx-overlay-foot-left">
            <PlaceSwitcher variant="overlay" currentSlug={frSlug} />
            <LangSwitcher />
          </div>
        </div>
      </div>
    </>
  );
}
