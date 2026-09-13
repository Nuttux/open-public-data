import { NextResponse, type NextRequest } from 'next/server';
import { communeAlias } from '@/lib/commune-aliases';
import {
  BIG_CITIES,
  COUNTRIES,
  COUNTRY_LANGS,
  FRANCE_NATIONAL_SECTIONS,
  LANGS,
  SITE_PAGE_SLUGS,
  type Country,
  type Lang,
  type SitePage,
  countryPath,
  isIndexable,
  langForLegacyHost,
  langsForPath,
  legacyToNew,
  parsePath,
  servedLang,
  sitePagePath,
  translatePath,
} from '@/lib/urls';

/**
 * One host, the language in the path (lib/urls.ts, decided 2026-09-13).
 *
 * - fr.qipu.org, pt.qipu.org, the apex and franceopendata.org: 308 to
 *   www.qipu.org, legacy path converted in the same hop.
 * - Legacy paths (/fr/city/…, /us/city/sf/…, /methode…): 308 to their new
 *   address, commune aliases resolved in the same hop.
 * - A logical path that escaped localization (/france/lille): 308 to its
 *   country's language.
 * - A page asked in a language it does not exist in: 308 to one it does.
 * - Translated site pages (/en/method): rewritten to the route that serves
 *   them (/en/methode); another language's spelling 308s to the right one.
 * - `/`: 307 to the visitor's language (cookie, then Accept-Language).
 * - Stamps `x-qipu-locale` so server code (`readSiteLocale`) knows the language,
 *   and `X-Robots-Tag: noindex` on the translations kept out of the index
 *   (`isIndexable`).
 *
 * Static assets, the PostHog proxy and API routes are left alone by the matcher.
 */

const CANONICAL_HOST = 'www.qipu.org';
export const LANG_COOKIE = 'qipu_lang';

/** The host this request belongs on: www for every qipu or legacy host, the bare dev host locally. */
function canonicalHost(host: string): string {
  const h = host.toLowerCase();
  if (/(^|\.)franceopendata\.org(:\d+)?$/.test(h) || /(^|\.)qipu\.org(:\d+)?$/.test(h)) return CANONICAL_HOST;
  // fr.localhost:3011 → localhost:3011 ; previews (*.vercel.app) stay as they are.
  return h.replace(/^(www|fr|pt)\.(?=localhost(:\d+)?$)/, '');
}

function preferredLang(req: NextRequest): Lang {
  const cookie = req.cookies.get(LANG_COOKIE)?.value as Lang | undefined;
  if (cookie && LANGS.includes(cookie)) return cookie;
  const ranked = (req.headers.get('accept-language') ?? '')
    .toLowerCase()
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.slice(0, 2) as Lang, q: q ? Number(q) : 1 };
    })
    .filter((x) => LANGS.includes(x.lang))
    .sort((a, b) => b.q - a.q);
  return ranked[0]?.lang ?? 'en';
}

/**
 * Commune aliases (scripts/build-commune-aliases.mjs): the natural address of a
 * commune whose name is shared. A clear winner → its suffixed slug, sub-path
 * kept; an ambiguous name → the choice page, sub-paths sent there.
 */
function resolveCommuneAlias(path: string): { path: string; status: 307 | 308 } | null {
  const m = /^\/(fr|en|pt)\/france\/([^/]+)(\/.*)?$/.exec(path);
  if (!m) return null;
  const [, lang, base, rest = ''] = m;
  if (FRANCE_NATIONAL_SECTIONS.includes(base) || BIG_CITIES.france.includes(base)) return null;
  const alias = communeAlias(base);
  if (alias?.kind === 'redirect') return { path: `/${lang}/france/${alias.to}${rest}`, status: 308 };
  if (alias?.kind === 'choose' && rest && rest !== '/') return { path: `/${lang}/france/${base}`, status: 307 };
  return null;
}

/** A site page written with another language's slug (/en/methode, /fr/method): its right spelling. */
function misspelledSitePage(path: string): string | null {
  const segs = path.split('/').filter(Boolean);
  const lang = segs[0] as Lang;
  if (!LANGS.includes(lang) || segs.length < 2) return null;
  for (const page of Object.keys(SITE_PAGE_SLUGS) as SitePage[]) {
    const slugs = SITE_PAGE_SLUGS[page];
    if (Object.values(slugs).includes(segs[1]) && slugs[lang] !== segs[1]) {
      return sitePagePath(page, lang, ...segs.slice(2));
    }
  }
  return null;
}

