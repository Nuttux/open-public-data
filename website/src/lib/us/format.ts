/**
 * US-locale number & date formatters for /us/national.
 *
 * Deliberately local: the shared `@/lib/fmt` helpers are hardwired to
 * fr-FR ("1 234,56", "Md €") and must not be touched (they feed every
 * France page). US pages need en-US grouping ("1,234.56"), a leading $,
 * and T/B/M magnitude suffixes. Rounding here is display-only — raw JSON
 * values are passed in untouched.
 */

const MINUS = "−"; // typographic minus, consistent with the France pages

const nfInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const nfDec = (digits: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** $16,144 — integer dollars, en-US grouping, typographic minus. */
export function fmtUsd(n: number): string {
  const sign = n < 0 ? MINUS : "";
  return `${sign}$${nfInt.format(Math.abs(n))}`;
}

/**
 * Magnitude-suffixed dollars: $5.52T · $616.1B · $71.1M · −$12.6B.
 * Used for headline totals and KPI values.
 */
export function fmtUsdCompact(n: number): string {
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}$${nfDec(2).format(abs / 1e12)}T`;
  if (abs >= 1e9) return `${sign}$${nfDec(1).format(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}$${nfDec(1).format(abs / 1e6)}M`;
  return fmtUsd(n);
}

/**
 * Billions for ranked bar rows — one shared unit so rows stay comparable:
 * $2,196B · $75B · $6.3B (1 decimal only under $10B).
 */
export function fmtUsdBn(n: number): string {
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  const bn = abs / 1e9;
  const digits = bn >= 10 ? 0 : 1;
  return `${sign}$${nfDec(digits).format(bn)}B`;
}

/** Share of side: 0.528901 → "52.9%" · −0.022261 → "−2.2%". */
export function fmtShare(frac: number): string {
  const sign = frac < 0 ? MINUS : "";
  return `${sign}${nfDec(1).format(Math.abs(frac) * 100)}%`;
}

/** Signed year-over-year delta: 0.066209 → "+6.6%" · −0.237344 → "−23.7%". */
export function fmtYoy(frac: number): string {
  const sign = frac < 0 ? MINUS : "+";
  return `${sign}${nfDec(1).format(Math.abs(frac) * 100)}%`;
}

/** Unsigned percentage (for deltas whose arrow already carries the sign). */
export function fmtPctAbs(frac: number): string {
  return `${nfDec(1).format(Math.abs(frac) * 100)}%`;
}

/** "2026-06-30" → "June 30, 2026" (UTC so the ISO date never shifts a day). */
export function fmtDateLong(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** "2026-06-30" → "June 2026". */
export function fmtMonthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
