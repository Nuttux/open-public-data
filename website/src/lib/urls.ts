/**
 * One address per page and language: www.qipu.org/{lang}/{country}/{place}/…
 *
 * Decided with the user on 2026-09-13, "once and for all":
 *   - one host, www.qipu.org — fr.qipu.org and pt.qipu.org redirect here;
 *   - the first segment is always the language, the second always the country
 *     (`france`, `usa`, `brasil`, the same in every language);
 *   - a country's sections keep the country's language in every interface
 *     language (/en/france/paris/subventions, /fr/usa/san-francisco/payroll);
 *   - site pages (method, licence, contact…) are translated per language;
 *   - a page is indexed in its country's language; its translations only when
 *     it is a hub (country, national section, big city and its sections).
 *
 * This module is the single source of those rules: builders for new URLs, the
 * legacy → new mapping the redirects use, the language twins hreflang needs,
 * and the indexing rule. Pure, no server imports: client components use it.
 */

export type Lang = 'fr' | 'en' | 'pt';
export const LANGS: readonly Lang[] = ['fr', 'en', 'pt'];
export const DEFAULT_LANG: Lang = 'en';

export const SITE_ORIGIN = 'https://www.qipu.org';

export type Country = 'france' | 'usa' | 'brasil';
export const COUNTRIES: readonly Country[] = ['france', 'usa', 'brasil'];

/** The language a country's data is written in, and the languages it is served in. */
export const COUNTRY_LANGS: Record<Country, { native: Lang; available: readonly Lang[] }> = {
  france: { native: 'fr', available: ['fr', 'en'] },
  usa: { native: 'en', available: ['en'] },
  brasil: { native: 'pt', available: ['pt', 'en'] },
};

/** Cities with their own section trees (hubs), as opposed to the national commune pages. */
export const BIG_CITIES: Record<Country, readonly string[]> = {
  france: ['paris', 'marseille'],
  usa: ['san-francisco'],
  brasil: ['recife'],
};

/** France's national sections, which sit directly under the country. */
export const FRANCE_NATIONAL_SECTIONS: readonly string[] = [
  'budget',
  'daily-bread',
  'dette',
  'etat',
  'fiscalite',
  'comparer',
];

// ── Site pages: translated slugs ────────────────────────────────────────────

export type SitePage =
  | 'methode'
  | 'licence'
  | 'contact'
  | 'pour-les-villes'
  | 'confidentialite'
  | 'mentions-legales'
  | 'accessibilite'
  | 'corrections'
  | 'signalement'
  | 'analyses'
  | 'chat'
  | 'abonnement';

/** Keyed by today's (French) path, which is also the legacy URL. */
export const SITE_PAGE_SLUGS: Record<SitePage, Record<Lang, string>> = {
  methode: { fr: 'methode', en: 'method', pt: 'metodo' },
  licence: { fr: 'licence', en: 'license', pt: 'licenca' },
  contact: { fr: 'contact', en: 'contact', pt: 'contato' },
  'pour-les-villes': { fr: 'pour-les-villes', en: 'for-cities', pt: 'para-cidades' },
  confidentialite: { fr: 'confidentialite', en: 'privacy', pt: 'privacidade' },
  'mentions-legales': { fr: 'mentions-legales', en: 'legal-notice', pt: 'aviso-legal' },
  accessibilite: { fr: 'accessibilite', en: 'accessibility', pt: 'acessibilidade' },
  corrections: { fr: 'corrections', en: 'corrections', pt: 'correcoes' },
  signalement: { fr: 'signalement', en: 'report-an-error', pt: 'reportar-erro' },
  analyses: { fr: 'analyses', en: 'analyses', pt: 'analises' },
  chat: { fr: 'chat', en: 'chat', pt: 'chat' },
  abonnement: { fr: 'abonnement', en: 'alerts', pt: 'alertas' },
};

