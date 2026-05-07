"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { listCities } from "@/lib/cities";

/**
 * Scope selector — switches between the Paris-rich pages (root URLs),
 * the 9 other registered cities (V2 placeholders at /ville/[slug]) and
 * the France macro pages (/apu, /etat, /dette, /fiscalite).
 *
 * Cities listed in EXHAUSTIVE_CITIES below have full rich pages under
 * /ville/[slug]/budget, /ville/[slug]/marches, ... — for them we navigate
 * to the rich landing/budget instead of the slim /ville/[slug] placeholder.
 * Add a city here once its rich pages are live (cf. P0.3 in
 * project_marseille_v1_decisions).
 */
const EXHAUSTIVE_CITIES = new Set(["marseille"]);

// Map from a Paris-rich pathname to the equivalent section slug used in
// /ville/[slug]/<section>. If the user is on /budget and clicks Marseille,
// we want to land on /ville/marseille/budget rather than the city landing.
function sectionFromParisPath(pathname: string): string | null {
  if (pathname.startsWith("/budget")) return "budget";
  if (pathname.startsWith("/marches-publics")) return "marches";
  if (pathname.startsWith("/qui-recoit")) return "subventions";
  if (pathname.startsWith("/investissements")) return "investissements";
  if (pathname.startsWith("/logement-social")) return "logement";
  if (pathname.startsWith("/dette-patrimoine")) return "dette";
  return null;
}

// Extract the current section from a /ville/[city]/[section]/... pathname.
function sectionFromVillePath(pathname: string): string | null {
  const m = pathname.match(/^\/ville\/[^/]+\/([^/]+)/);
  return m ? m[1] : null;
}

type Variant = "nav" | "h1" | "overlay";

type Props = {
  variant?: Variant;
};

// Only the two pages currently considered "good enough to expose" in the
// user-facing scope dropdown. État / Dette / Fiscalité / Comparer still
// exist as routes but are intentionally not listed here yet.
const FRANCE_PAGES = [
  { href: "/france/budget", labelKey: "fx.scope.france.apu" },
  { href: "/france/daily-bread/paris", labelKey: "fx.scope.france.daily_bread" },
];

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

  const isOnFrance = FRANCE_PAGES.some((p) => pathname === p.href);
  // Match /ville/[city] AND /ville/[city]/<anything> so the trigger label
  // stays correct on rich subpages (e.g. /ville/marseille/budget).
  const cityMatch = pathname.startsWith("/ville/")
    ? cities.find((c) => pathname === `/ville/${c.slug}` || pathname.startsWith(`/ville/${c.slug}/`))
    : undefined;
  const isOnParisRich = !isOnFrance && !cityMatch;

  // Compute the right section to land on when switching cities — preserve
  // user context (if they're on /budget, switching to Marseille keeps them
  // on the budget page).
  const currentSection = isOnParisRich
    ? sectionFromParisPath(pathname)
    : cityMatch
    ? sectionFromVillePath(pathname)
    : null;

  function hrefForCity(slug: string): string {
    if (slug === "paris") {
      // Paris-rich pages live at the root; preserve section if possible.
      const sec = currentSection;
      if (sec === "budget") return "/budget";
      if (sec === "marches") return "/marches-publics";
      if (sec === "subventions") return "/qui-recoit";
      if (sec === "investissements") return "/investissements";
      if (sec === "logement") return "/logement-social";
      if (sec === "dette") return "/dette-patrimoine";
      return "/";
    }
    if (EXHAUSTIVE_CITIES.has(slug)) {
      // Rich city pages — preserve section if available, fallback to budget.
      const sec = currentSection ?? "budget";
      return `/ville/${slug}/${sec}`;
    }
    // Slim placeholder (V2 cities not yet exhaustive).
    return `/ville/${slug}`;
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
          {/* Paris (rich pages at root) ────────────────────────────── */}
          <div className="fx-sm-head">{t("fx.scope.heading")}</div>
          <Link
            className={`fx-sm-item ${isOnParisRich ? "fx-sm-active" : ""}`}
            href={hrefForCity("paris")}
            role="menuitem"
            onClick={() => handleNav(hrefForCity("paris"))}
          >
            <span>Paris</span>
            {isOnParisRich && <span className="fx-sm-check" aria-hidden="true">✓</span>}
          </Link>

          {/* Cross-link to global search for any of the 35 000 communes */}
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

          {/* Other registered cities (V2 placeholders + exhaustive) ─── */}
          {otherCities.map((c) => {
            const isActive = cityMatch?.slug === c.slug;
            const isExhaustive = EXHAUSTIVE_CITIES.has(c.slug);
            const href = hrefForCity(c.slug);
            return (
              <Link
                key={c.slug}
                className={`fx-sm-item ${isActive ? "fx-sm-active" : ""}`}
                href={href}
                role="menuitem"
                onClick={() => handleNav(href)}
              >
                <span>{c.nom}</span>
                {isActive ? (
                  <span className="fx-sm-check" aria-hidden="true">✓</span>
                ) : isExhaustive ? null : (
                  <span className="fx-sm-tag">{t("fx.scope.tag.v2")}</span>
                )}
              </Link>
            );
          })}

          {/* France macro pages ─────────────────────────────────────── */}
          <div className="fx-sm-sep" />
          <div className="fx-sm-head">{t("fx.scope.heading.france")}</div>
          {FRANCE_PAGES.map((p) => {
            const isActive = pathname === p.href;
            return (
              <Link
                key={p.href}
                className={`fx-sm-item ${isActive ? "fx-sm-active" : ""}`}
                href={p.href}
                role="menuitem"
                onClick={() => handleNav(p.href)}
              >
                <span>{t(p.labelKey)}</span>
                {isActive && <span className="fx-sm-check" aria-hidden="true">✓</span>}
              </Link>
            );
          })}
        </div>
      )}
    </span>
  );
}
