/**
 * pt-BR number & date formatters for /br/city/recife.
 *
 * Deliberately local (like lib/us/format.ts): the shared fr-FR / en-US
 * helpers must not be touched. Brazilian conventions: "R$ 1.234.567,89"
 * (dot thousands, comma decimal), magnitude suffixes mil / mi / bi.
 * Rounding is display-only — raw JSON values pass through untouched.
 */

const MINUS = "−";
const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfDec = (d: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** R$ 16.144 — integer reais, pt-BR grouping. */
export function fmtBrl(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? MINUS : "";
  return `${sign}R$ ${nfInt.format(Math.abs(n))}`;
}

/** Magnitude-suffixed reais: R$ 5,52 bi · R$ 616,1 mi · R$ 71,1 mil. */
export function fmtBrlCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}R$ ${nfDec(2).format(abs / 1e9)} bi`;
  if (abs >= 1e6) return `${sign}R$ ${nfDec(1).format(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sign}R$ ${nfDec(0).format(abs / 1e3)} mil`;
  return fmtBrl(n);
}

/** Share fraction 0.529 → "52,9%". */
export function fmtShare(frac: number): string {
  const sign = frac < 0 ? MINUS : "";
  return `${sign}${nfDec(1).format(Math.abs(frac) * 100)}%`;
}

/** Integer with pt-BR grouping (counts). */
export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return nfInt.format(n);
}

/** Format a 14-digit CNPJ as 00.000.000/0000-00. */
export function fmtCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "").padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/** "2024-10-01T00:00:00" → "01/10/2024" (pt-BR, UTC-stable). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

const MESES = ["", "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez"];
export function mesLabel(m: number): string {
  return MESES[m] ?? String(m);
}

/** Simple {token} interpolation for i18n strings. */
export function fill(s: string, vars: Record<string, string | number>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** URL-safe slug for a função label. Client-safe (no fs), so client components
 * can build drilldown hrefs without importing the fs-backed data loaders. */
export function funcaoSlug(funcao: string): string {
  return funcao
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
