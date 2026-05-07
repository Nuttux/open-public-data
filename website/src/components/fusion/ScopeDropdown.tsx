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
 */

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

  // National scope: any /france/* page or the Daily Bread tool (national).
  const isOnFrance =
    pathname === "/france" ||
    pathname.startsWith("/france/") ||
    /^\/ville\/[^/]+\/daily-bread(\/|$)/.test(pathname);
  const cityMatch = pathname.startsWith("/ville/")
    ? cities.find((c) => pathname === `/ville/${c.slug}`)
    : undefined;
  const isOnParisRich = !isOnFrance && !cityMatch;

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
          {/* France (national scope) — top entry, lands on /france/budget. */}
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
            href="/"
            role="menuitem"
            onClick={() => handleNav("/")}
          >
            <span>Paris</span>
            {isOnParisRich && <span className="fx-sm-check" aria-hidden="true">✓</span>}
          </Link>

          {/* Other principal cities (V2 placeholders) ───────────────── */}
          {otherCities.map((c) => {
            const isActive = cityMatch?.slug === c.slug;
            return (
              <Link
                key={c.slug}
                className={`fx-sm-item ${isActive ? "fx-sm-active" : ""}`}
                href={`/ville/${c.slug}`}
                role="menuitem"
                onClick={() => handleNav(`/ville/${c.slug}`)}
              >
                <span>{c.nom}</span>
                {isActive ? (
                  <span className="fx-sm-check" aria-hidden="true">✓</span>
                ) : (
                  <span className="fx-sm-tag">{t("fx.scope.tag.v2")}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </span>
  );
}
