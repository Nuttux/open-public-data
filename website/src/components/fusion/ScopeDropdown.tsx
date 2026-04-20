"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scope selector — mocked for now. Paris is the only active scope; the
 * other cities are listed as "à venir" to communicate the multi-city
 * ambition without committing to data we don't yet publish.
 */

type Variant = "nav" | "h1" | "overlay";

type Props = {
  variant?: Variant;
};

const OTHER_CITIES = ["Marseille", "Lyon", "Bordeaux", "Toulouse"] as const;

export default function ScopeDropdown({ variant = "nav" }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

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

  return (
    <span className="fx-scope-wrap" ref={wrapRef}>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Paris</span>
        <span className="fx-scope-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fx-scope-menu" role="menu">
          <div className="fx-sm-head">Collectivité</div>
          <a className="fx-sm-item fx-sm-active" href="#" role="menuitem">
            <span>Paris</span>
            <span className="fx-sm-check" aria-hidden="true">✓</span>
          </a>
          {OTHER_CITIES.map((c) => (
            <span key={c} className="fx-sm-item fx-sm-disabled" aria-disabled="true">
              <span>{c}</span>
              <span className="fx-sm-tag">à venir</span>
            </span>
          ))}
          <div className="fx-sm-sep" />
          <span className="fx-sm-item fx-sm-disabled" aria-disabled="true">
            <span>France</span>
            <span className="fx-sm-tag">roadmap</span>
          </span>
        </div>
      )}
    </span>
  );
}
