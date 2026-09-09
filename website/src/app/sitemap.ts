import type { MetadataRoute } from 'next';
import { SITE_URL, readSiteLocale } from '@/lib/seo';
import { LOCALE_HOSTS, localesForPath } from '@/lib/site-locale';
import { brEntityPaths, frEntityPaths, frenchCitySectionPaths, sfBrowsePaths } from '@/lib/seo/entity-paths';
import { listCities } from '@/lib/cities';
import { listAllCommunesMeta, loadAllCommunesGeneratedAt } from '@/lib/all-communes';
import { listDataDir } from '@/lib/data/read';
import {
  sfAuthorityFamilies,
  sfContractDeptSlugs,
  sfContractTypeSlugs,
} from '@/app/us/city/sf/contracts/data';
import {
  defaultFiscalYear,
  loadSfBudgetBreakdown,
  loadSfBudgetByYear,
} from '@/lib/us/sf-budget-data';
import { characterSlug, deptSlug, serviceSlug } from '@/lib/us/sf-budget-slugs';
import { sfPayrollFamilySlugs } from '@/lib/us/sf-payroll-family';
import {
  sfPayrollAreaSlugs,
  sfPayrollDeptSlugs,
  sfPayrollRoleSlugs,
} from '@/lib/us/sf-payroll-entities';
import { sfCategorySlugs } from '@/lib/us/sf-spending';
import { loadSfPayeesIndex } from '@/lib/us/sf-payees-data';
import { loadSfPlacesIndex } from '@/lib/us/sf-places-data';

