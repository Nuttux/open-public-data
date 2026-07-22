import type { NextConfig } from 'next';

/**
 * Next.js configuration — 06-fusion.
 *
 * Redirects map the old (pre-fusion) routes to the new canonical slugs.
 * Old aliases left in place for bookmarks and external links.
 * ADR-0010: France routes live under /{country}/{level}/{name}
 * (/fr/city/paris, /fr/national) — legacy /ville/* and /france/* 301
 * directly to the final destination (no chains).
 */
const nextConfig: NextConfig = {
  // PostHog reverse proxy — analytics ride our own domain (/ingest/*) instead
  // of eu.i.posthog.com, so ad blockers can't drop events. Keeps visitor
  // counts accurate (they undercount ~20-40% otherwise for this audience).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://eu.i.posthog.com/:path*' },
    ];
  },
  async redirects() {
    return [
      // Blog rename (kept from earlier)
      { source: '/blog', destination: '/analyses', permanent: true },
      { source: '/blog/:slug', destination: '/analyses/:slug', permanent: true },

      // Dead routes (pre-fusion) — point at the new Paris locations
      { source: '/evolution', destination: '/fr/city/paris/budget', permanent: true },
      { source: '/prevision', destination: '/fr/city/paris/budget', permanent: true },
      { source: '/bilan', destination: '/fr/city/paris/dette', permanent: true },
      { source: '/carte', destination: '/fr/city/paris/investissements', permanent: true },
      { source: '/tableau-de-bord', destination: '/', permanent: true },
      { source: '/v2', destination: '/', permanent: true },

      // Paris thematic pages migrated under /fr/city/paris/<theme>
      { source: '/budget', destination: '/fr/city/paris/budget', permanent: true },
      { source: '/budget/:path*', destination: '/fr/city/paris/budget/:path*', permanent: true },
      { source: '/marches-publics', destination: '/fr/city/paris/marches', permanent: true },
      { source: '/marches-publics/:path*', destination: '/fr/city/paris/marches/:path*', permanent: true },
      { source: '/qui-recoit', destination: '/fr/city/paris/subventions', permanent: true },
      { source: '/qui-recoit/:path*', destination: '/fr/city/paris/subventions/:path*', permanent: true },
      { source: '/subventions', destination: '/fr/city/paris/subventions', permanent: true },
      { source: '/dette-patrimoine', destination: '/fr/city/paris/dette', permanent: true },
      { source: '/dette-patrimoine/:path*', destination: '/fr/city/paris/dette/:path*', permanent: true },
      { source: '/patrimoine', destination: '/fr/city/paris/dette', permanent: true },
      { source: '/investissements', destination: '/fr/city/paris/investissements', permanent: true },
      { source: '/investissements/:path*', destination: '/fr/city/paris/investissements/:path*', permanent: true },
      { source: '/logement-social', destination: '/fr/city/paris/logement', permanent: true },
      { source: '/logement-social/:path*', destination: '/fr/city/paris/logement/:path*', permanent: true },
      { source: '/logements', destination: '/fr/city/paris/logement', permanent: true },
      { source: '/daily-bread', destination: '/fr/national/daily-bread', permanent: true },
      { source: '/daily-bread/:path*', destination: '/fr/national/daily-bread/:path*', permanent: true },
      { source: '/ville/paris/daily-bread', destination: '/fr/national/daily-bread', permanent: true },
      { source: '/ville/paris/daily-bread/:path*', destination: '/fr/national/daily-bread/:path*', permanent: true },

      // Paris is the showcase — keep its rich pages at the root, redirect
      // /fr/city/paris (canonical commune URL) to /. Other cities live at
      // /fr/city/[slug]. Same behavior kept for the legacy /ville/paris.
      { source: '/ville/paris', destination: '/', permanent: true },
      { source: '/fr/city/paris', destination: '/', permanent: true },

      // /c/[slug] → /fr/city/[slug] (pivot to commune namespace)
      // Specific Paris case kept first for clarity.
      { source: '/c/paris', destination: '/', permanent: true },
      { source: '/c/:slug', destination: '/fr/city/:slug', permanent: true },

      // Macro pages regrouped under /fr/national
      { source: '/apu', destination: '/fr/national', permanent: true },
      { source: '/etat', destination: '/fr/national/etat', permanent: true },
      { source: '/dette', destination: '/fr/national/dette', permanent: true },
      { source: '/fiscalite', destination: '/fr/national/fiscalite', permanent: true },

      // Legacy URL-scheme catch-alls (ADR-0010) — keep LAST so the more
      // specific legacy sources above (e.g. /ville/paris/daily-bread) win.
      { source: '/ville/:path*', destination: '/fr/city/:path*', permanent: true },
      { source: '/france/:path*', destination: '/fr/national/:path*', permanent: true },

    ];
  },
};

export default nextConfig;
