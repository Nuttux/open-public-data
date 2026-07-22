"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/localeContext";
import { placesForCountry, type Place } from "@/lib/places";

/**
 * ONE registry-driven chrome for any country (ADR-0010 D2). Renders the shared
 * fx-nav / fx-brand / fx-links / fx-overlay markup, derives the nav from the
 * place registry (`placesForCountry(country)`), and reads `${country}.chrome.*`
 * i18n keys. The right-hand control (scope dropdown, language toggle…) is a
 * `trailing` slot. Collapses the former per-country RecifeChrome/UsChrome:
 *   <RegistryChrome country="br" trailing={<LangToggle/>} />
 *   <RegistryChrome country="us" trailing={<UsScopeDropdown/>} />
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
  const pathname = usePathname() ?? places[0]?.path ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  const place =
    places.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`)) ?? places[0];
  const navLinks = place
    ? place.modules.map((m) => ({ href: `${place.path}/${m.slug}`, labelKey: m.labelKey }))
    : [];
  const brandHref = place?.path ?? "/";
  const wordmark = `${country}.chrome.wordmark`;

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("no-scroll");
      return () => document.body.classList.remove("no-scroll");
    }
  }, [menuOpen]);
  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      <header className="fx-nav">
        <Link href={brandHref} className="fx-brand">
          <span>{t(wordmark)}</span>
        </Link>
        <nav className="fx-links" aria-label={t(`${country}.chrome.nav_aria`)}>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? "fx-link fx-link-on" : "fx-link"}>
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        {trailing}
        <button
          type="button"
          className="fx-menu-btn"
          aria-label={t(`${country}.chrome.menu_aria`)}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="4" y1="8" x2="20" y2="8" />
            <line x1="4" y1="16" x2="20" y2="16" />
          </svg>
        </button>
      </header>

      <div className={menuOpen ? "fx-overlay fx-overlay-open" : "fx-overlay"} aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="fx-overlay-top">
          <div className="fx-overlay-brand"><span>{t(wordmark)}</span></div>
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
          {navLinks.map((l, i) => (
            <Link key={l.href} href={l.href}>
              <span className="fx-overlay-n">{String(i + 1).padStart(2, "0")}</span>
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        {trailing && <div className="fx-overlay-foot"><div className="fx-overlay-foot-left">{trailing}</div></div>}
      </div>
    </>
  );
}
