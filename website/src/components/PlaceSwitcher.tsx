"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useCommuneNav } from "@/components/CommuneNavContext";
import {
  placesByCountry,
  currentPlace,
  switchTarget,
  COUNTRY_FLAG,
  type Place,
} from "@/lib/places";

/**
 * Unified place switcher — one control for every country and city (ADR-0010).
 * Reads the place registry, grouped by country, and navigates to each place's
 * live URL (`switchTarget`). Only registered places appear, so undeveloped
 * cities are dropped automatically. Reuses the shared fx-scope / fx-sm-* markup
 * so it renders identically on any chrome; `variant` matches the ScopeDropdown
 * (nav | overlay). Labels use the place's proper-noun `name` when set, else its
 * i18n `labelKey`; flagship places show no tag, POC places get the "PoC" tag.
 *
 * `currentSlug` lets the caller name the active place — France's routing is
 * irregular (Paris lives at root URLs and the homepage), so the France chrome
 * computes it; US/BR fall back to registry path matching. `variant` picks the
 * trigger style: the nav pill, the mobile-overlay row, or the big `h1` dropdown
 * embedded in a landing headline (Paris/SF heroes).
 *
 * The "find my city" action (France's 35 000-commune search) always sits under
 * the 🇫🇷 France header, wherever you open the switcher from.
 */
export default function PlaceSwitcher({
  variant = "nav",
  currentSlug,
}: {
  variant?: "nav" | "overlay" | "h1";
  currentSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const pathname = usePathname() ?? "/";
  const t = useT();
  // National tail commune (not in the place registry) — name it in the switcher
  // instead of the generic "Explorer" fallback.
  const commune = useCommuneNav();

  // "Find my city" opens France's search modal on French pages; from US/BR it
  // sends you to the French home where that search lives.
  const openCommuneSearch = () => {
    setOpen(false);
    if (pathname.startsWith("/us") || pathname.startsWith("/br")) {
      window.location.href = "/";
    } else {
      window.dispatchEvent(new CustomEvent("fx:open-search"));
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  const groups = placesByCountry();
  const activeSlug = currentSlug ?? currentPlace(pathname)?.slug;
  const active = activeSlug
    ? groups.flatMap((g) => g.places).find((p) => p.slug === activeSlug)
    : undefined;
  const label = (p: Place) => p.name ?? t(p.labelKey);
  const triggerLabel = active
    ? label(active)
    : commune
    ? commune.nom
    : t("chrome.switch.label");

  const triggerClass =
    variant === "h1" ? "fx-scope fx-scope-h1" :
    variant === "overlay" ? "fx-scope fx-scope-overlay" :
    "fx-scope fx-scope-nav";

  return (
    <span className="fx-scope-wrap" ref={wrapRef}>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("chrome.switch.aria")}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{triggerLabel}</span>
        <span className="fx-scope-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fx-scope-menu" role="menu">
          {groups.map((g, gi) => (
            <div key={g.country}>
              {gi > 0 && <div className="fx-sm-sep" aria-hidden="true" />}
              <div className="fx-sm-head">
                <span aria-hidden="true">{COUNTRY_FLAG[g.country]}</span>{" "}
                {t(`chrome.country.${g.country}`)}
              </div>
              {g.country === "fr" && (
                <button
                  type="button"
                  className="fx-sm-item fx-sm-action"
                  onClick={openCommuneSearch}
                >
                  <span>{t("fx.scope.search_all_cta")}</span>
                  <span className="fx-sm-tags">
                    <span className="fx-sm-tag">35 000+</span>
                    <span className="fx-sm-tag">{t("chrome.switch.poc_tag")}</span>
                  </span>
                </button>
              )}
              {g.places.map((p) => {
                const href = switchTarget(p)!;
                const isActive = activeSlug === p.slug;
                return (
                  <Link
                    key={p.slug}
                    className={`fx-sm-item ${isActive ? "fx-sm-active" : ""}`}
                    href={href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span>{label(p)}</span>
                    {isActive ? (
                      <span className="fx-sm-check" aria-hidden="true">✓</span>
                    ) : p.poc ? (
                      <span className="fx-sm-tag">{t("chrome.switch.poc_tag")}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
