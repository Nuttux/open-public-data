import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

const MAIN_ROUTES = [
  { path: '', priority: 1.0 },
  { path: '/budget', priority: 0.9 },
  { path: '/qui-recoit', priority: 0.9 },
  { path: '/investissements', priority: 0.9 },
  { path: '/dette-patrimoine', priority: 0.8 },
  { path: '/marches-publics', priority: 0.8 },
  { path: '/logement-social', priority: 0.8 },
  { path: '/analyses', priority: 0.7 },
  { path: '/methode', priority: 0.6 },
  { path: '/contact', priority: 0.4 },
  { path: '/confidentialite', priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return MAIN_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority,
  }));
}
