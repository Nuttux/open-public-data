import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Robots directives
 * - Allow general crawling
 * - Explicitly block A/B test pages (/v2) and API routes
 * - Declare the sitemap so AI crawlers (GPTBot, PerplexityBot, etc.) can index
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/v2', '/v2/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
