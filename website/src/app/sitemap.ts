import type { MetadataRoute } from 'next';
import { SITE_URL, readSiteLocale } from '@/lib/seo';
import { LOCALE_HOSTS, localesForPath, type SiteLocale } from '@/lib/site-locale';
import { brEntityPaths, frEntityPaths, frenchCitySectionPaths, sfBrowsePaths } from '@/lib/seo/entity-paths';
import { listCities } from '@/lib/cities';
import { listAllCommunesMeta, loadAllCommunesGeneratedAt } from '@/lib/all-communes';
import fonctionsManifest from '@/data/communes-fonctions-manifest.json';
import { marchesManifestSlugs } from '@/lib/commune-marches';
import { MARCHES_EXPLORER_MIN } from '@/app/fr/city/[slug]/page-ville-data';
import { comparePilotPaths } from '@/lib/compare-pairs';
import { hasDedicatedRoutes } from '@/lib/cities';
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
import { listHoodPages, listStreetPages } from '@/lib/us/sf-city-pages';

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
let _sfEntityPaths: string[] | null = null;
function sfEntityPaths(): string[] {
  if (_sfEntityPaths) return _sfEntityPaths;
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
  // the map's neighbourhoods and streets, as pages (lib/us/sf-city-pages.ts)
  add('/us/city/sf/the-city/neighbourhood', () => listHoodPages().map((h) => h.slug));
  add('/us/city/sf/the-city/street', () => listStreetPages().map((s) => s.slug));
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

  // Only a complete list is cached: an unhydrated first call must not pin an
  // empty sitemap for the life of the function.
  if (out.length) _sfEntityPaths = out;
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
 * Une page par couple commune × politique publique — « combien Pantin dépense
 * pour les écoles ». 27 246 adresses, déclarées depuis le manifeste engagé, donc
 * sans ouvrir les 3 248 fichiers du bucket au build.
 */
let _fonctionPaths: string[] | null = null;
function fonctionPaths(): string[] {
  if (_fonctionPaths) return _fonctionPaths;
  const communes = (fonctionsManifest as { communes: Record<string, { fonctions?: string[] }> }).communes;
  const out: string[] = [];
  for (const [slug, e] of Object.entries(communes)) {
    for (const f of e.fonctions ?? []) out.push(`/fr/city/${slug}/fonction/${f}`);
  }
  _fonctionPaths = out;
  return out;
}
function fonctionChunkCount(): number {
  return Math.max(1, Math.ceil(fonctionPaths().length / CHUNK_SIZE));
}

/** Une page par couple commune × forme de dépense, pour les communes à axe fonction. */
let _naturePaths: string[] | null = null;
function naturePaths(): string[] {
  if (_naturePaths) return _naturePaths;
  const communes = (fonctionsManifest as { communes: Record<string, { natures?: string[] }> }).communes;
  const out: string[] = [];
  for (const [slug, e] of Object.entries(communes)) for (const n of e.natures ?? []) out.push(`/fr/city/${slug}/nature/${n}`);
  _naturePaths = out;
  return out;
}
function natureChunkCount(): number {
  return Math.max(1, Math.ceil(naturePaths().length / CHUNK_SIZE));
}

/**
 * L'explorateur des marchés d'une commune, là où il existe : plus de
 * MARCHES_EXPLORER_MIN marchés au manifeste — la règle même de la route, qui
 * redirige les autres vers l'ancre #achats de la page ville. ~1 800 pages
 * qu'aucun sitemap ne déclarait (seules les 9 grandes villes l'étaient).
 */
let _marchesPaths: string[] | null = null;
function communeMarchesPaths(): string[] {
  if (_marchesPaths) return _marchesPaths;
  _marchesPaths = marchesManifestSlugs(MARCHES_EXPLORER_MIN)
    .filter((slug) => !hasDedicatedRoutes(slug))
    .map((slug) => `/fr/city/${slug}/marches`);
  return _marchesPaths;
}
function marchesChunkCount(): number {
  return Math.max(1, Math.ceil(communeMarchesPaths().length / CHUNK_SIZE));
}

/**
 * Deux communes face à face, en pilote borné (lib/compare-pairs.ts) : une
 * comparaison par commune de 10 000 habitants ou plus, celle que sa page
 * propose, sous sa seule adresse canonique. Les autres comparaisons restent
 * hors sitemap.
 */
function comparePilotChunkCount(): number {
  return Math.max(1, Math.ceil(comparePilotPaths().length / CHUNK_SIZE));
}

/** Segments of the shared layout below, the one www and fr are served in. */
function globalSegmentCount(): number {
  return (
    1 +
    chunkCount() +
    sfChunkCount() +
    frChunkCount() +
    brChunkCount() +
    fonctionChunkCount() +
    natureChunkCount() +
    marchesChunkCount() +
    comparePilotChunkCount()
  );
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
  // Segments ..+P             = commune × politique publique.
  // Segments ..+Q             = commune × forme de dépense.
  // Segments ..+R             = explorateur des marchés d'une commune.
  // Segments ..+C             = comparaisons du pilote — les familles nouvelles
  //                             vont en dernier, pour que les ids déjà soumis ne bougent pas.
  // A packed host (PACKED_LOCALES) numbers its own segments from 0, so the
  // ids must cover whichever layout is longer.
  const count = Math.max(globalSegmentCount(), ...PACKED_LOCALES.map(packedChunkCount));
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

/** The entity families, in segment order after the communes chunks. */
function entityFamilies(): Array<[number, () => string[]]> {
  return [
    [sfChunkCount(), sfEntityPaths],
    [frChunkCount(), frEntityPaths],
    [brChunkCount(), brEntityPaths],
    [fonctionChunkCount(), fonctionPaths],
    [natureChunkCount(), naturePaths],
    [marchesChunkCount(), communeMarchesPaths],
    [comparePilotChunkCount(), comparePilotPaths],
  ];
}

/** The first path of a family, or undefined when its data is not hydrated. */
function firstPath(list: () => string[]): string | undefined {
  try {
    return list()[0];
  } catch {
    /* data not hydrated — the family is empty on every host */
    return undefined;
  }
}

/**
 * The segments of the shared layout that list at least one URL on `locale`'s
 * host. Every family is one language set (a family is one path shape), so its
 * first path decides for the whole range. robots.txt declared all 35 segments
 * on every host, and Google counts an empty sitemap as an error: pt.qipu.org
 * declared 34 empty ones, fr.qipu.org the 5 San Francisco ones.
 */
function globalIdsFor(locale: SiteLocale): number[] {
  const ids = [0];
  const n = chunkCount();
  if (localesForPath('/fr/city/lille').includes(locale)) {
    for (let i = 1; i <= n; i++) ids.push(i);
  }
  let offset = n;
  for (const [count, list] of entityFamilies()) {
    const first = firstPath(list);
    if (first && localesForPath(first).includes(locale)) {
      for (let i = 1; i <= count; i++) ids.push(offset + i);
    }
    offset += count;
  }
  return ids;
}

/**
 * Hosts laid out in their own segments instead of the shared layout.
 *
 * The shared layout is cut for www (every URL) and suits fr, which serves all
 * of it but San Francisco and Recife. pt.qipu.org serves only /br: in the
 * shared layout its ~15 000 URLs sit in segments 21-23 behind twenty segments
 * that hold nothing for it. Packed, the same URLs, in the same order, fill
 * segments 0..k-1 in equal parts — no gap, no near-empty file. www and fr keep
 * the shared layout, id for id: their segments are already submitted.
 */
const PACKED_LOCALES: readonly SiteLocale[] = ['pt'];

function isPacked(locale: SiteLocale): boolean {
  return PACKED_LOCALES.includes(locale);
}

function servedOn(locale: SiteLocale) {
  return (e: MetadataRoute.Sitemap[number]) =>
    localesForPath(e.url.slice(SITE_URL.length) || '/').includes(locale);
}

/** Every URL `locale`'s host serves, in shared-layout order. */
function hostEntries(locale: SiteLocale): MetadataRoute.Sitemap {
  const visible = servedOn(locale);
  const out = mainEntries().filter(visible);
  if (localesForPath('/fr/city/lille').includes(locale)) {
    out.push(...communeEntries(communeTail()));
  }
  for (const [, list] of entityFamilies()) {
    const first = firstPath(list);
    if (first && localesForPath(first).includes(locale)) {
      out.push(...list().map(entityEntry).filter(visible));
    }
  }
  return out;
}

/** Segments of a packed host: as few as CHUNK_SIZE allows, filled evenly. */
function packedChunkCount(locale: SiteLocale): number {
  return Math.max(1, Math.ceil(hostEntries(locale).length / CHUNK_SIZE));
}

function packedSegment(locale: SiteLocale, id: number): MetadataRoute.Sitemap {
  const all = hostEntries(locale);
  const k = Math.max(1, Math.ceil(all.length / CHUNK_SIZE));
  if (id < 0 || id >= k) return [];
  const size = Math.ceil(all.length / k);
  return all.slice(id * size, (id + 1) * size);
}

/**
 * The segments that list at least one URL on `locale`'s host — the ids
 * robots.txt declares there.
 */
export function sitemapIdsFor(locale: SiteLocale): number[] {
  if (!isPacked(locale)) return globalIdsFor(locale);
  const all = hostEntries(locale);
  if (!all.length) return [];
  return Array.from({ length: Math.ceil(all.length / CHUNK_SIZE) }, (_, i) => i);
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
  const entries = isPacked(locale) ? packedSegment(locale, id) : globalSegment(id);
  return entries
    .filter(servedOn(locale))
    .map((e) => ({ ...e, url: `${base}${e.url.slice(SITE_URL.length)}` }));
}

// lastmod is only written where a real date exists. Everything else used to
// carry `new Date()`, and the segments render per request: each fetch of a
// sitemap told the crawler its ~300 000 URLs had changed that very second.
// A site that does that has its lastmod ignored — for the pages whose date
// is real too. No date is honest; a wrong one costs the signal.

// Commune pages change when their export is regenerated, not when a crawler
// asks. Stamping them with `now` made every page claim it had just changed,
// on every crawl, which is how a site teaches Google to ignore its lastmod.
// Une page change quand sa DONNÉE change… ou quand la page elle-même change.
// La refonte du niveau 0 (9 septembre 2026) a refait les 35 000 pages ; sans
// cette date, le sitemap disait à Google qu'elles n'avaient pas bougé depuis
// l'export de mai, et il n'avait aucune raison de revenir.
function communeModified(): Date {
  const dataDate = loadAllCommunesGeneratedAt();
  const templateDate = new Date(COMMUNE_PAGE_TEMPLATE_DATE);
  return dataDate && new Date(dataDate) > templateDate ? new Date(dataDate) : templateDate;
}

/** Segment 0 of the shared layout: main pages + top-10 friendly slugs. */
function mainEntries(): MetadataRoute.Sitemap {
  const main = MAIN_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly' as const,
    priority,
  }));
  const cityRoutes = listCities()
    .filter((c) => c.slug !== 'paris')
    .map((c) => ({
      url: `${SITE_URL}/fr/city/${c.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }));
  const sfRoutes = SF_SECTIONS.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly' as const,
    priority,
  }));
  const frSections = frenchCitySectionPaths().map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
  return [...main, ...cityRoutes, ...frSections, ...sfRoutes];
}

function entityEntry(p: string): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}${p}`,
    changeFrequency: 'monthly' as const,
    priority: 0.4,
  };
}

type CommuneMeta = ReturnType<typeof listAllCommunesMeta>[number];

// Skip top-10 friendly slugs (already in id=0). Their slugs match the
// bulk slugs since names are unique among the top 10.
function communeTail(): CommuneMeta[] {
  const topSlugs = new Set(listCities().map((c) => c.slug));
  return listAllCommunesMeta().filter((c) => !topSlugs.has(c.slug));
}

function communeEntries(communes: CommuneMeta[]): MetadataRoute.Sitemap {
  const lastModified = communeModified();
  return communes.map((c) => ({
    url: `${SITE_URL}/fr/city/${c.slug}`,
    lastModified,
    changeFrequency: 'yearly' as const,
    // Lower priority for tail communes; higher for bigger pop.
    priority: c.pop > 50000 ? 0.4 : c.pop > 10000 ? 0.3 : 0.2,
  }));
}

/** One segment of the shared layout. */
function globalSegment(id: number): MetadataRoute.Sitemap {
  if (id === 0) return mainEntries();

  // Entity chunks sit after the communes chunks: SF, then FR, then BR.
  const nCommuneChunks = chunkCount();
  if (id > nCommuneChunks) {
    let offset = nCommuneChunks;
    for (const [count, list] of entityFamilies()) {
      if (id <= offset + count) {
        const start = (id - offset - 1) * CHUNK_SIZE;
        return list().slice(start, start + CHUNK_SIZE).map(entityEntry);
      }
      offset += count;
    }
    return [];
  }

  // Communes chunks: id 1 = first 5k, id 2 = next 5k, etc.
  const start = (id - 1) * CHUNK_SIZE;
  return communeEntries(communeTail().slice(start, start + CHUNK_SIZE));
}
