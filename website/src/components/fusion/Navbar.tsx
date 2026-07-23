"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import PlaceSwitcher from "../PlaceSwitcher";
import PocBanner from "../PocBanner";
import LangSwitcher from "./LangSwitcher";
import {
  NATIONAL_NAV_LINKS,
  villeNavLinks,
  communeNavLinks,
  EXACT_MATCH_HREFS,
} from "./nav-links";
import { useCommuneNav, type CommuneNav } from "@/components/CommuneNavContext";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { getPlace } from "@/lib/places";
import { useDrawerOpen } from "@/lib/drawerState";

// France scope is on any /fr/national/* page, /comparer, or the Daily Bread tool.
function isFranceScope(pathname: string): boolean {
  return (
    pathname === "/fr/national" ||
    pathname.startsWith("/fr/national/") ||
    pathname === "/comparer" ||
    pathname.startsWith("/comparer/") ||
    /^\/fr\/city\/[^/]+\/daily-bread(\/|$)/.test(pathname)
  );
}

// Pick the right top-nav link set based on the current pathname.
// National scope → France links; commune scope → data-derived sections (a
// national tail commune from context); ville scope → /fr/city/[slug]/*.
function navLinksForPath(pathname: string, commune: CommuneNav | null) {
  if (isFranceScope(pathname)) return NATIONAL_NAV_LINKS;
  if (commune) return communeNavLinks(commune.slug, commune.sections);
  const m = pathname.match(/^\/fr\/city\/([^/]+)/);
  return villeNavLinks(m ? m[1] : "paris");
}

// The registry slug of the current France scope, for the unified switcher and
// the POC banner. France's routing is irregular (Paris = root URLs + homepage),
// so we resolve it here rather than by registry path matching.
function currentFrSlug(pathname: string): string {
  if (isFranceScope(pathname)) return "fr-national";
  const m = pathname.match(/^\/fr\/city\/([^/]+)/);
  return m ? m[1] : "paris";
}

export default function Navbar() {
  const pathname = usePathname() ?? "/";
  const commune = useCommuneNav();
  const navLinks = navLinksForPath(pathname, commune);
  const frSlug = currentFrSlug(pathname);
  const frPlace = getPlace(frSlug);
  // Show the generic POC banner on registry POC places AND on national tail
  // communes (not in the registry — surfaced via commune context). ownWipBanner
  // still suppresses it where a place renders its own strip.
  const showPoc =
    ((frPlace?.poc ?? false) && !frPlace?.ownWipBanner) || Boolean(commune);
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
    return EXACT_MATCH_HREFS.has(href) || /^\/fr\/city\/[^/]+$/.test(href)
      ? pathname === href
      : pathname.startsWith(href);
  };

  const trackNav = (href: string, labelKey: string, surface: "nav" | "overlay" | "brand") => {
    track("nav_click", { href, label: labelKey, surface, from: pathname });
  };

  return (
    <>
      {showPoc && <PocBanner />}
      <header className="fx-nav">
        <Link
          href="/"
          className="fx-brand"
          onClick={() => trackNav("/", "fx.nav.brand", "brand")}
        >
          <BrandMark />
          <span>{t("fx.nav.brand")}</span>
        </Link>
        <nav className="fx-links" aria-label={t("fx.nav.main_aria")}>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(l.href) ? "fx-link fx-link-on" : "fx-link"}
              onClick={() => trackNav(l.href, l.labelKey, "nav")}
            >
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        <PlaceSwitcher variant="nav" currentSlug={frSlug} />
        <LangSwitcher />
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
        </button>
      </header>

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
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => trackNav(l.href, l.labelKey, "overlay")}
            >
              {t(l.labelKey)}
            </Link>
          ))}
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
