"use client";

import { scopeOf } from "@/lib/urls";

import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { listCities } from "@/lib/cities";

/**
 * Scope selector — switches between the Paris-rich pages (root URLs),
 * the 9 other registered cities (V2 placeholders at /fr/city/[slug]) and
 * the France macro pages (/apu, /etat, /dette, /fiscalite).
 *
 * Cities listed in EXHAUSTIVE_CITIES below have rich pages under
 * /fr/city/[slug]/{budget,marches,subventions,...} — for them we navigate
 * to the equivalent section instead of the slim /fr/city/[slug] placeholder.
 */
const EXHAUSTIVE_CITIES = new Set(["marseille"]);

// Map Paris-rich pathname → equivalent section slug used in /fr/city/[slug]/<sec>.
function sectionFromParisPath(pathname: string): string | null {
  if (pathname.startsWith("/budget")) return "budget";
  if (pathname.startsWith("/marches-publics")) return "marches";
  if (pathname.startsWith("/qui-recoit")) return "subventions";
  if (pathname.startsWith("/investissements")) return "investissements";
  if (pathname.startsWith("/logement-social")) return "logement";
  if (pathname.startsWith("/dette-patrimoine")) return "dette";
  return null;
}

// Extract section from /fr/city/[city]/[section]/... pathname.
function sectionFromVillePath(pathname: string): string | null {
  const s = scopeOf(pathname);
  return s?.country === "france" && s.place && s.section && s.section !== "simulateur-prelevements" ? s.section : null;
}

type Variant = "nav" | "h1" | "overlay";

type Props = {
  variant?: Variant;
};

export default function ScopeDropdown({ variant = "nav" }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const pathname = usePathname() ?? "/";
  const t = useT();
  const track = useTrack();

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

  const triggerClass =
    variant === "h1" ? "fx-scope fx-scope-h1" :
    variant === "overlay" ? "fx-scope fx-scope-overlay" :
    "fx-scope fx-scope-nav";

  // Determine current scope label for the trigger button
  const cities = listCities();
  const otherCities = cities.filter((c) => c.slug !== "paris");

  // National scope: any /fr/national/* page or the Daily Bread tool (national).
  const scope = scopeOf(pathname);
  const isOnFrance =
    scope?.country === "france" && (scope.place === null || scope.section === "simulateur-prelevements");
  // /france/[city] AND /france/[city]/<sub>, so the label stays right on rich
  // subpages (e.g. /france/marseille/budget).
  const cityMatch =
    scope?.country === "france" && scope.place ? cities.find((c) => c.slug === scope.place) : undefined;
  const isOnParisRich = !isOnFrance && !cityMatch;

  // Preserve user context when switching cities (if they're on /budget,
  // switching to Marseille keeps them on the budget page).
  const currentSection = isOnParisRich
    ? sectionFromParisPath(pathname)
    : cityMatch
    ? sectionFromVillePath(pathname)
    : null;

  function hrefForExhaustiveCity(slug: string): string {
    const sec = currentSection ?? "budget";
    return `/france/${slug}/${sec}`;
  }

  function hrefForParis(): string {
    const sec = currentSection;
    if (sec === "budget") return "/budget";
    if (sec === "marches") return "/marches-publics";
    if (sec === "subventions") return "/qui-recoit";
    if (sec === "investissements") return "/investissements";
    if (sec === "logement") return "/logement-social";
    if (sec === "dette") return "/dette-patrimoine";
    return "/";
  }

  const triggerLabel = isOnFrance
    ? t("fx.scope.france")
    : cityMatch
    ? cityMatch.nom
    : "Paris";

  const handleNav = (target: string) => {
    track("scope_change", { action: "navigate", target, variant });
    setOpen(false);
  };

  return (
    <span className="fx-scope-wrap" ref={wrapRef}>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => {
            track("scope_change", { action: v ? "close" : "open", variant });
            return !v;
          });
        }}
      >
        <span>{triggerLabel}</span>
        <span className="fx-scope-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fx-scope-menu" role="menu">
          {/* France (national scope) — top entry, lands on /fr/national/budget. */}
          <Link
            className={`fx-sm-item ${isOnFrance ? "fx-sm-active" : ""}`}
            href="/france/budget"
            role="menuitem"
            onClick={() => handleNav("/france/budget")}
          >
            <span>{t("fx.scope.france")}</span>
            {isOnFrance && <span className="fx-sm-check" aria-hidden="true">✓</span>}
          </Link>

          {/* Search any of the 35 000 communes */}
          <button
            type="button"
            className="fx-sm-item fx-sm-action"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("fx:open-search"));
              track("scope_change", { action: "open_search", variant });
            }}
          >
            <span>{t("fx.scope.search_all_cta")}</span>
            <span className="fx-sm-tag">35 000+</span>
          </button>

          {/* Paris (exhaustive city) ─────────────────────────────────── */}
          <Link
            className={`fx-sm-item ${isOnParisRich ? "fx-sm-active" : ""}`}
            href={hrefForParis()}
            role="menuitem"
            onClick={() => handleNav(hrefForParis())}
          >
            <span>Paris</span>
            {isOnParisRich && <span className="fx-sm-check" aria-hidden="true">✓</span>}
          </Link>

          {/* Other principal cities — Marseille is live, others are
              non-clickable placeholders flagged "à venir". */}
          {otherCities.map((c) => {
            const isActive = cityMatch?.slug === c.slug;
            const isExhaustive = EXHAUSTIVE_CITIES.has(c.slug);
            if (isExhaustive) {
              const href = hrefForExhaustiveCity(c.slug);
              return (
                <Link
                  key={c.slug}
                  className={`fx-sm-item ${isActive ? "fx-sm-active" : ""}`}
                  href={href}
                  role="menuitem"
                  onClick={() => handleNav(href)}
                >
                  <span>{c.nom}</span>
                  {isActive && <span className="fx-sm-check" aria-hidden="true">✓</span>}
                </Link>
              );
            }
            return (
              <span
                key={c.slug}
                className="fx-sm-item fx-sm-disabled"
                role="menuitem"
                aria-disabled="true"
              >
                <span>{c.nom}</span>
                <span className="fx-sm-tag">{t("fx.scope.tag.avenir")}</span>
              </span>
            );
          })}
        </div>
      )}
    </span>
  );
}
