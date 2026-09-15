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
        source: '/((?!api/|chat|[a-z]{2}/chat|ingest/|_next/).*)',
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
      // « qipu.org/chatelet » reste affiché tel quel. Un lien par langue,
      // /<sujet> pour l'anglais et /fr/<sujet> pour le français, vers l'hôte
      // unique en un saut, avec les UTM qui attribuent la visite. Temporaire
      // (307) : le lien peut être repointé sans que les navigateurs l'aient
      // mémorisé. Les redirections passent avant le proxy, donc sur tout hôte.
      {
        source: '/chatelet',
        destination: 'https://www.qipu.org/en/france/paris/lieu/theatre-du-chatelet?utm_source=linkedin&utm_medium=social&utm_campaign=chatelet',
        permanent: false,
      },
      {
        source: '/fr/chatelet',
        destination: 'https://www.qipu.org/fr/france/paris/lieu/theatre-du-chatelet?utm_source=linkedin&utm_medium=social&utm_campaign=chatelet',
        permanent: false,
      },
      // Post « bénéficiaires à null » : le corps du post mène aux bénéficiaires
      // retrouvés, le commentaire à l'explication qui raconte la méthode.
      {
        source: '/beneficiaires',
        destination: 'https://www.qipu.org/en/france/paris/subventions?utm_source=linkedin&utm_medium=social&utm_campaign=beneficiaires',
        permanent: false,
      },
      {
        source: '/fr/beneficiaires',
        destination: 'https://www.qipu.org/fr/france/paris/subventions?utm_source=linkedin&utm_medium=social&utm_campaign=beneficiaires',
        permanent: false,
      },
      {
        source: '/beneficiaires/article',
        destination: 'https://www.qipu.org/en/analyses/beneficiaires-fantomes-2020-2021-portail?utm_source=linkedin&utm_medium=social&utm_campaign=beneficiaires',
        permanent: false,
      },
      {
        source: '/fr/beneficiaires/article',
        destination: 'https://www.qipu.org/fr/analyses/beneficiaires-fantomes-2020-2021-portail?utm_source=linkedin&utm_medium=social&utm_campaign=beneficiaires',
        permanent: false,
      },
      // Page de Draguignan, envoyée en message privé (présentation par un proche).
      {
        source: '/draguignan',
        destination: 'https://www.qipu.org/en/france/draguignan?utm_source=intro&utm_medium=message&utm_campaign=draguignan',
        permanent: false,
      },
      {
        source: '/fr/draguignan',
        destination: 'https://www.qipu.org/fr/france/draguignan?utm_source=intro&utm_medium=message&utm_campaign=draguignan',
        permanent: false,
      },
      // Legacy hosts (fr.qipu.org, pt.qipu.org, the apex, franceopendata.org).
      // Their pages are sent on by proxy.ts, which converts the path and picks
      // the language the old host spoke in one hop. Files never reach the proxy
      // (robots.txt, sitemaps, the IndexNow key), so they go here: www serves
      // the only robots.txt and sitemaps since 2026-09-13 (lib/urls.ts).
      {
        source: '/:file(.*\\.[a-zA-Z0-9]+)',
        has: [{ type: 'host', value: '((www\\.)?franceopendata\\.org|(fr|pt)\\.qipu\\.org|qipu\\.org)' }],
        destination: 'https://www.qipu.org/:file',
        permanent: true,
      },
      // The GPU renderer took over /the-city on 2026-08-30 and the Canvas one
      // was deleted with it. `/the-city-gl` was noindex and linked from
      // nowhere, so this is for the hand-pasted links only (the legacy
      // /us/city/sf/the-city-gl reaches it through the proxy).
      { source: '/en/usa/san-francisco/the-city-gl', destination: '/en/usa/san-francisco/the-city', permanent: true },

      // Blog rename (kept from earlier). The blog was French.
      { source: '/blog', destination: '/fr/analyses', permanent: true },
      { source: '/blog/:slug', destination: '/fr/analyses/:slug', permanent: true },

      // Poste scindé le 2026-09-08 : l'ancienne adresse mène à la moitié « administration ».
      // Dette scindée et recette renommée le 2026-09-09. (The legacy /fr/city/paris/…
      // spelling reaches these through the proxy, in its host's language.)
      { source: '/:lang(fr|en)/france/paris/budget/poste/personnel-admin', destination: '/:lang/france/paris/budget/poste/administration-generale', permanent: true },
      { source: '/:lang(fr|en)/france/paris/budget/poste/remboursement-dette', destination: '/:lang/france/paris/budget/poste/remboursement-de-la-dette', permanent: true },
      { source: '/:lang(fr|en)/france/paris/budget/poste/investissement', destination: '/:lang/france/paris/budget/poste/recettes-d-investissement', permanent: true },

      // Dead routes of the French-only site (pre-fusion) — point at the Paris pages, in French.
      { source: '/evolution', destination: '/fr/france/paris/budget', permanent: true },
      { source: '/prevision', destination: '/fr/france/paris/budget', permanent: true },
      { source: '/bilan', destination: '/fr/france/paris/dette', permanent: true },
      { source: '/carte', destination: '/fr/france/paris/investissements', permanent: true },
      { source: '/tableau-de-bord', destination: '/', permanent: true },
      { source: '/v2', destination: '/', permanent: true },
      { source: '/budget', destination: '/fr/france/paris/budget', permanent: true },
      { source: '/budget/:path*', destination: '/fr/france/paris/budget/:path*', permanent: true },
      { source: '/marches-publics', destination: '/fr/france/paris/marches', permanent: true },
      { source: '/marches-publics/:path*', destination: '/fr/france/paris/marches/:path*', permanent: true },
      { source: '/qui-recoit', destination: '/fr/france/paris/subventions', permanent: true },
      { source: '/qui-recoit/:path*', destination: '/fr/france/paris/subventions/:path*', permanent: true },
      { source: '/subventions', destination: '/fr/france/paris/subventions', permanent: true },
      { source: '/dette-patrimoine', destination: '/fr/france/paris/dette', permanent: true },
      { source: '/dette-patrimoine/:path*', destination: '/fr/france/paris/dette/:path*', permanent: true },
      { source: '/patrimoine', destination: '/fr/france/paris/dette', permanent: true },
      { source: '/investissements', destination: '/fr/france/paris/investissements', permanent: true },
      { source: '/investissements/:path*', destination: '/fr/france/paris/investissements/:path*', permanent: true },
      { source: '/logement-social', destination: '/fr/france/paris/logement', permanent: true },
      { source: '/logement-social/:path*', destination: '/fr/france/paris/logement/:path*', permanent: true },
      { source: '/logements', destination: '/fr/france/paris/logement', permanent: true },
      { source: '/daily-bread', destination: '/fr/france/daily-bread', permanent: true },
      { source: '/daily-bread/:path*', destination: '/fr/france/daily-bread/:path*', permanent: true },
      { source: '/ville/paris/daily-bread', destination: '/fr/france/daily-bread', permanent: true },
      { source: '/ville/paris/daily-bread/:path*', destination: '/fr/france/daily-bread/:path*', permanent: true },
      { source: '/ville/paris', destination: '/fr/france/paris', permanent: true },
      { source: '/c/paris', destination: '/fr/france/paris', permanent: true },
      { source: '/c/:slug', destination: '/fr/france/:slug', permanent: true },
      { source: '/apu', destination: '/fr/france', permanent: true },
      { source: '/etat', destination: '/fr/france/etat', permanent: true },
      { source: '/dette', destination: '/fr/france/dette', permanent: true },
      { source: '/fiscalite', destination: '/fr/france/fiscalite', permanent: true },
      // Legacy URL-scheme catch-all (ADR-0010) — keep LAST so the more specific
      // sources above (e.g. /ville/paris/daily-bread) win. /fr/city/…, /us/…,
      // /br/… and /france/… are converted by proxy.ts.
      { source: '/ville/:path*', destination: '/fr/france/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
