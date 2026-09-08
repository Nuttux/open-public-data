/**
 * One address = one language.
 *
 * The language of a page is carried by the HOST, never by a cookie:
 *
 *   www.qipu.org  → English, every country            (default host)
 *   fr.qipu.org   → French, for the French pages
 *   pt.qipu.org   → Portuguese, for the Brazilian pages
 *
 * Paths are identical across hosts, so every internal link (`/fr/city/paris/…`)
 * keeps working untouched: a visitor on fr.qipu.org stays on fr.qipu.org.
 * Each page declares its twins with hreflang (see `alternatesFor`). A page that
 * does not exist in a host's language redirects to the English host (proxy.ts).
 *
 * Why not a cookie (the previous design): crawlers never carry one, so Google
 * indexed exactly one language per page — the wrong one, for months.
 *
 * This module has no server imports so client components can use it.
 */

export type SiteLocale = 'fr' | 'en' | 'pt';

export const DEFAULT_SITE_LOCALE: SiteLocale = 'en';

/** Production hosts, by language. */
export const LOCALE_HOSTS: Record<SiteLocale, string> = {
  en: 'https://www.qipu.org',
  fr: 'https://fr.qipu.org',
  pt: 'https://pt.qipu.org',
};

const LOCALE_SUBDOMAIN: Record<SiteLocale, string> = { en: '', fr: 'fr.', pt: 'pt.' };

/** `fr.qipu.org` → fr, `pt.localhost:3000` → pt, anything else → en. */
export function localeFromHost(host: string | null | undefined): SiteLocale {
  const h = (host ?? '').toLowerCase().split(':')[0];
  if (h.startsWith('fr.')) return 'fr';
  if (h.startsWith('pt.')) return 'pt';
  return 'en';
}

/** Paths outside the country trees that carry a Portuguese version too. */
const TRILINGUAL_PATHS = new Set(['/pour-les-villes']);

/**
 * The languages a path exists in. Everything French-authored (root pages,
 * /fr/…, /analyses…) has a French and an English version; /us is English only;
 * /br is Portuguese and English.
 */
export function localesForPath(path: string): SiteLocale[] {
  if (path === '/us' || path.startsWith('/us/')) return ['en'];
  if (path === '/br' || path.startsWith('/br/')) return ['pt', 'en'];
  if (TRILINGUAL_PATHS.has(path)) return ['en', 'fr', 'pt'];
  return ['en', 'fr'];
}

/**
 * The host that speaks `locale`, derived from the host currently serving
 * (so localhost and preview deployments keep working):
 *   hostForLocale('fr', 'www.qipu.org')      → 'fr.qipu.org'
 *   hostForLocale('en', 'fr.localhost:3000') → 'localhost:3000'
 * Vercel preview hosts cannot grow a subdomain; they stay as they are.
 */
export function hostForLocale(locale: SiteLocale, currentHost?: string | null): string {
  if (!currentHost) return LOCALE_HOSTS[locale].replace(/^https?:\/\//, '');
  const base = currentHost.toLowerCase().replace(/^(www|fr|pt)\./, '');
  if (base.endsWith('.vercel.app')) return currentHost;
  if (locale === 'en') return base === 'qipu.org' ? 'www.qipu.org' : base;
  return `${LOCALE_SUBDOMAIN[locale]}${base}`;
}

/** Absolute URL of `path` in `locale`, on the matching host. */
export function urlForLocale(locale: SiteLocale, path: string, currentHost?: string | null): string {
  if (!currentHost) return `${LOCALE_HOSTS[locale]}${path}`;
  const host = hostForLocale(locale, currentHost);
  const protocol = /^(localhost|127\.0\.0\.1)(:|$)/.test(host.replace(/^(www|fr|pt)\./, '')) ? 'http' : 'https';
  return `${protocol}://${host}${path}`;
}

const HREFLANG: Record<SiteLocale, string> = { fr: 'fr-FR', en: 'en', pt: 'pt-BR' };

/**
 * Canonical + hreflang for `path` as served in `locale`. Twins are declared
 * only for the languages the path really exists in; `x-default` is the
 * English host, which serves every path.
 */
export function alternatesFor(path: string, locale: SiteLocale): {
  canonical: string;
  languages: Record<string, string>;
} {
  const locales = localesForPath(path);
  const own = locales.includes(locale) ? locale : DEFAULT_SITE_LOCALE;
  const languages: Record<string, string> = {};
  for (const l of locales) languages[HREFLANG[l]] = `${LOCALE_HOSTS[l]}${path}`;
  languages['x-default'] = `${LOCALE_HOSTS[DEFAULT_SITE_LOCALE]}${path}`;
  return { canonical: `${LOCALE_HOSTS[own]}${path}`, languages };
}
