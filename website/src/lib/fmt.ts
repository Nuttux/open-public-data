/**
 * Number formatters used by both server & client components. Kept in their
 * own module (no fs/path imports) so client components can safely import them
 * without pulling the server loaders from `fusion-data.ts` into the bundle.
 */

/** "5 495" — French-locale integer. */
export const fmtInt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

/** "15,06" — French-locale with up to 2 decimals. */
export const fmtDec = (n: number, digits = 2) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** Billions short-form: 11_722_400_172 → "11,72" (use with " Md €" unit). */
export const fmtBillions = (n: number, digits = 2) => fmtDec(n / 1_000_000_000, digits);

/** Millions short-form: 312_000_000 → "312" (use with " M €" unit). */
export const fmtMillions = (n: number, digits = 0) => fmtDec(n / 1_000_000, digits);

/** Automatic compact: < 1 M → "xxx k €"; < 1 B → "xxx M €"; else "x,xx Md €". */
export function fmtCompactEur(n: number): { value: string; unit: string } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return { value: fmtDec(n / 1_000_000_000), unit: "Md €" };
  if (abs >= 1_000_000) return { value: fmtDec(n / 1_000_000, 0), unit: "M €" };
  if (abs >= 1_000) return { value: fmtDec(n / 1_000, 0), unit: "k €" };
  return { value: fmtInt(n), unit: "€" };
}

/** "fr" | "en" → Intl locale string used everywhere for number formatting. */
export const numLocale = (locale: string) => (locale === "en" ? "en-GB" : "fr-FR");

/** Replace every `{key}` placeholder in a translated string. */
export const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/** Capitalise la première lettre de chaque phrase (sorties LLM en lowercase). */
export const cap = (s?: string | null) =>
  s ? s.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase()) : s;

/** Suffixe ordinal : 1er/2ᵉ… en FR, 1st/2th… en EN (sic — préserve l'existant). */
export const sufOrdinal = (n: number, locale: string) =>
  locale === "en" ? (n === 1 ? "st" : "th") : n === 1 ? "er" : "ᵉ";

/**
 * Compact euro as `{ v, u }`, locale-aware, with Md/M unit labels supplied by
 * the caller (typically `t("fx.s.md_eur")` / `t("fx.s.m_eur")`). Tier checks
 * intentionally use `n >=` (not abs) to match the historical inline copies.
 * Client components should use the `useFmtEur()` hook instead.
 */
export const makeFmtEur =
  (locStr: string, units: { md: string; m: string }) =>
  (n: number): { v: string; u: string } => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: units.md };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: units.m };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };
