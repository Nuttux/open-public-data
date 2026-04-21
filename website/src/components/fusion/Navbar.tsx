"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import ScopeDropdown from "./ScopeDropdown";
import LangSwitcher from "./LangSwitcher";
import { NAV_LINKS } from "./nav-links";
import { useT } from "@/lib/localeContext";

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("no-scroll");
      return () => document.body.classList.remove("no-scroll");
    }
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="fx-nav">
        <Link href="/" className="fx-brand">
          <BrandMark />
          <span>{t("fx.nav.brand")}</span>
        </Link>
        <nav className="fx-links" aria-label={t("fx.nav.main_aria")}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(l.href) ? "fx-link fx-link-on" : "fx-link"}
            >
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        <ScopeDropdown variant="nav" />
        <LangSwitcher />
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
        </button>
      </header>

      <div className={menuOpen ? "fx-overlay fx-overlay-open" : "fx-overlay"} aria-hidden={!menuOpen}>
        <div className="fx-overlay-top">
          <div className="fx-overlay-brand">
            <BrandMark />
            <span>{t("fx.nav.brand")}</span>
          </div>
          <button
            type="button"
            className="fx-overlay-close"
            aria-label={t("fx.nav.close")}
            onClick={() => setMenuOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="fx-overlay-nav" aria-label={t("fx.nav.main_aria")}>
          {NAV_LINKS.map((l, i) => (
            <Link key={l.href} href={l.href}>
              <span className="fx-overlay-n">{String(i + 1).padStart(2, "0")}</span>
              {t(l.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="fx-overlay-foot">
          <div className="fx-overlay-foot-left">
            <ScopeDropdown variant="overlay" />
            <LangSwitcher />
          </div>
          <Link href="/budget" className="fx-overlay-cta">
            {t("fx.nav.cta_budget").replace("{year}", String(new Date().getFullYear()))}
          </Link>
        </div>
      </div>
    </>
  );
}