/** A logical country path served raw (/france/lille): the address in its country's language. */
function logicalCountryPath(path: string): string | null {
  const segs = path.split('/').filter(Boolean);
  const country = segs[0] as Country;
  if (!COUNTRIES.includes(country)) return null;
  return countryPath(COUNTRY_LANGS[country].native, country, ...segs.slice(1));
}

function redirectTo(req: NextRequest, host: string, path: string, status: 307 | 308, keepSearch: boolean) {
  const url = req.nextUrl.clone();
  url.host = host;
  if (host === CANONICAL_HOST) {
    url.protocol = 'https:';
    url.port = '';
  }
  url.pathname = path;
  if (!keepSearch) url.search = '';
  url.searchParams.delete('lang');
  return NextResponse.redirect(url, status);
}

export default function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const target = canonicalHost(host);
  const onLegacyHost = target !== host.toLowerCase();
  const { pathname, searchParams } = req.nextUrl;

  // Share cards and icons of a page (/fr/opengraph-image, …/twitter-image) sit
  // under the page's own address and have no extension. They follow their page:
  // an address stays, a legacy page moves with its card. Without this, the
  // landing's /fr/opengraph-image read as the legacy French tree and moved.
  const card = /\/((?:opengraph|twitter)-image(?:-[\w-]+)?|icon|apple-icon)$/.exec(pathname);
  if (card) {
    const page = pathname.slice(0, card.index) || '/';
    const movedPage = parsePath(page) ? null : legacyToNew(page, langForLegacyHost(host));
    if (movedPage || onLegacyHost) {
      return redirectTo(req, target, `${(movedPage ?? page).replace(/\/$/, '')}/${card[1]}`, 308, true);
    }
    return NextResponse.next();
  }

  const langParam = searchParams.get('lang') as Lang | null;
  const askedLang = langParam && LANGS.includes(langParam) ? langParam : null;

  // Root: the visitor's language.
  if (pathname === '/') {
    const lang = askedLang ?? (onLegacyHost ? langForLegacyHost(host) : preferredLang(req));
    const res = redirectTo(req, target, `/${lang}`, 307, true);
    res.headers.set('Vary', 'Accept-Language, Cookie');
    return res;
  }

  let path = pathname.replace(/\/+$/, '') || '/';
  let status: 307 | 308 = 308;
  let moved = onLegacyHost || Boolean(langParam);

  // Legacy address → new address, in the language the old host spoke (or ?lang=).
  if (!parsePath(path)) {
    // A misspelled site page first: /fr/method must not read as the legacy French tree (/fr/…).
    const next =
      misspelledSitePage(path) ?? legacyToNew(path, askedLang ?? langForLegacyHost(host)) ?? logicalCountryPath(path);
    if (next) {
      path = next;
      moved = true;
    }
  } else if (askedLang) {
    path = translatePath(path, askedLang) ?? path;
  }

  const parsed = parsePath(path);
  if (parsed) {
    const langs = langsForPath(path);
    if (!langs.includes(parsed.lang)) {
      path = translatePath(path, servedLang(parsed.lang, langs)) ?? path;
      moved = true;
    }
    const alias = resolveCommuneAlias(path);
    if (alias) {
      path = alias.path;
      status = alias.status;
      moved = true;
    }
  }

  if (moved || path !== pathname) {
    return redirectTo(req, target, path, status, status === 308);
  }

  const headers = new Headers(req.headers);
  const current = parsePath(pathname);
  if (current) headers.set('x-qipu-locale', current.lang);

  // Translated site page → the route that serves it (keyed by the French slug).
  const res =
    current?.kind === 'site' && SITE_PAGE_SLUGS[current.page][current.lang] !== current.page
      ? NextResponse.rewrite(
          new URL(['', current.lang, current.page, ...current.rest].join('/') + req.nextUrl.search, req.url),
          { request: { headers } },
        )
      : NextResponse.next({ request: { headers } });

  if (current && !isIndexable(pathname)) res.headers.set('X-Robots-Tag', 'noindex, follow');
  return res;
}

export const config = {
  // Everything except Next internals, the analytics proxy, API routes and
  // files with an extension (images, sitemap/*.xml, robots.txt…). The edge
  // cache header lives in next.config.ts (headers()), not here.
  matcher: ['/((?!_next/|ingest/|api/|.*\\..*).*)'],
};
