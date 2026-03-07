import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy routes → locale-prefixed routes (for direct hits before middleware)
      { source: '/evolution', destination: '/fr/budget?tab=tendances', permanent: true },
      { source: '/prevision', destination: '/fr/budget?tab=vote-vs-execute', permanent: true },
      { source: '/bilan', destination: '/fr/patrimoine?tab=annuel', permanent: true },
      { source: '/carte', destination: '/fr/logements?tab=carte', permanent: true },
      // Locale-prefixed legacy routes
      { source: '/:locale(fr|en)/evolution', destination: '/:locale/budget?tab=tendances', permanent: true },
      { source: '/:locale(fr|en)/prevision', destination: '/:locale/budget?tab=vote-vs-execute', permanent: true },
      { source: '/:locale(fr|en)/bilan', destination: '/:locale/patrimoine?tab=annuel', permanent: true },
      { source: '/:locale(fr|en)/carte', destination: '/:locale/logements?tab=carte', permanent: true },
    ];
  },
};

export default nextConfig;
