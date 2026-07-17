"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import UsScopeDropdown from "./UsScopeDropdown";
import { usPlaces, type Place } from "@/lib/places";

/**
 * Shared chrome for every /us route — the Paris Navbar structure over the
 * place registry (ADR-0010 D2): inside a place, the nav row lists that
 * place's SECTIONS (its registry modules); switching place lives in the
 * scope dropdown on the right; mobile gets the same burger + full-screen
 * overlay as France. EN-only copy through us.* keys; no LangSwitcher (the
 * FR/EN toggle is inert on US routes, ADR-0010 D3).
 */

function placeForPath(pathname: string): Place | undefined {
  return usPlaces().find(
    (p) => pathname === p.path || pathname.startsWith(`${p.path}/`),
  );
}

// Section links for the current place — a place with no modules (US
// national is a single page) gets an empty row: the brand is its home.
function navLinksForPath(pathname: string): { href: string; labelKey: string }[] {
  const place = placeForPath(pathname);
  if (!place) return [];
  return place.modules.map((m) => ({
    href: `${place.path}/${m.slug}`,
    labelKey: m.labelKey,
  }));
}

export default function UsChrome() {
  const pathname = usePathname() ?? "/us";
  const navLinks = navLinksForPath(pathname);
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

  const isActive = (href: string) => pathname.startsWith(href);

  const trackNav = (href: string, labelKey: string, surface: "nav" | "overlay" | "brand") => {
    track("nav_click", { href, label: labelKey, surface, from: pathname });
  };

  return (
    <>
      <header className="fx-nav">
        <Link
          href="/us/national"
          className="fx-brand"
          onClick={() => trackNav("/us/national", "us.chrome.wordmark", "brand")}
        >
          <span>{t("us.chrome.wordmark")}</span>
        </Link>
        <nav className="fx-links" aria-label={t("us.chrome.nav_aria")}>
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
        <UsScopeDropdown variant="nav" />
        <button
          type="button"
          className="fx-menu-btn"
          aria-label={t("us.chrome.menu_aria")}
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
            <span>{t("us.chrome.wordmark")}</span>
          </div>
          <button
            type="button"
            className="fx-overlay-close"
            aria-label={t("us.chrome.close")}
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
        <nav className="fx-overlay-nav" aria-label={t("us.chrome.nav_aria")}>
          {navLinks.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => trackNav(l.href, l.labelKey, "overlay")}
            >
              <span className="fx-overlay-n">{String(i + 1).padStart(2, "0")}</span>
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="fx-overlay-foot">
          <div className="fx-overlay-foot-left">
            <UsScopeDropdown variant="overlay" />
          </div>
        </div>
      </div>
    </>
  );
}
