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
export default function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const locale = localeFromHost(host);
  const { pathname, searchParams } = req.nextUrl;


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
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next internals, the analytics proxy, API routes and
  // files with an extension (images, sitemap/*.xml, robots.txt…). The edge
  // cache header lives in next.config.ts (headers()), not here.
  matcher: ['/((?!_next/|ingest/|api/|.*\\..*).*)'],
};
