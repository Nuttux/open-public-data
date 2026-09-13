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
import { headers } from 'next/headers';
import { alternatesFor, DEFAULT_SITE_LOCALE, type SiteLocale } from '@/lib/site-locale';
import { COUNTRY_LANGS, DEFAULT_LANG, absoluteUrl, scopeOf, type Lang } from '@/lib/urls';

// The apex 308-redirects to www in production, so www is the host that
// actually serves. Pointing canonicals, OG urls and ~42 000 sitemap entries at
// the redirecting apex asked every crawler to resolve a hop it did not need.
export const SITE_URL = 'https://www.qipu.org';
export const SITE_NAME = 'Qipu';
export const DEFAULT_OG_IMAGE = '/og-default.png';
export const DEFAULT_LOCALE = 'fr_FR';
export const TWITTER_HANDLE = '@donneeslumieres';

/**
 * The language this request is served in: the first segment of its address
 * (lib/urls.ts), never a cookie or Accept-Language. proxy.ts stamps
 * `x-qipu-locale`; routes the proxy does not cover (sitemap, robots) get the
 * default.
 *
 * Why no cookie: crawlers never carry one, so a cookie-chosen language meant
 * exactly one language per page in Google's index — and a DEFAULT_LOCALE=en
 * demo switch left on in production had made that language English for every
 * French entity page (2026-09-08 audit).
 */
export async function readSiteLocale(): Promise<SiteLocale> {
  try {
    const h = await headers();
    const forced = h.get('x-qipu-locale');
    if (forced === 'fr' || forced === 'en' || forced === 'pt') return forced;
    return DEFAULT_SITE_LOCALE;
  } catch {
    /* headers() throws outside a request (module evaluation, static build) */
    return DEFAULT_SITE_LOCALE;
  }
}

