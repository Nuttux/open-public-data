"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarqueeItem } from "./types";

/**
 * Scrolling ribbon of curated, clickable entities. Items arrive already
 * resolved (label + amount as plain strings) — the adapter handles locale and
 * curation. The list is doubled for a seamless -50% loop, and the animation
 * starts at a random offset so the same item isn't always first.
 */
export default function LandingMarquee({
  items,
  ariaLabel,
}: {
  items: MarqueeItem[];
  ariaLabel?: string;
}) {
  const doubled = [...items, ...items];

  // Applied post-mount to avoid a server/client hydration mismatch.
  const [delaySec, setDelaySec] = useState<number | null>(null);
  useEffect(() => {
    setDelaySec(-Math.random() * 65);
  }, []);

  return (
    <section className="fx-marquee" aria-label={ariaLabel}>
      <div
        className="fx-marquee-track"
        style={delaySec !== null ? { animationDelay: `${delaySec}s` } : undefined}
      >
        {doubled.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="fx-marquee-item"
            scroll={item.scroll ?? true}
            aria-hidden={i >= items.length ? "true" : undefined}
            tabIndex={i >= items.length ? -1 : undefined}
          >
            <span className="fx-marquee-label">{item.label}</span>
            <span className="fx-marquee-amount">{item.amount}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
