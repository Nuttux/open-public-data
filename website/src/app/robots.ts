import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { generateSitemaps } from '@/app/sitemap';

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
 * The list is derived from the same `generateSitemaps()` that produces the
 * segments, so the two cannot drift apart.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const segments = await generateSitemaps();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/v2', '/v2/'],
      },
    ],
    sitemap: segments.map(({ id }) => `${SITE_URL}/sitemap/${id}.xml`),
    host: SITE_URL,
  };
}