const MAIN_ROUTES = [
  { path: '', priority: 1.0 },
  { path: '/fr/city/paris/budget', priority: 0.9 },
  { path: '/fr/city/paris/subventions', priority: 0.9 },
  { path: '/fr/city/paris/investissements', priority: 0.9 },
  { path: '/fr/city/paris/dette', priority: 0.8 },
  { path: '/fr/city/paris/marches', priority: 0.8 },
  { path: '/fr/city/paris/logement', priority: 0.8 },
  { path: '/fr/national/daily-bread', priority: 0.9 },
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

/**
 * San Francisco section pages. The US side was absent from the sitemap
 * entirely — hub, sections and every fiche — so none of it was discoverable
 * from search even though it is all statically rendered.
 */
const SF_SECTIONS = [
  { path: '/us', priority: 0.7 },
  { path: '/us/city/sf', priority: 0.9 },
  { path: '/us/city/sf/budget', priority: 0.85 },
  { path: '/us/city/sf/budget/timeline', priority: 0.7 },
  { path: '/us/city/sf/contracts', priority: 0.85 },
  { path: '/us/city/sf/who-gets-paid', priority: 0.85 },
  { path: '/us/city/sf/payroll', priority: 0.85 },
  { path: '/us/city/sf/places', priority: 0.8 },
  { path: '/us/city/sf/sources', priority: 0.5 },
];

/**
 * Every SF entity fiche, as paths.
 *
 * Each enumerator is guarded: on a branch where public/data is not hydrated
 * the loaders throw, and a sitemap that fails the build is worse than one
 * missing a section. A dropped enumerator costs discoverability, not a deploy.
 *
 * The dept × character drill is deliberately absent: it is stored columnar and
 * reconstructing its keys here would duplicate the fiche loader's decoding for
 * no gain — those pages are reachable from their department fiche.
 */
function sfEntityPaths(): string[] {
  const out: string[] = [];
  const add = (prefix: string, slugs: () => string[]) => {
    try {
      for (const s of slugs()) out.push(`${prefix}/${s}`);
    } catch {
      /* data not hydrated on this branch — skip this family */
    }
  };

  add('/us/city/sf/payroll/family', sfPayrollFamilySlugs);
  add('/us/city/sf/payroll/role', sfPayrollRoleSlugs);
  add('/us/city/sf/payroll/area', sfPayrollAreaSlugs);
  add('/us/city/sf/payroll/dept', sfPayrollDeptSlugs);

  add('/us/city/sf/contracts/type', sfContractTypeSlugs);
  add('/us/city/sf/contracts/authority', sfAuthorityFamilies);
  add('/us/city/sf/contracts/dept', sfContractDeptSlugs);
  // One JSON per contract_no: the directory listing IS the key set.
  add('/us/city/sf/contracts/contract', () =>
    listDataDir('us/sf/contracts/fiche'),
  );

  add('/us/city/sf/who-gets-paid/category', sfCategorySlugs);
  add('/us/city/sf/who-gets-paid/payee', () =>
    loadSfPayeesIndex().map((p) => p.slug),
  );
  add('/us/city/sf/places/place', () => loadSfPlacesIndex().map((p) => p.slug));
  // Browse index of the payees (lib/seo/browse.ts).
  try {
    out.push(...sfBrowsePaths());
  } catch {
    /* as above */
  }

  // Budget facets come from the breakdown of the default (last closed) year —
  // the same file and the same slug helpers the fiche routes resolve against.
  try {
    const fy = defaultFiscalYear(loadSfBudgetByYear());
    const bd = loadSfBudgetBreakdown(fy);
    if (bd?.drill.available) {
      const depts = new Set<string>();
      const services = new Set<string>();
      const characters = new Set<string>();
      for (const side of ['spending', 'revenue'] as const) {
        for (const d of bd.departments[side]) depts.add(deptSlug(d.code));
        for (const g of bd.org_groups[side]) services.add(serviceSlug(g.label));
        for (const c of bd.characters[side]) characters.add(characterSlug(c.code));
      }
      for (const s of depts) out.push(`/us/city/sf/budget/dept/${s}`);
      for (const s of services) out.push(`/us/city/sf/budget/service/${s}`);
      for (const s of characters) out.push(`/us/city/sf/budget/character/${s}`);
    }
  } catch {
    /* as above */
  }

  return out;
}

/** Date de la dernière refonte de la page commune : à avancer à chaque
 *  changement de gabarit qui touche toutes les communes. */
const COMMUNE_PAGE_TEMPLATE_DATE = "2026-09-09";

const CHUNK_SIZE = 5000;

// Number of chunks needed to fit all communes into ~5k-URL sitemaps.
// Recomputed at module load — small cost, runs once at build/cold start.
function chunkCount(): number {
  const total = listAllCommunesMeta().length;
  return Math.max(1, Math.ceil(total / CHUNK_SIZE));
}

function sfChunkCount(): number {
  return Math.max(1, Math.ceil(sfEntityPaths().length / CHUNK_SIZE));
}

// French (Paris + Marseille) entity fiches, then the Brazilian ones — the
// ~30 000 pages that were declared nowhere until 2026-09-08.
function frChunkCount(): number {
  return Math.max(1, Math.ceil(frEntityPaths().length / CHUNK_SIZE));
}
function brChunkCount(): number {
  return Math.max(1, Math.ceil(brEntityPaths().length / CHUNK_SIZE));
}

/**
 * Generate one sitemap per chunk of ~5 000 URLs.
 * Returns sitemap segment ids; Next.js then calls `sitemap(id)` for each.
 */
export async function generateSitemaps() {
  // Segment 0                 = main routes + top-10 cities + SF section pages.
  // Segments 1..N             = communes-all chunks.
  // Segments N+1..N+M         = San Francisco entity fiches.
  // Segments N+M+1..N+M+F     = French entity fiches (Paris, Marseille).
  // Segments N+M+F+1..+B      = Brazilian pages (Recife).
  const n = chunkCount();
  const m = sfChunkCount();
  const f = frChunkCount();
  const b = brChunkCount();
  return Array.from({ length: n + m + f + b + 1 }, (_, i) => ({ id: i }));
}

/**
 * Next hands this the segment id as a PROMISE of the route string, not the
 * number `generateSitemaps()` returned — see the generated handler in
 * next/dist/build/webpack/loaders/next-metadata-route-loader.js:
 *
 *     const data = await handler({ id: targetIdPromise })
 *
 * The previous signature typed it `number`, so every numeric comparison below
 * silently failed: `id === 0` was false, `id > n` was false, and
 * `(id - 1) * CHUNK_SIZE` was NaN — which made the final `slice(NaN, NaN)`
 * return nothing. Every segment therefore served an EMPTY <urlset>, so the
 * ~35 000 commune pages were declared to no crawler at all.
 */
export default async function sitemap({
  id: rawId,
}: {
  id: Promise<string> | string | number;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await rawId);
  if (!Number.isFinite(id)) return [];

  // One sitemap per host, in that host's language (lib/site-locale.ts): the
  // French host lists the French twins of every French-authored page and
  // nothing from /us; the Portuguese host lists /br only.
  const locale = await readSiteLocale();
  const base = LOCALE_HOSTS[locale];
  const entries = await segment(id);
  return entries
    .filter((e) => localesForPath(e.url.slice(SITE_URL.length) || '/').includes(locale))
    .map((e) => ({ ...e, url: `${base}${e.url.slice(SITE_URL.length)}` }));
}

async function segment(id: number): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Commune pages change when their export is regenerated, not when a crawler
  // asks. Stamping them with `now` made every page claim it had just changed,
  // on every crawl, which is how a site teaches Google to ignore its lastmod.
  // Une page change quand sa DONNÉE change… ou quand la page elle-même change.
  // La refonte du niveau 0 (9 septembre 2026) a refait les 35 000 pages ; sans
  // cette date, le sitemap disait à Google qu'elles n'avaient pas bougé depuis
  // l'export de mai, et il n'avait aucune raison de revenir.
  const dataDate = loadAllCommunesGeneratedAt();
  const templateDate = new Date(COMMUNE_PAGE_TEMPLATE_DATE);
  const communeModified = dataDate && new Date(dataDate) > templateDate ? new Date(dataDate) : templateDate;

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
    const sfRoutes = SF_SECTIONS.map(({ path, priority }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority,
    }));
    const frSections = frenchCitySectionPaths().map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    return [...main, ...cityRoutes, ...frSections, ...sfRoutes];
  }

  // Entity chunks sit after the communes chunks: SF, then FR, then BR.
  const nCommuneChunks = chunkCount();
  if (id > nCommuneChunks) {
    const families: Array<[number, () => string[]]> = [
      [sfChunkCount(), sfEntityPaths],
      [frChunkCount(), frEntityPaths],
      [brChunkCount(), brEntityPaths],
    ];
    let offset = nCommuneChunks;
    for (const [count, list] of families) {
      if (id <= offset + count) {
        const start = (id - offset - 1) * CHUNK_SIZE;
        return list()
          .slice(start, start + CHUNK_SIZE)
          .map((p) => ({
            url: `${SITE_URL}${p}`,
            lastModified: now,
            changeFrequency: 'monthly' as const,
            priority: 0.4,
          }));
      }
      offset += count;
    }
    return [];
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
    lastModified: communeModified,
    changeFrequency: 'yearly' as const,
    // Lower priority for tail communes; higher for bigger pop.
    priority: c.pop > 50000 ? 0.4 : c.pop > 10000 ? 0.3 : 0.2,
  }));
}
