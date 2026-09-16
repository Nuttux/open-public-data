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
  villeNavLinks,
  communeNavLinks,
  EXACT_MATCH_HREFS,
} from "./nav-links";
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

// Pick the right top-nav link set based on the current pathname.
// National scope → France links; commune scope → data-derived sections (a
// national tail commune from context); ville scope → /fr/city/[slug]/*.
function navLinksForPath(pathname: string, commune: CommuneNav | null) {
  if (isFranceScope(pathname)) return NATIONAL_NAV_LINKS;
  if (commune) {
    // Sur la page ville elle-même, la barre de puces collante EST la navigation
    // des sections : la répéter en haut donnait deux menus pour les mêmes
    // ancres, avec des mots différents ("Investissement" contre "Ce qu'elle
    // construit"). Sur les sous-pages (explorateur, fiche fournisseur) les
    // liens de section restent utiles pour revenir.
    if (pathname === `/france/${commune.slug}`) return [];
    return communeNavLinks(commune.slug, commune.sections);
  }
  return villeNavLinks(frPlace(pathname) ?? "paris");
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
  const navLinks = navLinksForPath(scope, commune);
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

  const trackNav = (href: string, labelKey: string, surface: "nav" | "overlay" | "brand") => {
    track("nav_click", { href, label: labelKey, surface, from: pathname });
  };

  return (
    <>
      <header className="fx-nav">
        <Link
          href={commune ? `/france/${commune.slug}` : "/"}
          className="fx-brand"
          onClick={() => trackNav(commune ? `/france/${commune.slug}` : "/", "fx.nav.brand", "brand")}
        >
          <BrandMark />
          <span>{t("fx.nav.brand")}</span>
          {/* On the phone the switcher at the right is hidden: the commune's name
              stays in the bar while the reader scrolls (2026-09-16). */}
          {commune ? <span className="fx-brand-city">{commune.nom}</span> : null}
        </Link>
        {/* La page ville n'a pas de liens de section en haut (la barre de puces
            les porte) : on garde la cellule de la grille, mais pas un repère de
            navigation annoncé et vide. */}
        {navLinks.length === 0 ? <div className="fx-links" aria-hidden="true" /> : (
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
        )}
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
        {navLinks.length > 0 ? (
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
        ) : null}
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
