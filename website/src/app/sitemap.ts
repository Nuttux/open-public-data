import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { listCities } from '@/lib/cities';
import { listAllCommunesMeta } from '@/lib/all-communes';

const MAIN_ROUTES = [
  { path: '', priority: 1.0 },
  { path: '/fr/city/paris/budget', priority: 0.9 },
  { path: '/fr/city/paris/subventions', priority: 0.9 },
  { path: '/fr/city/paris/investissements', priority: 0.9 },
  { path: '/fr/city/paris/dette', priority: 0.8 },
  { path: '/fr/city/paris/marches', priority: 0.8 },
  { path: '/fr/city/paris/logement', priority: 0.8 },
  { path: '/fr/national/daily-bread', priority: 0.9 },
  { path: '/fr/national', priority: 0.8 },
  { path: '/fr/national/dette', priority: 0.8 },
  { path: '/fr/national/fiscalite', priority: 0.8 },
  { path: '/fr/national/etat', priority: 0.8 },
  { path: '/fr/national/budget', priority: 0.85 },
  { path: '/comparer', priority: 0.7 },
  { path: '/analyses', priority: 0.7 },
  { path: '/methode', priority: 0.6 },
  { path: '/contact', priority: 0.4 },
  { path: '/confidentialite', priority: 0.2 },
];

const CHUNK_SIZE = 5000;

// Number of chunks needed to fit all communes into ~5k-URL sitemaps.
// Recomputed at module load — small cost, runs once at build/cold start.
function chunkCount(): number {
  const total = listAllCommunesMeta().length;
  return Math.max(1, Math.ceil(total / CHUNK_SIZE));
}

/**
 * Generate one sitemap per chunk of ~5 000 communes.
 * Returns sitemap segments ids; Next.js then calls `sitemap(id)` for each.
 */
export async function generateSitemaps() {
  // Segment 0 = main routes + top-10 cities.
  // Segments 1..N = communes-all chunks.
  const n = chunkCount();
  return Array.from({ length: n + 1 }, (_, i) => ({ id: i }));
}

export default function sitemap({ id }: { id: number }): MetadataRoute.Sitemap {
  const now = new Date();

  if (id === 0) {
    // Main pages + top-10 friendly slugs
    const main = MAIN_ROUTES.map(({ path, priority }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority,
    }));
    const cityRoutes = listCities()
      .filter((c) => c.slug !== 'paris')
      .map((c) => ({
        url: `${SITE_URL}/fr/city/${c.slug}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }));
    return [...main, ...cityRoutes];
  }

  // Communes chunks: id 1 = first 5k, id 2 = next 5k, etc.
  const all = listAllCommunesMeta();
  // Skip top-10 friendly slugs (already in id=0). Their slugs match the
  // bulk slugs since names are unique among the top 10.
  const topSlugs = new Set(listCities().map((c) => c.slug));
  const tail = all.filter((c) => !topSlugs.has(c.slug));

  const start = (id - 1) * CHUNK_SIZE;
  const slice = tail.slice(start, start + CHUNK_SIZE);

  return slice.map((c) => ({
    url: `${SITE_URL}/fr/city/${c.slug}`,
    lastModified: now,
    changeFrequency: 'yearly' as const,
    // Lower priority for tail communes; higher for bigger pop.
    priority: c.pop > 50000 ? 0.4 : c.pop > 10000 ? 0.3 : 0.2,
  }));
}
