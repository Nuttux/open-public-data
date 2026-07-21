import Link from "next/link";
import type { LandingChipStrip } from "./types";

/**
 * Explore strip — the section chips. The optional `featured` chip spans the
 * full row (the strip's hero entry, e.g. Paris "lieux" / SF "places").
 */
export default function LandingChips({ heading, ariaLabel, items }: LandingChipStrip) {
  return (
    <section className="fx-chip-strip" id="explorer-aussi" aria-label={ariaLabel}>
      <div className="fx-wrap">
        <h2 className="fx-chip-strip-h2">{heading}</h2>
        <ul className="fx-chip-strip-list">
          {items.map((c) => (
            <li key={c.href} className={c.featured ? "fx-chip-strip-li-featured" : undefined}>
              <Link href={c.href}>
                <span className="fx-chip-strip-title">{c.title}</span>
                <span className="fx-chip-strip-desc">{c.desc}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
