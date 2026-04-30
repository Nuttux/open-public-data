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

export const SITE_URL = 'https://franceopendata.org';
export const SITE_NAME = 'Données Lumières';
export const DEFAULT_OG_IMAGE = '/og-default.png';
export const DEFAULT_LOCALE = 'fr_FR';
export const TWITTER_HANDLE = '@donneeslumieres';

type BuildMetadataInput = {
  title: string;
  description: string;
  /** Path without domain, ex: "/budget" */
  path?: string;
  /** Localised alternates, keys: 'fr' | 'en' */
  alternates?: { fr?: string; en?: string };
  keywords?: string[];
  /** Block indexing for A/B test / WIP pages */
  noindex?: boolean;
  /** Override default OG image */
  image?: string;
};

/**
 * Build Next.js Metadata with canonical, OpenGraph, Twitter and robots.
 * Title template is inherited from root layout, so pass only the page-specific title.
 */
export function buildPageMetadata({
  title,
  description,
  path = '/',
  alternates,
  keywords,
  noindex,
  image,
}: BuildMetadataInput): Metadata {
  const canonical = path;
  const ogImage = image ?? DEFAULT_OG_IMAGE;

  // Server-side metadata defaults to FR canonical because the user's locale
  // lives in localStorage (client-only). We still emit alternates.languages
  // so search engines and link-preview crawlers know the site is bilingual,
  // even though both URLs currently point at the same canonical path.
  const languages = alternates
    ? { 'fr-FR': alternates.fr, 'en-US': alternates.en }
    : { 'fr-FR': canonical, 'en-US': canonical };

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonical}`,
      siteName: SITE_NAME,
      locale: DEFAULT_LOCALE,
      alternateLocale: ['en_US'],
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: noindex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
  };
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
      "Données Lumières rend lisibles les finances publiques : budget, subventions, marchés, logements et patrimoine de la Ville de Paris et d'une vingtaine de grandes villes françaises.",
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
