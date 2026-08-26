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

  /**
   * A PARIS PAGE DOES NOT NEED SAN FRANCISCO'S MAP.
   *
   * `lib/data/read.ts` and `lib/og/theme-image.ts` read files with
   * `path.join(process.cwd(), "public", ...)` — DYNAMIC paths that Next's file
   * tracing cannot resolve. It therefore does the safe thing and pulls the
   * whole of `public/data` into every route that can reach those modules.
   *
   * Measured on this build: `fr/city/paris/lieu/[slug]` traces 350.9 MB, of
   * which 245.9 MB is `public/data` and **111.4 MB of that is `us`** — the SF
   * city map, which no French page reads. 161 of 229 route bundles were over
   * Vercel's 250 MB uncompressed ceiling and the production build failed on
   * `br/city/recife/contratos/[id]/opengraph-image` at 334.82 MB.
   *
   * The SF map added 2,738 files and took `public/data/us` to 126 MB, so this
   * threshold was crossed by that work. The excludes below are the narrow,
   * provable half of the fix: a route under one country never reads another
   * country's data directory, so those bytes cannot be needed at runtime.
   *
   * This is NOT the whole fix. The right repair is to make the reads
   * statically analysable — or to declare per-route
   * `outputFileTracingIncludes` — so a route carries only the files it opens,
   * rather than everything under `public/data` minus what we thought to
   * subtract. That is a refactor, and it is written up rather than rushed.
   */
  /**
   * THE THREE FILES THE SERVER OPENS, named so no exclude can take them.
   *
   * `us/city/sf/the-city/page.tsx` reads exactly manifest.json,
   * blocks/block-index.json and blocks/accuracy.json (lines 68-71). Everything
   * else under that directory is fetched by the browser. Includes take
   * precedence over excludes, so this is the belt to the excludes' braces —
   * and it is here because the excludes DID strip these three and 500 the page
   * in production.
   */
  outputFileTracingIncludes: {
    /**
     * Share cards. Each opengraph-image is its own function, and it opens the
     * same exports its page does — but a route added after the excludes above
     * inherits them without inheriting anyone's includes, so the files have to
     * be named here. The BR cards proved it in production: the two whose
     * loaders use the throwing `readDataJson` returned 500, while the one on
     * `readDataJsonOrNull` degraded quietly to a card with no figure.
     *
     * The theme photos are read by path at render time, so tracing cannot see
     * them either.
     */
    '/br/city/recife/lugares/[slug]/opengraph-image': [
      './public/data/br/recife/places.json',
      './public/data/br/recife/place_editorial.json',
      './public/data/br/recife/place_obras.json',
      './public/img/themes/**',
      './public/img/br/recife/places/**',
    ],
    '/br/city/recife/contratos/[id]/opengraph-image': [
      './public/data/br/recife/contratos.json',
      './public/img/themes/**',
    ],
    '/br/city/recife/quem-recebe/[cnpj]/opengraph-image': [
      './public/data/br/recife/recipients.json',
      './public/img/themes/**',
    ],
    '/us/city/sf/places/place/[slug]/opengraph-image': [
      './public/data/us/sf/places/**',
      './public/img/themes/**',
      './public/img/us/sf/places/**',
    ],
    '/us/city/sf/who-gets-paid/payee/[slug]/opengraph-image': [
      './public/data/us/sf/payees/**',
      './public/img/themes/**',
    ],
    '/us/city/sf/contracts/contract/[no]/opengraph-image': [
      './public/data/us/sf/contracts/**',
      './public/img/themes/**',
    ],
    '/fr/city/paris/lieu/[slug]/opengraph-image': [
      './public/data/lieux/**',
      './public/img/themes/**',
      './public/img/lieux/**',
    ],
    '/fr/city/paris/marches/contrat/[numero]/opengraph-image': [
      './public/data/marches-publics/**',
      './public/img/themes/**',
    ],
    '/fr/city/paris/marches/fournisseur/[siren]/opengraph-image': [
      './public/data/marches-publics/**',
      './public/img/themes/**',
    ],
    '/fr/city/paris/subventions/association/[slug]/opengraph-image': [
      './public/data/subventions/**',
      './public/img/themes/**',
    ],
    '/us/city/sf/the-city': [
      './public/data/us/sf/city/manifest.json',
      './public/data/us/sf/city/blocks/block-index.json',
      './public/data/us/sf/city/blocks/accuracy.json',
    ],
  },

  /**
   * TWO FACTS ABOUT HOW NEXT APPLIES THESE (collect-build-traces.js):
   *   1. keys are matched with picomatch({ contains: true }) — so the '/' key
   *      matches EVERY route, not just the landing;
   *   2. excludes are applied AFTER includes, so an exclude always wins.
   * Excluding `public/data/br/**` under '/' therefore stripped Recife's own
   * JSON from the Recife routes: from the 25 Aug deploy every /br page 500'd
   * in production (a clean webpack build traced 351 files for
   * /br/city/recife/quem-recebe, none under public/data/br). Recife's ~17 MB
   * now ride along everywhere; the SF city map (the 126 MB problem) stays out.
   */
  outputFileTracingExcludes: {
    '/fr/**': ['./public/data/us/**', './public/data/br/**'],
    '/us/**': ['./public/data/br/**', './public/data/marseille/**',
               './public/data/subventions/**', './public/data/marches-publics/**',
               // 23.7 MB of French commune records. A San Francisco page has
               // no use for them.
               './public/data/communes-all/**',
               // The city map is fetched by the BROWSER, tier by tier, as the
               // camera moves. The server reads exactly three files out of
               // this directory — manifest.json, blocks/block-index.json and
               // blocks/accuracy.json (page.tsx:68-71) — and every other byte
               // under it is a static asset served over HTTP, never opened by
               // a function. 16 MB of per-street records, 13 MB of .qc tiers
               // and the per-block shards were being carried into every US
               // route for nothing.
               './public/data/us/sf/city/blocks/street/**',
               // The per-block shards are NOT excluded. `block-*.json` also
               // matches block-index.json, which page.tsx:69 reads, and
               // Turbopack cannot parse a `[0-9]` character class — it panics
               // on the whole pattern set. Left in the bundle deliberately.
               './public/data/us/sf/city/bldg/**',
               './public/data/us/sf/city/strt/**',
               './public/data/us/sf/city/tree/**',
               './public/data/us/sf/city/face/**',
               './public/data/us/sf/city/water1/**'],
    '/br/**': ['./public/data/us/**', './public/data/marseille/**',
               './public/data/subventions/**', './public/data/marches-publics/**'],
    // The `(...)` intercepting drawer routes sit at the app root, so neither
    // '/fr/**' nor '/us/**' matches them and they were carrying the whole city
    // map at 252 MB. None of them opens a map file.
    //
    // There is NO '/page' key here. There was, and it took production down:
    // it did not match only the root page, it stripped
    // public/data/us/sf/city/** from routes that read it, and
    // /us/city/sf/the-city returned a Server Components render error on a live
    // site. An exclude whose blast radius you have not measured is a deletion.
    '/@drawer/**': ['./public/data/us/sf/city/**'],
    // The two remaining routes over the ceiling, named ONE BY ONE rather than
    // by a glob whose reach I would be guessing at. Neither opens a map file.
    '/': ['./public/data/us/sf/city/**'],
    '/comparer': ['./public/data/us/sf/city/**'],
    // The chart and poster endpoints render an image from a figure they are
    // handed. Neither opens the city map.
    '/api/**': ['./public/data/us/sf/city/**'],
  },

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
