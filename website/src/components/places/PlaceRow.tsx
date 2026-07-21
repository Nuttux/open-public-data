"use client";

import { forwardRef } from "react";
import Link from "next/link";
import type { PlaceEntry, PlacesConfig } from "./types";

/**
 * One compact media-row in the side list: a small thumbnail (or a family-tinted
 * block when there's no photo), the name, a mono meta line, and the single
 * stat. Deliberately horizontal + short so a scrolling column of 90+ stays
 * clean — the opposite of the old full-width thumbnail dump.
 */
const PlaceRow = forwardRef<HTMLLIElement, {
  entry: PlaceEntry;
  config: PlacesConfig;
  color: string;
  hovered: boolean;
  onHover: (slug: string | null) => void;
}>(function PlaceRow({ entry: e, config, color, hovered, onHover }, ref) {
  const toneClass =
    e.statTone === "money" ? "fx-place-stat--money" :
    e.statTone === "accent" ? "fx-place-stat--accent" : "";
  return (
    <li ref={ref} className="fx-place-row" data-hovered={hovered ? "true" : undefined}>
      <Link
        href={config.hrefFor(e.slug)}
        scroll={false}
        className="fx-place-row-link"
        onMouseEnter={() => onHover(e.slug)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(e.slug)}
        onBlur={() => onHover(null)}
      >
        <span className="fx-place-thumb" style={{ borderColor: color }}>
          {e.photo ? (
            <img src={e.photo} alt="" loading="lazy" />
          ) : (
            <span className="fx-place-thumb-noimg" style={{ background: color }} />
          )}
        </span>
        <span className="fx-place-body">
          <span className="fx-place-name">{e.name}</span>
          <span className="fx-place-meta">
            {e.kind}
            {e.areaLabel ? ` · ${e.areaLabel}` : ""}
          </span>
          {e.stat ? <span className={`fx-place-stat tnum ${toneClass}`}>{e.stat}</span> : null}
        </span>
      </Link>
    </li>
  );
});

export default PlaceRow;
