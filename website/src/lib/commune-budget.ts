import "server-only";
import { readCommuneJson } from "@/lib/commune-store";
import type { BudgetPageData } from "@/lib/fusion-data";
import manifest from "@/data/communes-budget-manifest.json";

/**
 * National commune budget-by-nature — DELIVERY.
 *
 * The per-commune JSON (~10 KB each, ~828 MB total for 35k communes) lives in a
 * PRIVATE GCS bucket, NOT the repo. The Next server reads a commune's file with
 * GCP credentials (ADC locally; a service account on the host) during render
 * (SSR/ISR), so the visitor only ever receives HTML. Only a small slug→years
 * manifest is committed, so the capability resolver stays local + instant.
 *
 * Private-by-design: a fork gets the code + manifest but NOT the data, and no
 * credentials — so it can't stand up a working instance without doing the real
 * work (own GCP project, run the pipeline, upload, configure creds). Self-host
 * is documented; fork-and-deploy is not a shortcut.
 */

type Manifest = {
  source: string;
  n_communes: number;
  bucket: string;
  communes: Record<string, number[]>; // slug → available years
};

const M = manifest as Manifest;

const BUCKET_PREFIX = process.env.COMMUNE_DATA_PREFIX ?? "communes-budget";

// ── Manifest-backed capability (local, sync) ───────────────────────────────
export function communeHasBudgetNature(slug: string): boolean {
  return Array.isArray(M.communes[slug]) && M.communes[slug].length > 0;
}
export function communeBudgetYears(slug: string): number[] {
  return M.communes[slug] ?? [];
}

// ── Remote budget JSON (server-side fetch, per-instance memo) ───────────────
type DrillItem = { name: string; value: number };
export type CompteItem = { compte: string; label: string; label_en: string; value: number };
export type CommuneComptes = { revenue: Record<string, CompteItem[]>; expenses: Record<string, CompteItem[]> };
type SankeyFull = {
  year: number;
  totals: { recettes: number; depenses: number; solde: number };
  nodes?: { name: string; category?: string }[];
  links: { source: string; target: string; value: number }[];
  bySection: Record<
    string,
    {
      Fonctionnement?: { total: number; items?: DrillItem[] };
      Investissement?: { total: number; items?: DrillItem[] };
    }
  >;
  drilldown?: { revenue?: Record<string, DrillItem[]>; expenses?: Record<string, DrillItem[]> };
  /** Détail des comptes derrière chaque groupe (bloc 1b), libellés simples. */
  comptes?: CommuneComptes;
};
type IndexFull = {
  availableYears: number[];
  latestYear: number;
  summary: { year: number; type_budget: "vote" | "execute"; depenses: number; recettes: number; solde: number }[];
};

const readJson = readCommuneJson;

/**
 * Load a commune's budget-by-nature page data from the bucket. Returns null if
 * the commune has no export (caller → notFound). Mirrors loadBudgetPageData's
 * transform so it feeds the same BudgetClient-family components.
 */
export async function loadCommuneBudget(
  slug: string,
  requestedYear?: number,
): Promise<{ data: BudgetPageData; availableYears: number[]; year: number } | null> {
  const index = await readJson<IndexFull>(`${BUCKET_PREFIX}/${slug}/budget_index.json`);
  if (!index) return null;
  const year =
    requestedYear && index.availableYears.includes(requestedYear) ? requestedYear : index.latestYear;
  const sankey = await readJson<SankeyFull>(`${BUCKET_PREFIX}/${slug}/budget_sankey_${year}.json`);
  if (!sankey) return null;
  const prev = await readJson<SankeyFull>(`${BUCKET_PREFIX}/${slug}/budget_sankey_${year - 1}.json`);

  const central =
    sankey.nodes?.find((n) => n.category === "central")?.name ?? `Budget ${slug}`;

  const byYear = Object.fromEntries(index.summary.map((s) => [s.year, s]));
  const previousYear =
    index.summary.map((s) => s.year).filter((y) => y < year).sort((a, b) => b - a)[0] ?? null;
  const ref = previousYear ? byYear[previousYear] : undefined;
  const deltaDepensesPct = ref ? ((sankey.totals.depenses - ref.depenses) / ref.depenses) * 100 : 0;

  let fonctionnement = 0;
  let investissement = 0;
  for (const cat of Object.values(sankey.bySection)) {
    fonctionnement += cat.Fonctionnement?.total ?? 0;
    investissement += cat.Investissement?.total ?? 0;
  }
  const epargneBrute = Math.max(0, fonctionnement > 0 ? 0 : 0); // not surfaced by the commune client

  const prevDepByLabel = new Map<string, number>();
  for (const l of prev?.links ?? []) {
    if (l.source === central) prevDepByLabel.set(l.target, l.value);
  }

  const topDepenses = sankey.links
    .filter((l) => l.source === central)
    .map((l) => {
      const cat = sankey.bySection[l.target];
      const items = [...(cat?.Fonctionnement?.items ?? []), ...(cat?.Investissement?.items ?? [])];
      const subPostes = items.slice().sort((a, b) => b.value - a.value).slice(0, 12);
      const prevVal = prevDepByLabel.get(l.target);
      const deltaPct = prevVal && prevVal > 0 ? ((l.value - prevVal) / prevVal) * 100 : null;
      return { label: l.target, value: l.value, deltaPct, subPostes };
    })
    .sort((a, b) => b.value - a.value);

  const recettesBreakdown = sankey.links
    .filter((l) => l.target === central)
    .map((l) => {
      const items = sankey.drilldown?.revenue?.[l.source] ?? [];
      const subSources = items.slice().sort((a, b) => b.value - a.value).slice(0, 12);
      return { label: l.source, value: l.value, subSources };
    })
    .sort((a, b) => b.value - a.value);

  const yearsSummary = index.summary
    .map((s) => ({ year: s.year, type: s.type_budget, depenses: s.depenses, recettes: s.recettes, solde: s.solde }))
    .sort((a, b) => a.year - b.year);

  // Chaque poste année par année : les sankeys publiés pour la commune (deux à
  // six fichiers de ~10 Ko, mémoïsés par instance) — la courbe de chaque ligne.
  const series: BudgetPageData["series"] = {};
  for (const y of [...index.availableYears].sort((a, b) => a - b)) {
    const sk = y === year ? sankey : y === year - 1 ? prev : await readJson<SankeyFull>(`${BUCKET_PREFIX}/${slug}/budget_sankey_${y}.json`);
    const type = byYear[y]?.type_budget ?? "execute";
    for (const l of sk?.links ?? []) {
      const label = l.source === central ? l.target : l.target === central ? l.source : null;
      if (label && l.value > 0) (series[label] ??= []).push({ year: y, value: l.value, type });
    }
  }

  const data: BudgetPageData = {
    year,
    previousYear: previousYear ?? year,
    recettes: sankey.totals.recettes,
    depenses: sankey.totals.depenses,
    solde: sankey.totals.solde,
    deltaDepensesPct,
    fonctionnement,
    investissement,
    epargneBrute,
    topDepenses,
    recettesBreakdown,
    sankeyNodes: sankey.nodes ?? [],
    sankeyLinks: sankey.links,
    yearsSummary,
    // Le loader commune ne lit que l'année courante et la précédente (fichiers
    // distants) : la série par poste se limite à ces deux points, et la
    // répartition par type de dépense n'existe pas côté DGFiP (axe nature).
    series,
    flowSplit: [],
    flowCoveragePct: 0,
    comptes: sankey.comptes ?? { revenue: {}, expenses: {} },
  };
  return { data, availableYears: index.availableYears, year };
}
