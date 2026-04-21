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
