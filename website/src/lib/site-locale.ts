/**
 * Canonical, hreflang and absolute URLs of a page: the SEO side of lib/urls.ts.
 *
 * Since 2026-09-13 the language is the first segment of the path, on a single
 * host (www.qipu.org); fr.qipu.org and pt.qipu.org only redirect (proxy.ts).
 * Callers pass the page's LOGICAL path (/france/lille, /methode) — or its full
 * address — and the language it is served in.
 *
 * Why the language is in the address and not in a cookie: crawlers never carry
 * one, so a cookie-chosen language meant exactly one language per page in
 * Google's index — the wrong one, for months (2026-09-08 audit).
 *
 * This module has no server imports so client components can use it.
 */
import {
  DEFAULT_LANG,
  SITE_ORIGIN,
  type Lang,
  absoluteUrl,
  isIndexable,
  languageTwins,
  localize,
  toLogical,
  translatePath,
} from '@/lib/urls';

export type SiteLocale = Lang;

export const DEFAULT_SITE_LOCALE: SiteLocale = DEFAULT_LANG;

export { absoluteUrl };

/** The cookie that remembers a language picked with the switcher, read by the `/` redirect. */
export const LANG_COOKIE = 'qipu_lang';

export const HREFLANG: Record<SiteLocale, string> = { fr: 'fr-FR', en: 'en', pt: 'pt-BR' };

/**
 * Canonical + hreflang for `path` as served in `locale`. The canonical is the
 * page's own address (never a twin in another language). Twins are declared
 * only when they are indexed (`isIndexable`): a commune translation is served,
 * kept out of the index, and not advertised. `x-default` is the English twin
 * when it is indexed, the page's own language otherwise.
 */
export function alternatesFor(path: string, locale: SiteLocale): {
  canonical: string;
  languages: Record<string, string>;
} {
  const address = localize(path, locale);
  const twins = languageTwins(address);
  const languages: Record<string, string> = {};
  for (const [l, p] of Object.entries(twins) as [Lang, string][]) {
    if (isIndexable(p)) languages[HREFLANG[l]] = SITE_ORIGIN + p;
  }
  const fallback = [twins.en, ...Object.values(twins)].find((p) => p && isIndexable(p)) ?? address;
  languages['x-default'] = SITE_ORIGIN + fallback;
  return { canonical: SITE_ORIGIN + address, languages };
}

/** The address of the page being viewed, in `lang` (the switcher's target). */
export function addressInLang(pathname: string, lang: SiteLocale): string {
  return translatePath(pathname, lang) ?? localize(toLogical(pathname), lang);
}

/** Go to the current page in `lang` and remember the choice. Client only. */
export function switchLanguage(lang: SiteLocale): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  window.location.assign(`${addressInLang(pathname, lang)}${search}${hash}`);
}
