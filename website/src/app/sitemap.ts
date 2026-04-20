import type { MetadataRoute } from 'next';
import { CITY_SLUGS } from '@/lib/constants/cities';
import { SITE_URL } from '@/lib/seo';

/**
 * Top-level Paris routes — crawled by Google, indexed as canonical.
 */
const MAIN_ROUTES = [
  { path: '', priority: 1.0 },
  { path: '/budget', priority: 0.9 },
  { path: '/subventions', priority: 0.9 },
  { path: '/investissements', priority: 0.9 },
  { path: '/patrimoine', priority: 0.8 },
  { path: '/marches-publics', priority: 0.8 },
  { path: '/logements', priority: 0.8 },
  { path: '/evolution', priority: 0.8 },
  { path: '/tableau-de-bord', priority: 0.7 },
  { path: '/prevision', priority: 0.7 },
  { path: '/carte', priority: 0.7 },
  { path: '/blog', priority: 0.6 },
  { path: '/confidentialite', priority: 0.2 },
];

/** Per-city subroutes rendered under /[locale]/villes/[slug] */
const CITY_SUBPATHS = ['budget', 'patrimoine', 'marches', 'subventions'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const mainEntries: MetadataRoute.Sitemap = MAIN_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority,
  }));

  const villesRoots: MetadataRoute.Sitemap = (['fr', 'en'] as const).flatMap((locale) => [
    {
      url: `${SITE_URL}/${locale}/villes`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/${locale}/villes/carte`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/${locale}/villes/benchmarking`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/${locale}/villes/comparaison`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    },
  ]);

  const cityEntries: MetadataRoute.Sitemap = CITY_SLUGS.flatMap((slug) =>
    (['fr', 'en'] as const).flatMap((locale) =>
      CITY_SUBPATHS.map((sub) => ({
        url: `${SITE_URL}/${locale}/villes/${slug}/${sub}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: slug === 'paris' ? 0.5 : 0.4,
      })),
    ),
  );

  return [...mainEntries, ...villesRoots, ...cityEntries];
}
