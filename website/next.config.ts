import type { NextConfig } from 'next';

/**
 * Next.js configuration — 06-fusion.
 *
 * Redirects map the old (pre-fusion) routes to the new canonical slugs.
 * Old aliases left in place for bookmarks and external links.
 */
const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Blog rename (kept from earlier)
      { source: '/blog', destination: '/analyses', permanent: true },
      { source: '/blog/:slug', destination: '/analyses/:slug', permanent: true },

      // Dead routes (pre-fusion) — point at the new Paris locations
      { source: '/evolution', destination: '/ville/paris/budget', permanent: true },
      { source: '/prevision', destination: '/ville/paris/budget', permanent: true },
      { source: '/bilan', destination: '/ville/paris/dette', permanent: true },
      { source: '/carte', destination: '/ville/paris/investissements', permanent: true },
      { source: '/tableau-de-bord', destination: '/', permanent: true },
      { source: '/v2', destination: '/', permanent: true },

      // Paris thematic pages migrated under /ville/paris/<theme>
      { source: '/budget', destination: '/ville/paris/budget', permanent: true },
      { source: '/budget/:path*', destination: '/ville/paris/budget/:path*', permanent: true },
      { source: '/marches-publics', destination: '/ville/paris/marches', permanent: true },
      { source: '/marches-publics/:path*', destination: '/ville/paris/marches/:path*', permanent: true },
      { source: '/qui-recoit', destination: '/ville/paris/subventions', permanent: true },
      { source: '/qui-recoit/:path*', destination: '/ville/paris/subventions/:path*', permanent: true },
      { source: '/subventions', destination: '/ville/paris/subventions', permanent: true },
      { source: '/dette-patrimoine', destination: '/ville/paris/dette', permanent: true },
      { source: '/dette-patrimoine/:path*', destination: '/ville/paris/dette/:path*', permanent: true },
      { source: '/patrimoine', destination: '/ville/paris/dette', permanent: true },
      { source: '/investissements', destination: '/ville/paris/investissements', permanent: true },
      { source: '/investissements/:path*', destination: '/ville/paris/investissements/:path*', permanent: true },
      { source: '/logement-social', destination: '/ville/paris/logement', permanent: true },
      { source: '/logement-social/:path*', destination: '/ville/paris/logement/:path*', permanent: true },
      { source: '/logements', destination: '/ville/paris/logement', permanent: true },
      { source: '/daily-bread', destination: '/ville/paris/daily-bread', permanent: true },
      { source: '/daily-bread/:path*', destination: '/ville/paris/daily-bread/:path*', permanent: true },

      // Paris is the showcase — keep its rich pages at the root, redirect
      // /ville/paris (canonical commune URL) to /. Other cities live at /ville/[slug].
      { source: '/ville/paris', destination: '/', permanent: true },

      // /c/[slug] → /ville/[slug] (pivot to commune namespace)
      // Specific Paris case kept first for clarity.
      { source: '/c/paris', destination: '/', permanent: true },
      { source: '/c/:slug', destination: '/ville/:slug', permanent: true },

      // Macro pages regrouped under /france
      { source: '/apu', destination: '/france', permanent: true },
      { source: '/etat', destination: '/france/etat', permanent: true },
      { source: '/dette', destination: '/france/dette', permanent: true },
      { source: '/fiscalite', destination: '/france/fiscalite', permanent: true },

    ];
  },
};

export default nextConfig;
