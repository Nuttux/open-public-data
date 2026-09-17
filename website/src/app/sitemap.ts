import type { MetadataRoute } from 'next';
import { brMunicipiosGeneratedAt, listMunicipios } from '@/lib/br/municipios';
import { ANALYSES_PUBLIC } from '@/lib/analyses-visibility';
import { LANGS, SITE_ORIGIN, isIndexable, langOf, localize } from '@/lib/urls';
import { brEntityPaths, frEntityPaths, frenchCitySectionPaths, sfBrowsePaths } from '@/lib/seo/entity-paths';
import { hasDedicatedRoutes, listCities } from '@/lib/cities';
import { listAllCommunesMeta, loadAllCommunesGeneratedAt } from '@/lib/all-communes';
import fonctionsManifest from '@/data/communes-fonctions-manifest.json';
import { contratsSitemapSegments, loadContratsSitemapSegment, marchesManifestSlugs } from '@/lib/commune-marches';
import { MARCHES_EXPLORER_MIN } from '@/app/[lang]/france/[slug]/page-ville-data';
import { comparePilotPaths } from '@/lib/compare-pairs';
import { listDataDir } from '@/lib/data/read';
import {
  sfAuthorityFamilies,
  sfContractDeptSlugs,
  sfContractTypeSlugs,
} from '@/app/[lang]/usa/san-francisco/contracts/data';
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

// Segments are read per request, like before the single host: the data they
// enumerate is hydrated at runtime, not necessarily at build.
export const dynamic = 'force-dynamic';

/**
 * Every path below is LOGICAL (lib/urls.ts): /france/paris/budget, /methode.
 * `addressesOf` turns each into the addresses Google should index.
 */
