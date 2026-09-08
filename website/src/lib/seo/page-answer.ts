/**
 * The "answer" of a page, for the routes that are not built on
 * lib/entity-page.tsx (San Francisco, Recife): the same contract as
 * lib/entities/seo-text.ts — a title that answers the question a searcher or
 * an AI engine asks, and one sentence with the numbers, the years, who paid,
 * the source and the date of the data — turned into Next Metadata with the
 * canonical + hreflang of the host that speaks `locale`.
 *
 * Every figure comes from the page's own data; the source named is the one
 * the page already links to; the date is the export's, never "today".
 */
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/seo";
import { alternatesFor, type SiteLocale } from "@/lib/site-locale";

export type PageAnswer = { title: string; answer: string };

/** Build the Metadata of an answered page. `extra` merges last (openGraph type…). */
export function answerMetadata(a: PageAnswer, path: string, locale: SiteLocale, extra: Metadata = {}): Metadata {
  const alt = alternatesFor(path, locale);
  return {
    ...extra,
    title: { absolute: `${a.title} · ${SITE_NAME}` },
    description: a.answer,
    alternates: { ...(extra.alternates ?? {}), canonical: alt.canonical, languages: alt.languages },
    openGraph: { ...(extra.openGraph ?? {}), title: a.title, description: a.answer, url: alt.canonical },
    twitter: { ...(extra.twitter ?? {}), title: a.title, description: a.answer },
  };
}

/** Canonical + hreflang only, for section pages that keep their own title. */
export function sectionAlternates(path: string, locale: SiteLocale): Pick<Metadata, "alternates"> {
  const alt = alternatesFor(path, locale);
  return { alternates: { canonical: alt.canonical, languages: alt.languages } };
}

/** "4 September 2026" / "4 de setembro de 2026" from an ISO stamp; null when absent or invalid. */
export function isoDate(iso: string | null | undefined, locale: SiteLocale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tag = locale === "pt" ? "pt-BR" : locale === "fr" ? "fr-FR" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/**
 * "Source: X, data as of D." / "Fonte: X, dados de D." / "Source : X, données au D."
 */
export function sourceSentence(locale: SiteLocale, source: string, date: string | null): string {
  if (locale === "pt") return date ? `Fonte: ${source}, dados de ${date}.` : `Fonte: ${source}.`;
  if (locale === "fr") return date ? `Source : ${source}, données au ${date}.` : `Source : ${source}.`;
  return date ? `Source: ${source}, data as of ${date}.` : `Source: ${source}.`;
}

/** "2019–2024" / "2024" / "" — for a title suffix. */
export function yearSpan(first: number | null | undefined, last: number | null | undefined): string {
  if (first == null && last == null) return "";
  if (first == null || last == null || first === last) return String(first ?? last);
  return `${first}–${last}`;
}

/** Plural helper for English counts: n("contract", 2) → "2 contracts". */
export function n(word: string, count: number, locale: SiteLocale = "en", plural?: string): string {
  const num = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : locale === "fr" ? "fr-FR" : "en-US").format(count);
  const many = plural ?? `${word}s`;
  return `${num} ${count === 1 ? word : many}`;
}
