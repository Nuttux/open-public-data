import type { MetadataRoute } from 'next';
import { readSiteLocale } from '@/lib/seo';
import { LOCALE_HOSTS } from '@/lib/site-locale';
import { INDEXNOW_KEY } from '@/lib/seo/indexnow';
import { sitemapIdsFor } from '@/app/sitemap';

/**
 * Robots directives
 * - Allow general crawling
 * - Explicitly block A/B test pages (/v2) and API routes
 * - Declare every sitemap segment
 *
 * `sitemap.ts` uses `generateSitemaps()`, so Next serves the segments at
 * /sitemap/0.xml … /sitemap/N.xml and nothing at /sitemap.xml. This file used
 * to declare /sitemap.xml, which 404s — so the segments (the ~35 000 commune
 * pages among them) were declared nowhere a crawler looks. Next reserves
 * /sitemap.xml for its own convention, so an index cannot be served there;
 * robots.txt accepts one Sitemap line per segment instead.
 *
 * The list is derived from the same family layout that produces the segments,
 * so the two cannot drift apart — and each host declares only the segments
 * that hold its URLs: an empty sitemap is an error in Search Console.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Per host (lib/site-locale.ts): the French host has no /us or /br, the
  // Portuguese host serves /br only — proxy.ts redirects the rest, and telling
  // crawlers up front saves them the hop.
  const locale = await readSiteLocale();
  const base = LOCALE_HOSTS[locale];
  const rule =
    locale === 'pt'
      ? // The IndexNow key must stay fetchable on the host it vouches for.
        { userAgent: '*', allow: ['/br', '/br/', `/${INDEXNOW_KEY}.txt`], disallow: ['/'] }
      : locale === 'fr'
        ? { userAgent: '*', allow: '/', disallow: ['/api/', '/v2', '/v2/', '/us', '/us/', '/br', '/br/'] }
        : { userAgent: '*', allow: '/', disallow: ['/api/', '/v2', '/v2/'] };
  return {
    rules: [rule],
    sitemap: sitemapIdsFor(locale).map((id) => `${base}/sitemap/${id}.xml`),
    host: base,
  };
}
