"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { usPlaces, placeHref } from "@/lib/places";

/**
 * US scope selector — the Paris ScopeDropdown pattern (same fx-scope
 * classes) over the place registry: switches between National and the
 * cities. The nav row lists the current place's sections; changing place
 * happens here (ADR-0010 D2 — adding a place is a registry entry, and it
 * appears in this menu once it has something to link to).
 */

type Variant = "nav" | "overlay";

export default function UsScopeDropdown({ variant = "nav" }: { variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const pathname = usePathname() ?? "/us";
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

  const places = usPlaces()
    .map((p) => ({ place: p, href: placeHref(p) }))
    .filter((x): x is typeof x & { href: string } => x.href !== null);

  const current = places.find(
    ({ place }) => pathname === place.path || pathname.startsWith(`${place.path}/`),
  );

  const triggerClass =
    variant === "overlay" ? "fx-scope fx-scope-overlay" : "fx-scope fx-scope-nav";

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
        <span>{current ? t(current.place.labelKey) : "US"}</span>
        <span className="fx-scope-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fx-scope-menu" role="menu">
          {places.map(({ place, href }) => {
            const isActive = current?.place.slug === place.slug;
            return (
              <Link
                key={place.slug}
                className={`fx-sm-item ${isActive ? "fx-sm-active" : ""}`}
                href={href}
                role="menuitem"
                onClick={() => handleNav(href)}
              >
                <span>{t(place.labelKey)}</span>
                {isActive && <span className="fx-sm-check" aria-hidden="true">✓</span>}
              </Link>
            );
          })}
        </div>
      )}
    </span>
  );
}
