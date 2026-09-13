import type { NextConfig } from 'next';
import tracingIncludes from './tracing-includes.json';

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
  // Language by host (lib/site-locale.ts): fr.localhost / pt.localhost in dev.
  allowedDevOrigins: ['fr.localhost', 'pt.localhost', 'www.localhost'],
  /* A SECOND DEV SERVER WITHOUT KILLING THE FIRST. `next dev` takes a lock on
     .next/dev, so screenshotting a change while a dev server is already up
     meant stopping someone's session. NEXT_DIST_DIR moves the build directory
     for that one process; unset — which is every normal run, dev, build and
     deploy — this is exactly the default it always was. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // PostHog reverse proxy — analytics ride our own domain (/ingest/*) instead
  // of eu.i.posthog.com, so ad blockers can't drop events. Keeps visitor
  // counts accurate (they undercount ~20-40% otherwise for this audience).
  skipTrailingSlashRedirect: true,

  /**
   * EACH FUNCTION CARRIES THE FILES ITS ROUTE OPENS — AND NOTHING ELSE.
   *
   * Vercel ships every route as its own function, capped at 250 MB
   * uncompressed. Our loaders read public/ with paths built at run time
   * (lib/data/read.ts, lib/og/theme-image.ts…), which Next's tracer cannot
   * follow, so it packed all of public/ into every route and this file
   * subtracted what we guessed each route did not need. Both failure modes
   * happened in production: functions crossed the ceiling as the data grew
   * (13 Sep 2026, 260 MB, deploy refused), and excludes that reached a route
   * which did read the file 500'd it (25 Aug, 10 Sep).
   *
   * Now loaders build their public/ paths with `untracedPath()`
   * (lib/untraced-path.ts), which the tracer cannot follow, so it packs no
   * data directory on its own; and each route is handed the files it was
   * MEASURED opening — one exact-match key per route, generated into
   * tracing-includes.json by scripts/trace/:
   *
   *   npm run build
   *   npm run trace:crawl      a fresh server per route, every file access recorded
   *   npm run trace:includes   reads → globs (URL parameters and numbers become *)
   *   npm run build && npm run trace:check
   *
   * The check fails if a route read a file its function does not carry, if a
   * function carries data the tracer added by itself (a loader that skipped
   * untracedPath), or if a function is over the ceiling. Re-run the chain
   * after adding a loader, a route or a data directory. No excludes: an
   * exclude beats an include.
   */
  outputFileTracingIncludes: tracingIncludes.includes,

  // Edge cache for every HTML page (lib/site-locale.ts: nothing is personal —
  // no login, no cookie-driven content — so one response per host + URL).
  // Set HERE, in the function's own response, not in proxy.ts: headers a
  // middleware adds are merged after Vercel's cache lookup, so the cache never
  // saw them and every hit was a MISS (measured in prod 2026-09-09).
  // `Vercel-CDN-Cache-Control` is read by Vercel's cache only, never sent to
  // browsers, and a deploy purges it — which is when the data changes.
  async headers() {
    return [
      {
        source: '/((?!api/|chat|ingest/|_next/).*)',
        headers: [{ key: 'Vercel-CDN-Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://eu.i.posthog.com/:path*' },
    ];
  },
  async redirects() {
    return [
      // Liens courts des posts (LinkedIn, X…). LinkedIn remplace toute adresse
      // de plus de 26 caractères par un lnkd.in qui cache le nom du site ;
      // « qipu.org/chatelet » reste affiché tel quel. La redirection garde
      // l'hôte, donc la langue (www → anglais, fr.qipu.org → français), et
      // ajoute les UTM exigés pour attribuer la visite. Temporaire (307) :
      // le lien peut être repointé sans que les navigateurs l'aient mémorisé.
      {
        source: '/chatelet',
        destination: '/fr/city/paris/lieu/theatre-du-chatelet?utm_source=linkedin&utm_medium=social&utm_campaign=chatelet',
        permanent: false,
      },
      // Legacy domain. franceopendata.org still served the whole site with a
      // 200 (35 of 83 Google-referred human visits in Aug–Sep 2026): duplicate
      // content and authority split three ways. The old site was French, so
      // every path goes to fr.qipu.org; the proxy there sends /us and /br on
      // to www. A next.config redirect runs before the filesystem, so
      // robots.txt and the sitemaps redirect too.
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?franceopendata\\.org' }],
        destination: 'https://fr.qipu.org/:path*',
        permanent: true,
      },
      // The GPU renderer took over /the-city on 2026-08-30 and the Canvas one
      // was deleted with it. `/the-city-gl` was noindex and linked from
      // nowhere, so this is for the hand-pasted links only.
      { source: '/us/city/sf/the-city-gl', destination: '/us/city/sf/the-city', permanent: true },

      // Blog rename (kept from earlier)
      { source: '/blog', destination: '/analyses', permanent: true },
      { source: '/blog/:slug', destination: '/analyses/:slug', permanent: true },

      // Dead routes (pre-fusion) — point at the new Paris locations
      // Poste scindé le 2026-09-08 : l'ancienne adresse mène à la moitié « administration ».
      { source: '/fr/city/paris/budget/poste/personnel-admin', destination: '/fr/city/paris/budget/poste/administration-generale', permanent: true },
      // Dette scindée et recette renommée le 2026-09-09.
      { source: '/fr/city/paris/budget/poste/remboursement-dette', destination: '/fr/city/paris/budget/poste/remboursement-de-la-dette', permanent: true },
      { source: '/fr/city/paris/budget/poste/investissement', destination: '/fr/city/paris/budget/poste/recettes-d-investissement', permanent: true },
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
