/**
 * SEO & GEO helpers
 *
 * - buildPageMetadata(): assemble un objet Next.js Metadata cohérent
 *   (canonical, OpenGraph, Twitter) pour chaque route.
 * - Generative Engine Optimization (GEO) : JSON-LD builders
 *   consommables par les moteurs IA (ChatGPT Search, Perplexity,
 *   Google SGE) pour qu'ils citent correctement le site.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const SITE_URL = 'https://franceopendata.org';
export const SITE_NAME = 'France Open Data';
export const DEFAULT_OG_IMAGE = '/og-default.png';
export const DEFAULT_LOCALE = 'fr_FR';
export const TWITTER_HANDLE = '@donneeslumieres';

/**
 * Read the user's locale server-side. Cookie `dl_locale` is the only signal —
 * fallback is FR. We deliberately don't sniff Accept-Language: the site is
 * primarily about French public finances, many French users have EN-default
 * browsers (OS/dev tooling), and Accept-Language was sending them to EN
 * involuntarily — including when they shared links to other French speakers.
 * EN is opt-in via the explicit toggle.
 */
export async function readLocale(): Promise<'fr' | 'en'> {
  try {
    const c = await cookies();
    const fromCookie = c.get('dl_locale')?.value;
    if (fromCookie === 'en') return 'en';
  } catch { /* cookies() may throw at module load — ignore */ }
  return 'fr';
}

type BuildMetadataInput = {
  title: string;
  description: string;
  /** Path without domain, ex: "/budget" */
  path?: string;
  /** Localised alternates, keys: 'fr' | 'en' */
  alternates?: { fr?: string; en?: string };
  /** Pre-translated EN strings — used when the user's locale is `en` (cookie/header). */
  en?: { title?: string; description?: string };
  keywords?: string[];
  /** Block indexing for A/B test / WIP pages */
  noindex?: boolean;
  /** Override default OG image */
  image?: string;
};

/** Internal: assemble the Metadata object given resolved (already locale-picked) strings. */
function _assemble(
  resolvedTitle: string,
  resolvedDescription: string,
  locale: 'fr' | 'en',
  input: BuildMetadataInput,
): Metadata {
  const canonical = input.path ?? '/';
  const ogLocale = locale === 'en' ? 'en_US' : DEFAULT_LOCALE;
  const altLocale = locale === 'en' ? ['fr_FR'] : ['en_US'];
  const languages = input.alternates
    ? { 'fr-FR': input.alternates.fr, 'en-US': input.alternates.en }
    : { 'fr-FR': canonical, 'en-US': canonical };

  // Only set images when an explicit override is provided. Otherwise let Next.js
  // resolve `opengraph-image.tsx` from the route segment (closest match wins).
  const ogImages = input.image
    ? [{ url: input.image, width: 1200, height: 630, alt: resolvedTitle }]
    : undefined;
  const twitterImages = input.image ? [input.image] : undefined;

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    keywords: input.keywords,
    alternates: { canonical, languages },
    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      url: `${SITE_URL}${canonical}`,
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: altLocale,
      type: 'website',
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description: resolvedDescription,
      ...(twitterImages ? { images: twitterImages } : {}),
    },
    robots: input.noindex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
  };
}

/**
 * Build Next.js Metadata (synchronous — for use as `export const metadata = ...`).
 * Always returns FR strings since cookies aren't accessible in module-level evaluation.
 */
export function buildPageMetadata(input: BuildMetadataInput): Metadata {
  return _assemble(input.title, input.description, 'fr', input);
}

/**
 * Locale-aware metadata builder for use inside `generateMetadata()` async functions.
 * Reads the `dl_locale` cookie (set by `LocaleProvider` on toggle) and picks the
 * EN strings if both the cookie says `en` AND `input.en` is provided.
 */
export async function buildLocaleAwareMetadata(input: BuildMetadataInput): Promise<Metadata> {
  const locale = await readLocale();
  const resolvedTitle = locale === 'en' && input.en?.title ? input.en.title : input.title;
  const resolvedDescription = locale === 'en' && input.en?.description ? input.en.description : input.description;
  return _assemble(resolvedTitle, resolvedDescription, locale, input);
}

/**
 * GEO: Organization schema — helps AI engines cite the publisher correctly.
 */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/og-default.png`,
    description:
      "France Open Data rend lisibles les finances publiques : budget, subventions, marchés, logements et patrimoine de la Ville de Paris et d'une vingtaine de grandes villes françaises.",
    sameAs: ['https://github.com/AbstractsMachine'],
  };
}

/**
 * GEO: WebSite schema with SearchAction — surfaces the site search.
 */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ['fr-FR', 'en-US'],
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };
}

/**
 * GEO: Dataset schema — the most cited schema type for data journalism
 * when AI engines look for structured public-finance data.
 */
export function datasetJsonLd(input: {
  name: string;
  description: string;
  path: string;
  keywords?: string[];
  /** ISO date string, ex: "2026-04-17" */
  dateModified?: string;
  /** Temporal coverage, ex: "2019/2026" */
  temporalCoverage?: string;
  /** Spatial coverage, ex: "Paris, France" */
  spatialCoverage?: string;
  license?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: input.name,
    description: input.description,
    url: `${SITE_URL}${input.path}`,
    keywords: input.keywords,
    dateModified: input.dateModified,
    temporalCoverage: input.temporalCoverage,
    spatialCoverage: input.spatialCoverage
      ? { '@type': 'Place', name: input.spatialCoverage }
      : undefined,
    license: input.license ?? 'https://opendatacommons.org/licenses/odbl/',
    creator: { '@type': 'Organization', name: 'Ville de Paris' },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    isAccessibleForFree: true,
  };
}

/**
 * GEO: Breadcrumb schema — improves navigation context for AI engines.
 */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
