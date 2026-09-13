import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/urls';
import { sitemapIds } from '@/app/sitemap';

// Read per request, like the segments it declares (sitemap.ts).
export const dynamic = 'force-dynamic';

/**
 * Robots directives — one host since 2026-09-13 (lib/urls.ts): fr.qipu.org,
 * pt.qipu.org and franceopendata.org redirect their robots.txt here
 * (next.config.ts).
 * - Allow general crawling; block the A/B test pages (/v2) and API routes.
 * - Declare every sitemap segment. `sitemap.ts` uses `generateSitemaps()`, so
 *   Next serves /sitemap/0.xml … /sitemap/N.xml and nothing at /sitemap.xml
 *   (reserved for its own convention): robots.txt accepts one Sitemap line per
 *   segment instead. The ids come from the layout that produces the segments,
 *   so the two cannot drift apart.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/v2', '/v2/'] }],
    sitemap: sitemapIds().map((id) => `${SITE_ORIGIN}/sitemap/${id}.xml`),
    host: SITE_ORIGIN,
  };
}
