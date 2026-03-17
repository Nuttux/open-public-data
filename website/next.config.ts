import type { NextConfig } from 'next';

/**
 * Next.js configuration for the Paris Budget Dashboard.
 *
 * Redirects map legacy routes to the new entity-based tab architecture:
 *   /evolution  → /budget?tab=tendances
 *   /prevision  → /budget?tab=vote-vs-execute
 *   /bilan      → /patrimoine?tab=annuel
 *   /carte      → /logements?tab=carte
 */
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/evolution',
        destination: '/budget?tab=tendances',
        permanent: true,
      },
      {
        source: '/prevision',
        destination: '/budget?tab=vote-vs-execute',
        permanent: true,
      },
      {
        source: '/bilan',
        destination: '/patrimoine?tab=annuel',
        permanent: true,
      },
      {
        source: '/carte',
        destination: '/logements?tab=carte',
        permanent: true,
      },
      // Villes pages live under /[locale]/villes — redirect bare paths
      {
        source: '/villes',
        destination: '/fr/villes',
        permanent: false,
      },
      {
        source: '/villes/:path*',
        destination: '/fr/villes/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