const MAIN_ROUTES = [
  { path: '/', priority: 1.0 },
  { path: '/france/paris', priority: 0.95 },
  { path: '/brasil', priority: 0.8 }, // 2026-09-18 : the Brazil hub, every município behind its field
  { path: '/france', priority: 0.8 }, // 2026-09-18 : the France hub, every commune behind its field
  { path: '/france/paris/budget', priority: 0.9 },
  { path: '/france/paris/subventions', priority: 0.9 },
  { path: '/france/paris/investissements', priority: 0.9 },
  { path: '/france/paris/dette', priority: 0.8 },
  { path: '/france/paris/marches', priority: 0.8 },
  { path: '/france/paris/logement', priority: 0.8 },
  { path: '/france/daily-bread', priority: 0.9 },
  { path: '/france/dette', priority: 0.8 },
  { path: '/france/fiscalite', priority: 0.8 },
  { path: '/france/etat', priority: 0.8 },
  { path: '/france/budget', priority: 0.85 },
  { path: '/france/comparer', priority: 0.7 },
  ...(ANALYSES_PUBLIC ? [{ path: '/analyses', priority: 0.7 }] : []),
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
  { path: '/usa', priority: 0.7 },
  { path: '/usa/san-francisco', priority: 0.9 },
  { path: '/usa/san-francisco/budget', priority: 0.85 },
  { path: '/usa/san-francisco/budget/timeline', priority: 0.7 },
  { path: '/usa/san-francisco/contracts', priority: 0.85 },
  { path: '/usa/san-francisco/who-gets-paid', priority: 0.85 },
  { path: '/usa/san-francisco/payroll', priority: 0.85 },
  { path: '/usa/san-francisco/places', priority: 0.8 },
  { path: '/usa/san-francisco/sources', priority: 0.5 },
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

  add('/usa/san-francisco/payroll/family', sfPayrollFamilySlugs);
  add('/usa/san-francisco/payroll/role', sfPayrollRoleSlugs);
  add('/usa/san-francisco/payroll/area', sfPayrollAreaSlugs);
  add('/usa/san-francisco/payroll/dept', sfPayrollDeptSlugs);

  add('/usa/san-francisco/contracts/type', sfContractTypeSlugs);
  add('/usa/san-francisco/contracts/authority', sfAuthorityFamilies);
  add('/usa/san-francisco/contracts/dept', sfContractDeptSlugs);
  // One JSON per contract_no: the directory listing IS the key set.
  add('/usa/san-francisco/contracts/contract', () =>
    listDataDir('us/sf/contracts/fiche'),
  );

  add('/usa/san-francisco/who-gets-paid/category', sfCategorySlugs);
  add('/usa/san-francisco/who-gets-paid/payee', () =>
    loadSfPayeesIndex().map((p) => p.slug),
  );
  add('/usa/san-francisco/places/place', () => loadSfPlacesIndex().map((p) => p.slug));
  // the map's neighbourhoods and streets, as pages (lib/us/sf-city-pages.ts)
  add('/usa/san-francisco/the-city/neighbourhood', () => listHoodPages().map((h) => h.slug));
  add('/usa/san-francisco/the-city/street', () => listStreetPages().map((s) => s.slug));
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
      for (const s of depts) out.push(`/usa/san-francisco/budget/dept/${s}`);
      for (const s of services) out.push(`/usa/san-francisco/budget/service/${s}`);
      for (const s of characters) out.push(`/usa/san-francisco/budget/character/${s}`);
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

/**
 * Une page par couple commune × politique publique — « combien Pantin dépense
 * pour les écoles ». 27 246 adresses, déclarées depuis le manifeste engagé, donc
 * sans ouvrir les 3 248 fichiers du bucket au build.
 */
function fonctionPaths(): string[] {
  const communes = (fonctionsManifest as { communes: Record<string, { fonctions?: string[] }> }).communes;
  const out: string[] = [];
  for (const [slug, e] of Object.entries(communes)) {
    for (const f of e.fonctions ?? []) out.push(`/france/${slug}/fonction/${f}`);
  }
  return out;
}

/** Une page par couple commune × forme de dépense, pour les communes à axe fonction. */
function naturePaths(): string[] {
  const communes = (fonctionsManifest as { communes: Record<string, { natures?: string[] }> }).communes;
  const out: string[] = [];
  for (const [slug, e] of Object.entries(communes)) for (const n of e.natures ?? []) out.push(`/france/${slug}/nature/${n}`);
  return out;
}

/**
 * L'explorateur des marchés d'une commune, là où il existe : plus de
 * MARCHES_EXPLORER_MIN marchés au manifeste — la règle même de la route, qui
 * redirige les autres vers l'ancre #achats de la page ville. ~1 800 pages
 * qu'aucun sitemap ne déclarait (seules les 9 grandes villes l'étaient).
 */
function communeMarchesPaths(): string[] {
  return marchesManifestSlugs(MARCHES_EXPLORER_MIN)
    .filter((slug) => !hasDedicatedRoutes(slug))
    .map((slug) => `/france/${slug}/marches`);
}

// ─── Addresses ──────────────────────────────────────────────────────────────

type Entry = MetadataRoute.Sitemap[number];
type Page = Omit<Entry, 'url'> & { path: string };

/**
 * The indexed addresses of a logical path (lib/urls.ts): the page in its
 * country's language, plus its translations when it is a hub. Commune and
 * fiche translations are served but kept out of the index (`isIndexable`),
 * so they are not listed either.
 */
function addressesOf(path: string): string[] {
  const out: string[] = [];
  for (const l of LANGS) {
    const a = localize(path, l);
    // No Portuguese landing yet: /pt sends its readers to Recife ([lang]/page.tsx).
    if (a === '/pt') continue;
    if (langOf(a) === l && isIndexable(a) && !out.includes(a)) out.push(a);
  }
  return out;
}

function toEntries(pages: Page[]): Entry[] {
  return pages.flatMap(({ path, ...rest }) =>
    addressesOf(path).map((a) => ({ url: `${SITE_ORIGIN}${a}`, ...rest })),
  );
}

/** Main pages, the registry's cities and their sections, San Francisco's sections. */
function mainEntries(): Entry[] {
  return toEntries([
    ...MAIN_ROUTES.map(({ path, priority }) => ({ path, changeFrequency: 'weekly' as const, priority })),
    ...listCities()
      .filter((c) => c.slug !== 'paris')
      .map((c) => ({ path: `/france/${c.slug}`, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ...frenchCitySectionPaths().map((path) => ({ path, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...SF_SECTIONS.map(({ path, priority }) => ({ path, changeFrequency: 'weekly' as const, priority })),
  ]);
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

/** Every commune page but the registry's cities (already in the main segment). */
function communeEntries(): Entry[] {
  const topSlugs = new Set(listCities().map((c) => c.slug));
  const lastModified = communeModified();
  return toEntries(
    listAllCommunesMeta()
      .filter((c) => !topSlugs.has(c.slug))
      .map((c) => ({
        path: `/france/${c.slug}`,
        lastModified,
        changeFrequency: 'yearly' as const,
        // Lower priority for tail communes; higher for bigger pop.
        priority: c.pop > 50000 ? 0.4 : c.pop > 10000 ? 0.3 : 0.2,
      })),
  );
}

/** Every Brazilian município (2026-09-18), Portuguese address only : the
 *  manifest's date is the page's date, the priority follows the population. */
function brMunicipioEntries(): Entry[] {
  let list: ReturnType<typeof listMunicipios>;
  let stamp: string;
  try {
    list = listMunicipios();
    stamp = brMunicipiosGeneratedAt();
  } catch {
    return [];
  }
  const lastModified = stamp ? new Date(stamp) : undefined;
  return toEntries(
    list
      .filter((m) => m.slug !== 'recife-pe')
      .map((m) => ({
        path: `/brasil/${m.slug}`,
        lastModified,
        changeFrequency: 'yearly' as const,
        priority: (m.pop ?? 0) > 200000 ? 0.4 : (m.pop ?? 0) > 20000 ? 0.3 : 0.2,
      })),
  );
}

function entityEntries(list: () => string[]): () => Entry[] {
  return () => {
    let paths: string[];
    try {
      paths = list();
    } catch {
      return []; /* data not hydrated — the family is empty */
    }
    return toEntries(paths.map((path) => ({ path, changeFrequency: 'monthly' as const, priority: 0.4 })));
  };
}

// ─── Segments ───────────────────────────────────────────────────────────────

/**
 * The families, in segment order. New families go last, so the ids already
 * submitted keep their content. (The ids were renumbered once, on 2026-09-13,
 * when the three hosts became one.)
 */
/**
 * 2026-09-16: the sitemap says what deserves the crawl (lib/seo/entity-paths.ts).
 * Out of it, still served and linked: the San Francisco and Recife fiches (the
 * countries are paused), the commune × politique and commune × nature pages,
 * the commune contract fiches (CONTRATS). Back in when they earn their crawl.
 */
const FAMILIES: Array<() => Entry[]> = [
  mainEntries,
  communeEntries,
  entityEntries(frEntityPaths),
  entityEntries(communeMarchesPaths), // explorateur des marchés d'une commune
  entityEntries(comparePilotPaths), // comparaisons du pilote (lib/compare-pairs.ts)
  brMunicipioEntries, // 2026-09-18 : the 5 569 municípios, in Portuguese
];
// Kept for the day they come back; unused for now.
void sfEntityPaths; void brEntityPaths; void fonctionPaths; void naturePaths;

const _families = new Map<number, Entry[]>();
function family(i: number): Entry[] {
  const hit = _families.get(i);
  if (hit) return hit;
  const entries = FAMILIES[i]();
  // Only a complete list is cached, as for the SF enumerators.
  if (entries.length) _families.set(i, entries);
  return entries;
}

/**
 * Segment id → [family, chunk of CHUNK_SIZE URLs]. An empty family takes no
 * segment: Search Console counts an empty sitemap as an error.
 */
/**
 * Les fiches contrat des communes (les 5 plus gros contrats lisibles de chaque
 * commune, build_contrats_sitemap.py). Leurs segments sont déjà découpés à
 * l'export et lus dans le bucket à la demande ; leur nombre vient du manifeste
 * engagé, sans lecture. Ils passent après toutes les familles locales.
 */
const CONTRATS = -1;

function layout(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  FAMILIES.forEach((_, i) => {
    const chunks = Math.ceil(family(i).length / CHUNK_SIZE);
    for (let c = 0; c < chunks; c++) out.push([i, c]);
  });
  // The commune contract segments are not announced for now (see FAMILIES).
  void contratsSitemapSegments;
  return out;
}

/** The segment ids, which robots.txt declares. */
export function sitemapIds(): number[] {
  return layout().map((_, i) => i);
}

/**
 * Generate one sitemap per chunk of ~5 000 URLs.
 * Returns sitemap segment ids; Next.js then calls `sitemap(id)` for each.
 */
export async function generateSitemaps() {
  return sitemapIds().map((id) => ({ id }));
}

/**
 * Next hands this the segment id as a PROMISE of the route string, not the
 * number `generateSitemaps()` returned — see the generated handler in
 * next/dist/build/webpack/loaders/next-metadata-route-loader.js:
 *
 *     const data = await handler({ id: targetIdPromise })
 *
 * An earlier signature typed it `number`, so every numeric comparison silently
 * failed and every segment served an EMPTY <urlset>.
 */
export default async function sitemap({
  id: rawId,
}: {
  id: Promise<string> | string | number;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await rawId);
  if (!Number.isFinite(id)) return [];
  const slot = layout()[id];
  if (!slot) return [];
  const [f, chunk] = slot;
  if (f === CONTRATS) {
    const paths = await loadContratsSitemapSegment(chunk);
    return toEntries(paths.map((path) => ({ path, changeFrequency: 'monthly' as const, priority: 0.4 })));
  }
  return family(f).slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE);
}
