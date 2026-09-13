import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_HOSTS, hostForLocale, localeFromHost, localesForPath } from '@/lib/site-locale';
import { communeAlias } from '@/lib/commune-aliases';

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

  // Legacy domain (franceopendata.org, still attached to the project): one
  // 308 to the qipu host that speaks the path's language. The old site was
  // French, so French-capable paths go to fr.qipu.org, the rest to www.
  // next.config's redirects() covers what this matcher skips (robots, sitemaps).
  if (/(^|\.)franceopendata\.org$/i.test(host)) {
    const target = localesForPath(pathname).includes('fr') ? LOCALE_HOSTS.fr : LOCALE_HOSTS.en;
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, target), 308);
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

  // Communes homonymes : l'adresse que tout le monde écrit (« /fr/city/montreuil »)
  // n'existe pas, toutes les homonymes portent leur code INSEE dans le slug
  // (scripts/build-commune-aliases.mjs). Une commune au moins dix fois plus
  // peuplée que la suivante : 308 vers elle, sous-chemin compris. Sinon la page
  // commune affiche le choix ; un sous-chemin sous un nom ambigu y renvoie.
  const commune = /^\/fr\/city\/([^/]+)(\/.*)?$/.exec(pathname);
  if (commune) {
    const [, base, rest = ''] = commune;
    const alias = communeAlias(base);
    if (alias?.kind === 'redirect') {
      const url = req.nextUrl.clone();
      url.pathname = `/fr/city/${alias.to}${rest}`;
      return NextResponse.redirect(url, 308);
    }
    if (alias?.kind === 'choose' && rest && rest !== '/') {
      const url = req.nextUrl.clone();
      url.pathname = `/fr/city/${base}`;
      url.search = '';
      return NextResponse.redirect(url, 307);
    }
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