/** Languages each site page exists in (the Portuguese versions that exist today). */
export const SITE_PAGE_LANGS: Record<SitePage, readonly Lang[]> = {
  methode: ['fr', 'en'],
  licence: ['fr', 'en'],
  contact: ['fr', 'en'],
  'pour-les-villes': ['fr', 'en', 'pt'],
  confidentialite: ['fr', 'en', 'pt'],
  'mentions-legales': ['fr', 'en'],
  accessibilite: ['fr', 'en'],
  corrections: ['fr', 'en'],
  signalement: ['fr', 'en'],
  analyses: ['fr', 'en'],
  chat: ['fr', 'en'],
  abonnement: ['fr', 'en'],
};

const SITE_PAGES = Object.keys(SITE_PAGE_SLUGS) as SitePage[];

function sitePageFromSlug(slug: string, lang: Lang): SitePage | null {
  return SITE_PAGES.find((p) => SITE_PAGE_SLUGS[p][lang] === slug) ?? null;
}

// ── Builders ────────────────────────────────────────────────────────────────

function join(...parts: (string | undefined)[]): string {
  const segs = parts.filter((p): p is string => !!p).flatMap((p) => p.split('/')).filter(Boolean);
  return '/' + segs.join('/');
}

/** The language a page is served in when `lang` is not among `available`. */
export function servedLang(lang: Lang, available: readonly Lang[]): Lang {
  return available.includes(lang) ? lang : available.includes(DEFAULT_LANG) ? DEFAULT_LANG : available[0];
}

/** Landing of a language: /fr, /en, /pt. */
export function landingPath(lang: Lang): string {
  return `/${lang}`;
}

/** A country page or anything under it: countryPath('fr', 'france', 'lille', 'marches'). */
export function countryPath(lang: Lang, country: Country, ...rest: string[]): string {
  return join(servedLang(lang, COUNTRY_LANGS[country].available), country, ...rest);
}

/** A site page in a language: sitePagePath('methode', 'en') → /en/method. */
export function sitePagePath(page: SitePage, lang: Lang, ...rest: string[]): string {
  const l = servedLang(lang, SITE_PAGE_LANGS[page]);
  return join(l, SITE_PAGE_SLUGS[page][l], ...rest);
}

// ── Parsing new paths ───────────────────────────────────────────────────────

export type ParsedPath =
  | { kind: 'landing'; lang: Lang }
  | { kind: 'country'; lang: Lang; country: Country; rest: string[] }
  | { kind: 'site'; lang: Lang; page: SitePage; rest: string[] };

export function parsePath(pathname: string): ParsedPath | null {
  const segs = pathname.split('?')[0].split('/').filter(Boolean);
  const lang = segs[0] as Lang;
  if (!LANGS.includes(lang)) return null;
  if (segs.length === 1) return { kind: 'landing', lang };
  const second = segs[1];
  if ((COUNTRIES as readonly string[]).includes(second)) {
    return { kind: 'country', lang, country: second as Country, rest: segs.slice(2) };
  }
  const page = sitePageFromSlug(second, lang);
  if (page) return { kind: 'site', lang, page, rest: segs.slice(2) };
  return null;
}

/** Languages a new path exists in. */
export function langsForPath(pathname: string): readonly Lang[] {
  const p = parsePath(pathname);
  if (!p) return [];
  if (p.kind === 'landing') return LANGS;
  if (p.kind === 'country') return COUNTRY_LANGS[p.country].available;
  return SITE_PAGE_LANGS[p.page];
}

/** The same page in another language (null when it does not exist there). */
export function translatePath(pathname: string, to: Lang): string | null {
  const p = parsePath(pathname);
  if (!p || !langsForPath(pathname).includes(to)) return null;
  if (p.kind === 'landing') return landingPath(to);
  if (p.kind === 'country') return join(to, p.country, ...p.rest);
  return join(to, SITE_PAGE_SLUGS[p.page][to], ...p.rest);
}

