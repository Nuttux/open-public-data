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
      // Renamed fusion routes
      { source: '/subventions', destination: '/qui-recoit', permanent: true },
      { source: '/patrimoine', destination: '/dette-patrimoine', permanent: true },
      { source: '/logements', destination: '/logement-social', permanent: true },
      { source: '/blog', destination: '/analyses', permanent: true },
      { source: '/blog/:slug', destination: '/analyses/:slug', permanent: true },

      // Dead routes (pre-fusion)
      { source: '/evolution', destination: '/budget', permanent: true },
      { source: '/prevision', destination: '/budget', permanent: true },
      { source: '/bilan', destination: '/dette-patrimoine', permanent: true },
      { source: '/carte', destination: '/investissements', permanent: true },
      { source: '/tableau-de-bord', destination: '/', permanent: true },
      { source: '/v2', destination: '/', permanent: true },

      // Villes pages live under /[locale]/villes — redirect bare paths
      { source: '/villes', destination: '/fr/villes', permanent: false },
      { source: '/villes/:path*', destination: '/fr/villes/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