/** The FR/EN dictionary to use for French-authored surfaces (pt reads as en). */
export async function readLocale(): Promise<'fr' | 'en'> {
  return (await readSiteLocale()) === 'fr' ? 'fr' : 'en';
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
  const path = input.path ?? '/';
  const ogLocale = locale === 'en' ? 'en_US' : DEFAULT_LOCALE;
  const altLocale = locale === 'en' ? ['fr_FR'] : ['en_US'];
  // Every page declares its language twins (lib/site-locale.ts). An explicit
  // per-language override wins when a page has genuinely different paths per
  // language.
  const alt = alternatesFor(path, locale);
  const canonical = alt.canonical;
  const languages = input.alternates
    ? {
        ...(input.alternates.fr ? { 'fr-FR': absoluteUrl(input.alternates.fr, 'fr') } : {}),
        ...(input.alternates.en ? { en: absoluteUrl(input.alternates.en, 'en') } : {}),
      }
    : alt.languages;

  // Only set images when an explicit override is provided. Otherwise let Next.js
  // resolve `opengraph-image.tsx` from the route segment (closest match wins).
  const ogImages = input.image
    ? [{ url: input.image, width: 1200, height: 630, alt: resolvedTitle }]
    : undefined;
  const twitterImages = input.image ? [input.image] : undefined;

  return {
    // Brand appended once, as `absolute` so the root `%s · SITE_NAME` template
    // never double-applies (it still serves raw-string titles like chat/legal).
    // Page inputs carry no brand suffix — the builder is the single source.
    title: { absolute: `${resolvedTitle} · ${SITE_NAME}` },
    description: resolvedDescription,
    keywords: input.keywords,
    alternates: { canonical, languages },
    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      url: canonical,
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
    logo: `${SITE_URL}/icon.svg`,
    description:
      "Qipu rend lisibles les finances publiques : budget, subventions, marchés, logements et patrimoine de la Ville de Paris et d'une vingtaine de grandes villes françaises.",
    sameAs: [],
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
 * The licence a page's data carries at its source, vérifiée sur chaque portail
 * le 13 septembre 2026 :
 *   - DataSF (/usa) : PDDL — budget, paiements, contrats, rémunérations ;
 *   - Recife (/brasil) et Paris Open Data : ODbL ;
 *   - toute autre commune (/france/…) : DGFiP, OFGL et DECP, Licence Ouverte v2.0.
 * Marseille : Licence Ouverte v2.0 (Ville sur data.gouv.fr, Métropole AMP). Le
 * national mêle des sources : ses pages passent la licence explicitement. L'ancien défaut, ODbL partout,
 * prêtait la licence de Paris à des données qui ne l'ont pas.
 */
export function licenseForPath(path: string): string | undefined {
  const s = scopeOf(path);
  if (!s) return undefined;
  if (s.country === 'usa') return 'https://opendatacommons.org/licenses/pddl/1-0/';
  if (s.country === 'brasil') return 'https://opendatacommons.org/licenses/odbl/1-0/';
  // National pages mix sources and pass their licence explicitly.
  if (s.place === null) return undefined;
  if (s.place === 'paris') return 'https://opendatacommons.org/licenses/odbl/1-0/';
  // Marseille (data.gouv.fr, Métropole AMP) and every other commune (DGFiP, OFGL, DECP) — vérifié.
  return 'https://www.etalab.gouv.fr/licence-ouverte-open-licence';
}

/** The language a page is written in when none is given: its country's, English elsewhere. */
function nativeLang(path: string): Lang {
  const s = scopeOf(path);
  return s ? COUNTRY_LANGS[s.country].native : DEFAULT_LANG;
}

/** Absolute URL of a page (logical path or address) in `lang`, its country's language by default. */
function pageUrl(path: string, lang?: Lang): string {
  return absoluteUrl(path, lang ?? nativeLang(path));
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
  /** Who produced the underlying data. Defaults to the City of Paris for the
   *  Paris sections that were the first callers; a commune's figures come
   *  from the national treasury, San Francisco's from DataSF, Recife's from
   *  the Prefeitura. */
  creator?: string;
  /** Language of the page the dataset is described on; its country's by default. */
  lang?: Lang;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: input.name,
    description: input.description,
    url: pageUrl(input.path, input.lang),
    keywords: input.keywords,
    dateModified: input.dateModified,
    temporalCoverage: input.temporalCoverage,
    spatialCoverage: input.spatialCoverage
      ? { '@type': 'Place', name: input.spatialCoverage }
      : undefined,
    license: input.license ?? licenseForPath(input.path),
    creator: { '@type': 'Organization', name: input.creator ?? 'Ville de Paris' },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    isAccessibleForFree: true,
  };
}

/**
 * GEO: Breadcrumb schema — improves navigation context for AI engines.
 */
export function breadcrumbJsonLd(items: { name: string; path: string }[], lang?: Lang) {
  const trailLang = lang ?? nativeLang(items[items.length - 1]?.path ?? '/');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: pageUrl(item.path, trailLang),
    })),
  };
}

/**
 * Last pass over an entity page's Metadata (lib/entity-page.tsx):
 *   - brand suffix exactly once, as `absolute`, so the root `%s · Qipu`
 *     template cannot double it ("… · Qipu · Qipu" was live for 11 entity types);
 *   - canonical + hreflang on the host that speaks `locale`, derived from the
 *     path the entity config declared.
 */
export function finalizeEntityMetadata(md: Metadata, locale: SiteLocale): Metadata {
  const out: Metadata = { ...md };
  if (typeof md.title === 'string') {
    const bare = md.title.replace(/\s+[·—]\s+Qipu$/u, '');
    out.title = { absolute: `${bare} · ${SITE_NAME}` };
    if (md.openGraph && typeof md.openGraph.title === 'string') {
      out.openGraph = { ...md.openGraph, title: bare };
    }
    if (md.twitter && typeof md.twitter.title === 'string') {
      out.twitter = { ...md.twitter, title: bare };
    }
  }
  const declared = md.alternates?.canonical;
  const path = typeof declared === 'string' ? declared : declared && 'url' in declared ? String(declared.url) : null;
  if (path && path.startsWith('/')) {
    const alt = alternatesFor(path, locale);
    out.alternates = { ...md.alternates, canonical: alt.canonical, languages: alt.languages };
    out.openGraph = { ...(out.openGraph ?? md.openGraph), url: alt.canonical };
  }
  return out;
}
