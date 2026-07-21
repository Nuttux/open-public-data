import type { ReactNode } from "react";

/**
 * Brand-neutral landing model. Both Paris and San Francisco (and any future
 * place) build one of these from their own data + i18n, then hand it to
 * <Landing/>. The template renders plain, already-resolved values — strings,
 * hrefs, numbers, ReactNodes — so it stays free of any city coupling, i18n
 * hooks, or data-source imports. All styling comes from the global
 * `.theme-fusion .fx-*` classes; the page just needs to render inside a
 * `theme-fusion` wrapper (the /us layout and Paris LandingClient both do).
 */

/** Background motif behind the headline. Either declarative SVG paths (masked
 *  to the lower-right corner, like Paris arrondissements / the SF peninsula)
 *  or a ready-made node for anything more elaborate. */
export type LandingHeroBg =
  | { viewBox: string; paths: string[] }
  | { node: ReactNode };

export type LandingHeroModel = {
  bg?: LandingHeroBg;
  /** The H1. A ReactNode so cities can embed <em>, <b>, a scope dropdown, etc. */
  headline: ReactNode;
};

/** One big photo hero card in the deck. `photo: null` renders the non-photo
 *  card variant (kicker/title/number/meta/cta on a plain panel). */
export type DeckCard = {
  href: string;
  /** Paris drawer intercepts use scroll={false}; SF full-page routes omit it. */
  scroll?: boolean;
  kicker: string;
  title: string;
  amount: string;
  amountUnit: string;
  meta: string;
  cta: string;
  photo: string | null;
  photoCredit: string | null;
  photoAlt?: string;
};

/** One clickable item in the scrolling ribbon. */
export type MarqueeItem = {
  href: string;
  label: string;
  amount: string;
  scroll?: boolean;
};

/** The signature scale number act (Paris €462/mo · SF $1,606/mo per resident). */
export type ScaleAct = {
  value: string; // formatted magnitude, e.g. "1,606" / "462"
  unit: string; // "$" / "€"
  /** true → unit precedes the number ($1,606); false → follows it (462 €). */
  unitLeading?: boolean;
  per: string; // "per resident, per month"
  delta: ReactNode; // the smaller line under the number
};

/** A section chip in the "explore" strip. */
export type LandingChip = {
  href: string;
  title: string;
  desc: string;
  /** Spans the full row width (the hero entry of the strip). */
  featured?: boolean;
};

export type LandingChipStrip = {
  heading: ReactNode;
  ariaLabel?: string;
  items: LandingChip[];
};

export type LandingModel = {
  hero: LandingHeroModel;
  deck?: DeckCard[];
  deckAriaLabel?: string;
  marquee?: MarqueeItem[];
  marqueeAriaLabel?: string;
  scale?: ScaleAct;
  chips?: LandingChipStrip;
  /** Escape hatch for city-specific tail acts (Paris analyses + méthode). */
  extras?: ReactNode;
};
