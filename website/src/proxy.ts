import { NextResponse, type NextRequest } from 'next/server';
import { hostForLocale, localeFromHost, localesForPath } from '@/lib/site-locale';

/**
 * Language by host (see lib/site-locale.ts).
 *
 * - Stamps `x-qipu-locale` on the request so server code (`readSiteLocale`)
 *   knows which language this host speaks.
 * - A path that has no version in this host's language (say /us on
 *   fr.qipu.org) lives on the English host: 308 there.
 * - Legacy `?lang=xx` links (QR codes, old footers) 308 to the host that
 *   speaks that language, param dropped.
 *
 * Static assets, the PostHog proxy and API routes are left alone by the matcher.
 */
/**
 * Edge cache for everything HTML the site serves. The pages render per
 * request (the language is read from the host header, so Next treats them as
 * dynamic and answers `Cache-Control: private, no-store`), which made an
 * entity page take 1–2 s to start and throttled how fast 200 000 URLs can be
 * crawled. Nothing is personal — no login, no cookie-driven content — so the
 * response for a URL on a host is the same for everyone. `Vercel-CDN-Cache-
 * Control` is read by Vercel's cache only (never forwarded to browsers), is
 * keyed on host + URL, and a deploy purges it, which is when the data changes.
 */
const EDGE_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800';
const NO_CACHE_PREFIXES = ['/chat', '/api'];

function cached(res: NextResponse, pathname: string): NextResponse {
  if (!NO_CACHE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    res.headers.set('Vercel-CDN-Cache-Control', EDGE_CACHE);
  }
  return res;
}

export default function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const locale = localeFromHost(host);
  const { pathname, searchParams } = req.nextUrl;

  // Sitemaps and robots are built per host from the host header alone
  // (readSiteLocale falls back to it); they only need the cache header —
  // the 35 000-commune segments are the most expensive responses we serve.
  if (pathname === '/robots.txt' || pathname.startsWith('/sitemap/')) {
    return cached(NextResponse.next(), pathname);
  }

  const lang = searchParams.get('lang');
  if (lang === 'fr' || lang === 'en' || lang === 'pt') {
    const url = req.nextUrl.clone();
    url.searchParams.delete('lang');
    url.host = hostForLocale(lang, host);
    return NextResponse.redirect(url, 308);
  }

  if (!localesForPath(pathname).includes(locale)) {
    const url = req.nextUrl.clone();
    url.host = hostForLocale('en', host);
    return NextResponse.redirect(url, 308);
  }

  const headers = new Headers(req.headers);
  headers.set('x-qipu-locale', locale);
  return cached(NextResponse.next({ request: { headers } }), pathname);
}

export const config = {
  // Everything except Next internals, the analytics proxy, API routes and
  // files with an extension (images…) — plus the sitemaps and robots.txt,
  // which have an extension but need the cache header.
  matcher: ['/((?!_next/|ingest/|api/|.*\\..*).*)', '/sitemap/:path*', '/robots.txt'],
};
