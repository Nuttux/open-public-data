"use client";

import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useT, useTRaw } from "@/lib/localeContext";
import { placesForCountry, orderedModules, type Place } from "@/lib/places";
import { useDrawerOpen } from "@/lib/drawerState";
import BrandMark from "./fusion/BrandMark";
import PlaceSwitcher from "./PlaceSwitcher";
import { SITE_NAV_LINKS } from "./fusion/nav-links";

/**
 * ONE registry-driven chrome for any country outside France (ADR-0010 D2),
 * on the site bar the French pages got on 2026-09-16 and 17 : the mark leads
 * home ; the site's three entries (Paris, explainers, town halls) ; the place
 * switcher and, for Recife, the language toggle at the right ; under the bar,
 * the place's sections as tabs, its name in bold leading to its hub. No
 * « Find a town » here : the search knows French communes only. The phone
 * folds to the mark and « Menu » ; the menu carries the site entries, then
 * the place's home and sections.
 *   <RegistryChrome country="br" trailing={<LangToggle/>} />
 *   <RegistryChrome country="us" />
 */
export default function RegistryChrome({
  country,
  trailing,
}: {
  country: Place["country"];
  trailing?: ReactNode;
}) {
  const places = placesForCountry(country);
  const t = useT();
  // The site entries name Paris itself : the raw string, never rewritten.
  const tRaw = useTRaw();
  const pathname = usePathname() ?? places[0]?.path ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  // A path outside every registered place (a município page) gets the site
  // bar alone : no borrowed tabs row.
  const place = places.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`));
  const placeName = place ? (place.name ?? t(place.labelKey)) : null;
  const placeHome = place?.path ?? "/";
  const placeLinks = place
    ? orderedModules(place).map((m) => ({ href: `${place.path}/${m.slug}`, labelKey: m.labelKey }))
    : [];

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("no-scroll");
      return () => document.body.classList.remove("no-scroll");
    }
  }, [menuOpen]);
  useEffect(() => setMenuOpen(false), [pathname]);

  const drawerOpen = useDrawerOpen();
  // A drawer is a modal over the current page — don't light up whatever
  // section the entity URL falls under.
  const isActive = (href: string) => !drawerOpen && pathname.startsWith(href);

  return (
    <>
      <header className="fx-nav">
        <div className="fx-brand">
          <Link href="/" className="fx-brand-home">
            <BrandMark />
            <span>{t("chrome.wordmark")}</span>
          </Link>
        </div>
        <nav className="fx-links" aria-label={t(`${country}.chrome.nav_aria`)}>
          {SITE_NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="fx-link">
              {tRaw(l.labelKey)}
            </Link>
          ))}
        </nav>
        <PlaceSwitcher variant="nav" />
        {trailing}
        <button
          type="button"
          className="fx-menu-btn"
          aria-label={t("fx.nav.menu_aria")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="4" y1="8" x2="20" y2="8" />
            <line x1="4" y1="16" x2="20" y2="16" />
          </svg>
          <span className="fx-menu-btn-l">{t("fx.nav.menu_aria")}</span>
        </button>
      </header>
      {/* The place's own row : its sections as tabs, its name leading to its hub. Desktop only. */}
      {place && placeLinks.length > 0 ? (
        <nav className="fx-subnav" aria-label={placeName ?? t("fx.nav.place_aria")}>
          <Link href={placeHome} className="fx-subnav-place">{placeName}</Link>
          {placeLinks.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? "fx-sublink fx-sublink-on" : "fx-sublink"}>
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className={menuOpen ? "fx-overlay fx-overlay-open" : "fx-overlay"} aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="fx-overlay-top">
          <div className="fx-overlay-brand"><BrandMark /><span>{t("chrome.wordmark")}</span></div>
          <button
            type="button"
            className="fx-overlay-close"
            aria-label={t(`${country}.chrome.close`)}
            onClick={() => setMenuOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="fx-overlay-nav" aria-label={t(`${country}.chrome.nav_aria`)}>
          {SITE_NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {tRaw(l.labelKey)}
            </Link>
          ))}
          {place && placeLinks.length > 0 ? (
            <>
              <span className="fx-overlay-scope-tag">{placeName}</span>
              {place.hub ? (
                <Link href={placeHome} className={pathname === placeHome ? "fx-overlay-place fx-overlay-on" : "fx-overlay-place"}>
                  {t("chrome.home")}
                </Link>
              ) : null}
              {placeLinks.map((l) => (
                <Link key={l.href} href={l.href} className={isActive(l.href) ? "fx-overlay-place fx-overlay-on" : "fx-overlay-place"}>
                  {t(l.labelKey)}
                </Link>
              ))}
            </>
          ) : null}
        </nav>
        <div className="fx-overlay-foot">
          <div className="fx-overlay-foot-left">
            <PlaceSwitcher variant="overlay" />
            {trailing}
          </div>
        </div>
      </div>
    </>
  );
}
