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

// Non-breaking space: keeps "R$" glued to its number (and the magnitude word
// glued to both) so a compact amount never wraps mid-figure in tight columns.
const NB = " ";

/** R$ 16.144 — integer reais, pt-BR grouping. */
export function fmtBrl(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? MINUS : "";
  return `${sign}R$${NB}${nfInt.format(Math.abs(n))}`;
}

/** Magnitude-suffixed reais: R$ 5,5 bi · R$ 616 mi · R$ 8,1 mi · R$ 71 mil.
 *  One significant decimal max, and none once we're in the tens (≥ R$ 100 mi /
 *  ≥ R$ 10 mil) — at that scale a trailing decimal is false precision. */
export function fmtBrlCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}R$${NB}${nfDec(1).format(abs / 1e9)}${NB}bi`;
  if (abs >= 1e6) return `${sign}R$${NB}${nfDec(abs >= 1e8 ? 0 : 1).format(abs / 1e6)}${NB}mi`;
  if (abs >= 1e3) return `${sign}R$${NB}${nfDec(0).format(abs / 1e3)}${NB}mil`;
  return fmtBrl(n);
}

/** Hero deck amount — coherent round figures across the four cards: integer
 *  when the value is ≥ 10 in its unit (R$ 571 mi, R$ 730 mi), one decimal only
 *  below 10 (R$ 8,9 bi). Avoids the ragged "571,2 / 730,0" widths that make the
 *  cards look mismatched. Non-breaking spaces keep "R$" and the unit glued. */
export function fmtBrlDeck(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  let val: number, unit: string;
  if (abs >= 1e9) { val = abs / 1e9; unit = "bi"; }
  else if (abs >= 1e6) { val = abs / 1e6; unit = "mi"; }
  else if (abs >= 1e3) { val = abs / 1e3; unit = "mil"; }
  else return fmtBrl(n);
  const dec = val >= 10 ? 0 : 1;
  return `${sign}R$${NB}${nfDec(dec).format(val)}${NB}${unit}`;
}

/** Magnitude word ("bi" / "mi" / "mil") for a value — the de-emphasised unit
 *  half of an IntroStat, paired with fmtBrlCompactNum. Empty below 1000 (the
 *  number is shown in full). Mirrors Paris's value + separate `unit` split. */
export function brlMagnitude(n: number | null | undefined): string {
  const abs = Math.abs(n ?? 0);
  if (abs >= 1e9) return "bi";
  if (abs >= 1e6) return "mi";
  if (abs >= 1e3) return "mil";
  return "";
}

/** Compact reais WITHOUT the magnitude word: "R$ 8,85" / "R$ 571,2" / "R$ 71,1"
 *  / "R$ 5.923". Pairs with brlMagnitude() so the big number stays bold while
 *  the suffix rides in the smaller, muted IntroStat unit span. */
export function fmtBrlCompactNum(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}R$${NB}${nfDec(2).format(abs / 1e9)}`;
  if (abs >= 1e6) return `${sign}R$${NB}${nfDec(1).format(abs / 1e6)}`;
  if (abs >= 1e3) return `${sign}R$${NB}${nfDec(0).format(abs / 1e3)}`;
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

/** True when a money value is present and positive. Contracts whose source
 *  `valor` is null/0 (≈53% of the Recife corpus) should read "não divulgado"
 *  rather than a misleading "R$ 0". */
export function hasValor(n: number | null | undefined): boolean {
  return n != null && n > 0;
}

const TITLE_SMALL = new Set(["e", "de", "da", "do", "dos", "das", "a", "o", "as", "os",
  "ao", "aos", "à", "às", "em", "no", "na", "nos", "nas", "para", "por", "com", "sem", "sob"]);
/** De-shout an ALL-CAPS administrative string to Title Case (pt-BR), keeping
 *  connectives lowercase: "CONTRATAÇÃO DE EMPRESA" → "Contratação de Empresa".
 *  A cosmetic mitigation only — it de-shouts, it does not plain-language the
 *  jargon (that needs the LLM enrichment step). Left untouched if the string is
 *  not predominantly uppercase (already mixed-case source stays as authored). */
export function titleCasePt(s: string | null | undefined): string {
  if (!s) return "";
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "");
  if (!letters || upper.length / letters.length < 0.7) return s; // already mixed-case
  return s.toLocaleLowerCase("pt-BR").split(/\s+/)
    .map((w, i) => (i > 0 && TITLE_SMALL.has(w)) ? w
      : w ? w[0].toLocaleUpperCase("pt-BR") + w.slice(1) : w)
    .join(" ");
}

/** English glosses for Brazilian procurement modalities (Lei 14.133 / 8.666
 *  legal terms). Keys are the canonical UPPERCASE source values. Unknown terms
 *  fall back to title-case. The legal term stays available via tooltip; this is
 *  a *display* aid for EN readers, not a rename. */
const MODALIDADE_EN: Record<string, string> = {
  "LICITAÇÃO": "Competitive tender",
  "INEXIGIBILIDADE": "No-bid (sole supplier)",
  "DISPENSA": "Waived tender",
  "SARP": "Price-registration framework",
  "COMPRA DIRETA": "Direct purchase",
  "PREGÃO ELETRÔNICO": "Electronic auction",
  "PREGÃO PRESENCIAL": "In-person auction",
  "CONCORRÊNCIA": "Open tender",
  "CONCORRÊNCIA - PRESENCIAL": "Open tender (in-person)",
  "CONCORRÊNCIA - ELETRÔNICA": "Open tender (electronic)",
  "TOMADA DE PREÇOS": "Price-taking tender",
  "CONVITE": "Invitation tender",
  "CHAMAMENTO PÚBLICO": "Public call",
  "CREDENCIAMENTO": "Accreditation",
  "CONCURSO": "Design contest",
  "LEILÃO": "Auction",
};

/** Localised display label for a procurement modality. PT keeps the legal term
 *  (de-shouted); EN shows a plain-language gloss (falls back to title-case). */
export function modalidadeLabel(raw: string | null | undefined, locale: string): string {
  if (!raw || raw === "—") return "—";
  if (locale === "en") return MODALIDADE_EN[raw.trim().toUpperCase()] ?? titleCasePt(raw);
  return titleCasePt(raw);
}

/** Deterministic ASCII slug — MUST match the Python `slug_token` in
 *  export_br_recife.py (NFKD accent-strip → non-alnum to hyphen → lower).
 *  Only the empty-string fallback differs per entity family. */
function slugToken(s: string | null | undefined, fallback: string): string {
  const ascii = (s ?? "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  return ascii.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;
}

/** Slug for an órgão name (fallback "orgao"). */
export function slugOrgao(s: string | null | undefined): string {
  return slugToken(s, "orgao");
}

/** Slug for a procurement modality (fallback "sem-modalidade"). */
export function slugModalidade(s: string | null | undefined): string {
  return slugToken(s, "sem-modalidade");
}

/** Slug for a public-policy theme (fallback "outros"). */
export function slugTema(s: string | null | undefined): string {
  return slugToken(s, "outros");
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
