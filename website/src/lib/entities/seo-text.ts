/**
 * Building blocks for the "answer" every entity page opens with — the title a
 * searcher or an AI engine reads as the answer to their question, and the one
 * sentence under the h1 that states it with the numbers, the years, who paid,
 * the source and the date of the data.
 *
 * Rules (feedback_seo_aigeo_by_default):
 *   - every figure comes from the fiche's own data — nothing typed by hand;
 *   - the source named is the one the fiche already links to;
 *   - the date is the export's `generated_at`, never "today".
 */
import { cityJsonPath, readDataJsonOrNull } from "@/lib/data/read";
import { displayFournisseur } from "@/lib/fournisseur-display";

export type SeoLocale = "fr" | "en";

/** Title + first sentence of an entity page. `null` → keep the page's own metadata. */
export type SeoAnswer = { title: string; answer: string };

const NBSP = " ";

/** "12,3 M€" / "1,2 Md€" / "450 k€" — or "€12.3M" / "€1.2bn" / "€450k". */
export function eur(n: number, locale: SeoLocale): string {
  const abs = Math.abs(n);
  const fmt = (v: number, digits: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(v);
  if (locale === "en") {
    if (abs >= 1e9) return `€${fmt(n / 1e9, 2)}bn`;
    if (abs >= 1e6) return `€${fmt(n / 1e6, 1)}M`;
    if (abs >= 1e3) return `€${fmt(n / 1e3, 0)}k`;
    return `€${fmt(n, 0)}`;
  }
  if (abs >= 1e9) return `${fmt(n / 1e9, 2)}${NBSP}Md€`;
  if (abs >= 1e6) return `${fmt(n / 1e6, 1)}${NBSP}M€`;
  if (abs >= 1e3) return `${fmt(n / 1e3, 0)}${NBSP}k€`;
  return `${fmt(n, 0)}${NBSP}€`;
}

/** "12,5 %" / "12.5%". */
export function pct(n: number, locale: SeoLocale, digits = 1): string {
  const v = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: digits }).format(n);
  return locale === "en" ? `${v}%` : `${v}${NBSP}%`;
}

/** "5 495" / "5,495". */
export function int(n: number, locale: SeoLocale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 }).format(n);
}

/** "2019-2024", "2024", or "" when no years. */
export function span(years: number[]): string {
  const ys = years.filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (ys.length === 0) return "";
  const a = ys[0];
  const b = ys[ys.length - 1];
  return a === b ? String(a) : `${a}-${b}`;
}

/** "Entre 2019 et 2024," / "En 2024," — "Between 2019 and 2024," / "In 2024,". */
export function periodLead(years: number[], locale: SeoLocale): string {
  const ys = years.filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (ys.length === 0) return "";
  const a = ys[0];
  const b = ys[ys.length - 1];
  if (locale === "en") return a === b ? `In ${a},` : `Between ${a} and ${b},`;
  return a === b ? `En ${a},` : `Entre ${a} et ${b},`;
}

/** French ordinal for arrondissements: 1 → "1er", 12 → "12e". */
export function ordFr(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}
export function ordEn(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

/**
 * Date of the export that produced the data ("4 septembre 2026"), read from
 * the `generated_at` of an index file under public/data. Null when the file
 * carries none — the sentence then simply names the source.
 */
export function dataDate(rel: string, locale: SeoLocale): string | null {
  const doc = readDataJsonOrNull<{ generated_at?: string }>(rel);
  const iso = doc?.generated_at;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Same, for a city-scoped file ("subventions/index.json" of Marseille). */
export function cityDataDate(city: string, file: string, locale: SeoLocale): string | null {
  return dataDate(cityJsonPath(city, file), locale);
}

/**
 * "Source : opendata.paris.fr (dette garantie), données au 4 septembre 2026."
 * "Source: opendata.paris.fr (guaranteed debt), data as of 4 September 2026."
 */
export function sourceLine(locale: SeoLocale, source: string, date: string | null): string {
  if (locale === "en") return date ? `Source: ${source}, data as of ${date}.` : `Source: ${source}.`;
  return date ? `Source${NBSP}: ${source}, données au ${date}.` : `Source${NBSP}: ${source}.`;
}

/** The open-data portal the French fiches cite: Paris has its own, the others go through data.gouv.fr. */
export function cityPortal(city: string): string {
  return city === "paris" ? "opendata.paris.fr" : "data.gouv.fr";
}

/**
 * A company name as it goes into a <title>: DECP registry names come in
 * capitals (« MAINTENANCE INDUSTRIE ») and are shown in title case, as the
 * supplier pages already do. Not for associations or social landlords, whose
 * capitals are acronyms (AGOSPAP would read « Agospap ») — clip those only.
 */
export function titleName(s: string, max = 38): string {
  return clip(displayFournisseur(s), max);
}

/** Clip a data label for a title without cutting a word in half. */
export function clip(s: string, max = 70): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:–-]+$/u, "")}…`;
}