/** Every language twin of a page, for hreflang: { fr: '/fr/…', en: '/en/…' }. */
export function languageTwins(pathname: string): Partial<Record<Lang, string>> {
  const out: Partial<Record<Lang, string>> = {};
  for (const l of langsForPath(pathname)) {
    const t = translatePath(pathname, l);
    if (t) out[l] = t;
  }
  return out;
}

/**
 * Whether a page belongs in Google's index. Its country's language: always.
 * A translation: only a hub — the country page, a national section page, a big
 * city and its section pages. The ~85 000 commune and fiche translations stay
 * reachable, out of the index.
 */
export function isIndexable(pathname: string): boolean {
  const p = parsePath(pathname);
  if (!p) return false;
  if (p.kind !== 'country') return true;
  if (p.lang === COUNTRY_LANGS[p.country].native) return true;
  const [first] = p.rest;
  if (p.rest.length === 0) return true;
  if (p.country === 'france' && FRANCE_NATIONAL_SECTIONS.includes(first)) return p.rest.length === 1;
  if (BIG_CITIES[p.country].includes(first)) return p.rest.length <= 2;
  return false;
}

// ── Logical paths: what the code writes ─────────────────────────────────────
//
// Code links to a page without knowing the reader's language: a LOGICAL path,
// the address minus its language, with site pages under their French key.
//   /france/paris/budget   /usa/san-francisco/payroll   /methode   /
// The link components (components/LocalizedLink, lib/navigation) put the
// reader's language back at render time with localize().

/** Logical path → address in `lang`. Anything that is not a logical path passes through untouched. */
export function localize(href: string, lang: Lang): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const pathPart = cut === -1 ? href : href.slice(0, cut);
  const suffix = cut === -1 ? '' : href.slice(cut);
  if (parsePath(pathPart)) return href; // already an address
  const segs = pathPart.split('/').filter(Boolean);
  if (segs.length === 0) return landingPath(lang) + suffix;
  if ((COUNTRIES as readonly string[]).includes(segs[0])) {
    return countryPath(lang, segs[0] as Country, ...segs.slice(1)) + suffix;
  }
  if (SITE_PAGES.includes(segs[0] as SitePage)) {
    return sitePagePath(segs[0] as SitePage, lang, ...segs.slice(1)) + suffix;
  }
  return href;
}

/**
 * parsePath, also reading a site page under its French key in any language:
 * /en/methode is the route the proxy rewrites /en/method to, and a server
 * render may see either spelling.
 */
function parseRoute(pathname: string): ParsedPath | null {
  const p = parsePath(pathname);
  if (p) return p;
  const segs = pathname.split('?')[0].split('/').filter(Boolean);
  if (LANGS.includes(segs[0] as Lang) && SITE_PAGES.includes(segs[1] as SitePage)) {
    return { kind: 'site', lang: segs[0] as Lang, page: segs[1] as SitePage, rest: segs.slice(2) };
  }
  return null;
}

/** Address → logical path: /fr/france/paris/budget → /france/paris/budget, /en/method → /methode, /fr → /. */
export function toLogical(pathname: string): string {
  const p = parseRoute(pathname);
  if (!p) return pathname;
  if (p.kind === 'landing') return '/';
  if (p.kind === 'country') return join(p.country, ...p.rest);
  return join(p.page, ...p.rest);
}

/** Language of an address, if it is one. */
export function langOf(pathname: string): Lang | null {
  return parseRoute(pathname)?.lang ?? null;
}

/** Absolute URL of a logical path (or an address) in `lang`: absoluteUrl('/france/lille', 'fr') → https://www.qipu.org/fr/france/lille. */
export function absoluteUrl(path: string, lang: Lang): string {
  return SITE_ORIGIN + localize(path, lang);
}

export type Scope = {
  country: Country;
  /** The city or commune the page is about; null on a country's national pages. */
  place: string | null;
  /** The segment under the place (or under the country, for a national page). */
  section: string | null;
  /** Everything after the section. */
  rest: string[];
};

/**
 * What a logical path (or an address) is about. The legacy tree told a commune
 * from a national page by its prefix (/fr/city/… vs /fr/national/…); both now
 * sit under /france, so code asks this instead of matching a prefix:
 *   /france/lille/budget → { country: france, place: lille, section: budget }
 *   /france/dette        → { country: france, place: null, section: dette }
 *   /france/comparer/a/b → { country: france, place: null, section: comparer, rest: [a, b] }
 */
export function scopeOf(pathname: string): Scope | null {
  const logical = toLogical(pathname.split(/[?#]/)[0]);
  const segs = logical.split('/').filter(Boolean);
  const country = segs[0] as Country;
  if (!COUNTRIES.includes(country)) return null;
  const [second, third, ...more] = segs.slice(1);
  const national =
    !second ||
    (country === 'france' && FRANCE_NATIONAL_SECTIONS.includes(second)) ||
    (country === 'usa' && second === 'national');
  if (national) return { country, place: null, section: second ?? null, rest: segs.slice(2) };
  return { country, place: second, section: third ?? null, rest: more };
}

// ── Legacy → new ────────────────────────────────────────────────────────────

const LEGACY_COUNTRY: Record<string, Country> = { fr: 'france', us: 'usa', br: 'brasil' };
const PLACE_RENAMES: Record<string, string> = { sf: 'san-francisco' };

/** Language a legacy host spoke: fr.qipu.org → fr, pt.qipu.org → pt, franceopendata → fr, else en. */
export function langForLegacyHost(host: string | null | undefined): Lang {
  const h = (host ?? '').toLowerCase().split(':')[0];
  if (h.startsWith('fr.') || /(^|\.)franceopendata\.org$/.test(h)) return 'fr';
  if (h.startsWith('pt.')) return 'pt';
  return 'en';
}

/** Root files that keep their address (robots, sitemaps, llms.txt, assets…). */
function isRootFile(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith('/sitemap/') || pathname.startsWith('/api/');
}

/**
 * The new address of a legacy URL, as the host that served it spoke `lang`.
 * Null when the path is not a legacy page (already new, a root file, unknown).
 *
 *   legacyToNew('/fr/city/lille', 'fr')              → /fr/france/lille
 *   legacyToNew('/fr/city/lille', 'en')              → /en/france/lille
 *   legacyToNew('/us/city/sf/budget', 'fr')          → /en/usa/san-francisco/budget
 *   legacyToNew('/fr/national/dette', 'fr')          → /fr/france/dette
 *   legacyToNew('/methode', 'en')                    → /en/method
 */
export function legacyToNew(pathname: string, lang: Lang): string | null {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return landingPath(lang);
  if (isRootFile(clean) || parsePath(clean)) return null;
  const segs = clean.split('/').filter(Boolean);
  const [a, b, c, ...rest] = segs;

  // Country trees: /fr/…, /us/…, /br/…
  const country = LEGACY_COUNTRY[a];
  if (country) {
    if (segs.length === 1) return countryPath(lang, country);
    if (b === 'city' && c) return countryPath(lang, country, PLACE_RENAMES[c] ?? c, ...rest);
    if (country === 'france' && b === 'national') return countryPath(lang, country, ...segs.slice(2));
    if (country === 'france' && b === 'compare') return countryPath(lang, country, 'comparer', ...segs.slice(2));
    return countryPath(lang, country, ...segs.slice(1));
  }

  // France's city comparator lived at the root.
  if (a === 'comparer') return countryPath(lang, 'france', 'comparer', ...segs.slice(1));

  // Site pages, whose legacy path is the French slug.
  const page = sitePageFromSlug(a, 'fr');
  if (page) return sitePagePath(page, lang, ...segs.slice(1));

  return null;
}
