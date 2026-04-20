import fs from "node:fs";
import path from "node:path";

/** INSEE — population Paris, stable enough to inline. */
export const PARIS_POPULATION = 2_133_111;

type BudgetIndex = {
  availableYears: number[];
  latestYear: number;
  latestCompleteYear: number;
  completeYears?: number[];
  partialYears?: number[];
  votedYears?: number[];
  summary: { year: number; type_budget: "vote" | "execute"; recettes: number; depenses: number; solde: number }[];
};

export function loadBudgetIndex() {
  return readJson<BudgetIndex>("budget_index.json");
}

// ─── Voté vs exécuté ───────────────────────────────────────────────────────

type VoteGlobalRate = {
  annee: number;
  type: "comparaison" | "previsionnel";
  depenses_vote?: number;
  depenses_execute?: number;
  taux_global?: number;
  vote_fonct?: number;
  execute_fonct?: number;
  taux_fonct?: number;
  vote_inves?: number;
  execute_inves?: number;
  taux_inves?: number;
};

type VoteEcartRow = {
  thematique: string;
  section?: string;
  sens_flux?: string;
  ecart_moyen_pct?: number;
  vote_total?: number;
  execute_total?: number;
  taux_execution?: number;
  nb_annees?: number;
};

type VoteVsExecute = {
  coverage: { comparison_years: number[]; forecast_years: number[] };
  global_rates: VoteGlobalRate[];
  ecart_ranking?: VoteEcartRow[];
};

export type VoteExecuteRow = {
  year: number;
  voted: number;
  executed: number | null;
  tauxGlobal: number | null;
};

export type VoteExecuteData = {
  comparisonYears: number[];
  forecastYears: number[];
  rows: VoteExecuteRow[];
  topEcarts: { thematique: string; section: string; ecartMoyenPct: number; voteTotal: number; executeTotal: number }[];
};

export function loadVoteExecute(): VoteExecuteData {
  const raw = readJson<VoteVsExecute>("vote_vs_execute.json");
  const rows: VoteExecuteRow[] = raw.global_rates.map((g) => ({
    year: g.annee,
    voted: g.depenses_vote ?? 0,
    executed: g.type === "comparaison" ? g.depenses_execute ?? null : null,
    tauxGlobal: g.type === "comparaison" ? g.taux_global ?? null : null,
  })).sort((a, b) => a.year - b.year);

  const topEcarts = (raw.ecart_ranking ?? [])
    .filter((r) => (r.nb_annees ?? 0) >= 3)
    .slice(0, 10)
    .map((r) => ({
      thematique: r.thematique,
      section: r.section ?? "",
      ecartMoyenPct: r.ecart_moyen_pct ?? 0,
      voteTotal: r.vote_total ?? 0,
      executeTotal: r.execute_total ?? 0,
    }));

  return {
    comparisonYears: raw.coverage.comparison_years,
    forecastYears: raw.coverage.forecast_years,
    rows,
    topEcarts,
  };
}

type SankeyLink = { source: string; target: string; value: number };
type BudgetSankey = {
  year: number;
  totals: { recettes: number; depenses: number; solde: number };
  links: SankeyLink[];
};

const DATA_DIR = path.join(process.cwd(), "public", "data");

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

function readJsonOrNull<T>(file: string): T | null {
  try {
    return readJson<T>(file);
  } catch {
    return null;
  }
}

// ─── Enrichment caches (written by pipeline/scripts/enrich/*) ──────────────

type VulgarizationCache<T> = { items: Record<string, T>; generated_at?: string; model?: string };

export type MarcheVulgarization = {
  objet_clair: string;
  quoi_concretement: string;
  pourquoi_ca_compte: string;
  year?: number;
  model?: string;
};

export type SubventionVulgarization = {
  activite_claire: string;
  pourquoi_subvention: string;
  impact_citoyen: string;
  model?: string;
};

export type SireneCompany = {
  siren: string;
  nom: string;
  forme_juridique?: string;
  libelle_activite?: string;
  activite_principale?: string;
  commune?: string;
  code_postal?: string;
  adresse?: string;
  tranche_effectifs?: string;
  date_creation?: string;
  etat?: string;
  dirigeants?: { nom: string; prenom: string; qualite: string }[];
};

// Cache loaders are memoised at module level — these JSON blobs are small
// and re-reading them on every request wastes IO.
let _marchesVulg: Record<string, MarcheVulgarization> | null = null;
let _subvVulg: Record<string, SubventionVulgarization> | null = null;
let _sirene: Record<string, SireneCompany> | null = null;

export function loadMarcheVulgarization(numero: string): MarcheVulgarization | null {
  if (_marchesVulg === null) {
    const data = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>("enrichment/vulgarization_marches.json");
    _marchesVulg = data?.items ?? {};
  }
  return _marchesVulg[numero] ?? null;
}

export function loadSubventionVulgarization(name: string): SubventionVulgarization | null {
  if (_subvVulg === null) {
    const data = readJsonOrNull<VulgarizationCache<SubventionVulgarization>>("enrichment/vulgarization_subventions.json");
    _subvVulg = data?.items ?? {};
  }
  return _subvVulg[name] ?? null;
}

export function loadSirene(siren: string): SireneCompany | null {
  if (_sirene === null) {
    const data = readJsonOrNull<VulgarizationCache<SireneCompany>>("enrichment/sirene_companies.json");
    _sirene = data?.items ?? {};
  }
  return _sirene[siren] ?? null;
}

export type LandingStats = {
  year: number;
  totalDepenses: number;
  perCapitaYear: number;
  perCapitaMonth: number;
  deltaVsLastExecutedPct: number;
  deltaVsLastExecutedPerMonth: number;
  lastExecutedYear: number;
  breakdown: { label: string; annual: number; perMonth: number }[];
};

/**
 * Loads the figures powering the landing hero + scale section.
 * Server-side only — reads JSON straight from /public/data.
 */
export function loadLandingStats(): LandingStats {
  const index = readJson<BudgetIndex>("budget_index.json");
  const year = index.latestYear;
  const lastExecutedYear = index.latestCompleteYear;

  const sankey = readJson<BudgetSankey>(`budget_sankey_${year}.json`);
  const totalDepenses = sankey.totals.depenses;

  const byYear = Object.fromEntries(index.summary.map((s) => [s.year, s]));
  const ref = byYear[lastExecutedYear];
  const deltaAbs = ref ? totalDepenses - ref.depenses : 0;
  const deltaVsLastExecutedPct = ref ? (deltaAbs / ref.depenses) * 100 : 0;
  const deltaVsLastExecutedPerMonth = deltaAbs / PARIS_POPULATION / 12;

  const perCapitaYear = totalDepenses / PARIS_POPULATION;
  const perCapitaMonth = perCapitaYear / 12;

  const breakdown = sankey.links
    .filter((l) => l.source === "Budget Paris")
    .map((l) => ({
      label: l.target,
      annual: l.value,
      perMonth: l.value / PARIS_POPULATION / 12,
    }))
    .sort((a, b) => b.annual - a.annual);

  return {
    year,
    totalDepenses,
    perCapitaYear,
    perCapitaMonth,
    deltaVsLastExecutedPct,
    deltaVsLastExecutedPerMonth,
    lastExecutedYear,
    breakdown,
  };
}

/** "5 495" — French-locale integer. */
export const fmtInt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

/** "15,06" — French-locale with up to 2 decimals. */
export const fmtDec = (n: number, digits = 2) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** Billions short-form: 11_722_400_172 → "11,72" (use with " Md €" unit). */
export const fmtBillions = (n: number, digits = 2) => fmtDec(n / 1_000_000_000, digits);

/** Millions short-form: 312_000_000 → "312" (use with " M €" unit). */
export const fmtMillions = (n: number, digits = 0) => fmtDec(n / 1_000_000, digits);

/** Automatic compact: < 1 M → "xxx k €"; < 1 B → "xxx M €"; else "x,xx Md €". */
export function fmtCompactEur(n: number): { value: string; unit: string } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return { value: fmtDec(n / 1_000_000_000), unit: "Md €" };
  if (abs >= 1_000_000) return { value: fmtDec(n / 1_000_000, 0), unit: "M €" };
  if (abs >= 1_000) return { value: fmtDec(n / 1_000, 0), unit: "k €" };
  return { value: fmtInt(n), unit: "€" };
}

export type BudgetPageData = {
  year: number;
  previousYear: number;
  recettes: number;
  depenses: number;
  solde: number;
  deltaDepensesPct: number;
  fonctionnement: number;
  investissement: number;
  epargneBrute: number;
  topDepenses: {
    label: string;
    value: number;
    /** Top sous-postes (fonctionnement + investissement fusionnés, triés par montant desc). */
    subPostes: { name: string; value: number }[];
  }[];
  recettesBreakdown: {
    label: string;
    value: number;
    /** Top sous-sources (depuis drilldown.revenue), triées par montant desc. */
    subSources: { name: string; value: number }[];
  }[];
  sankeyNodes: { name: string; category?: string }[];
  sankeyLinks: { source: string; target: string; value: number }[];
  yearsSummary: {
    year: number;
    type: "vote" | "execute";
    depenses: number;
    recettes: number;
    solde: number;
  }[];
};

type BudgetSankeyFull = {
  year: number;
  totals: { recettes: number; depenses: number; solde: number };
  nodes?: { name: string; category?: string }[];
  links: SankeyLink[];
  bySection: Record<
    string,
    {
      Fonctionnement?: { total: number; items?: { name: string; value: number }[] };
      Investissement?: { total: number; items?: { name: string; value: number }[] };
    }
  >;
  drilldown?: {
    revenue?: Record<string, { name: string; value: number }[]>;
    expenses?: Record<string, { name: string; value: number }[]>;
  };
};

// ─── Subventions ───────────────────────────────────────────────────────────

type SubvIndex = {
  availableYears: number[];
  totalsByYear: Record<string, { montant_total: number; nb_subventions: number }>;
};

type SubvBen = {
  year: number;
  total_montant: number;
  nb_beneficiaires: number;
  data: Array<{
    beneficiaire: string;
    thematique?: string | null;
    montant_total: number;
    nb_subventions: number;
    nature_juridique?: string | null;
  }>;
};

type SubvTreemap = {
  year: number;
  data: Array<{ name: string; montant_total?: number; montant?: number; value?: number; nb?: number; nb_subventions?: number }>;
};

export type QuiRecoitData = {
  year: number;
  previousYear: number;
  total: number;
  nbSubventions: number;
  nbBeneficiaires: number;
  medianSubvention: number;
  topThemeName: string | null;
  topThemeAmount: number;
  concentrationTop10Pct: number;
  deltaMontantPct: number;
  deltaNbPct: number;
  top10: {
    rank: number;
    name: string;
    theme: string | null;
    amount: number;
    nb: number;
    history: { year: number; amount: number }[];
  }[];
  byTheme: {
    theme: string;
    amount: number;
    count: number;
    topBen: { name: string; amount: number; nb: number }[];
  }[];
  allBeneficiaires: {
    name: string;
    theme: string | null;
    amount: number;
    nb: number;
    history: { year: number; amount: number }[];
  }[];
  yearsSummary: { year: number; total: number; count: number }[];
  availableThemes: string[];
  movers: {
    hausses: { name: string; amount: number; delta: number }[];
    baisses: { name: string; amount: number; delta: number }[];
  };
};

export function loadQuiRecoitIndex() {
  return readJson<SubvIndex>("subventions/index.json");
}

// ─── Association fiche ────────────────────────────────────────────────────

export type AssociationFiche = {
  name: string;
  theme: string | null;
  natureJuridique: string | null;
  totalAmount: number;
  subventionCount: number;
  yearsActive: number[];
  byYear: { year: number; amount: number; count: number }[];
  byTheme: { theme: string; amount: number; count: number }[];
  /** Ranking within primary thematic (1-indexed) + total count. Null if theme missing. */
  themeRank: { rank: number; total: number; theme: string } | null;
  /** Year-over-year swings ≥ 20% on the byYear timeline — used to annotate the chart. */
  highlights: { year: number; pct: number; kind: "up" | "down" }[];
};

/**
 * Load an association by its decoded name. Scans every available year
 * and aggregates totals. Name must match exactly (case-insensitive).
 */
export function loadAssociation(name: string): AssociationFiche | null {
  const idx = readJson<SubvIndex>("subventions/index.json");
  const target = decodeURIComponent(name).toLowerCase();
  const byYearMap = new Map<number, { amount: number; count: number }>();
  const byThemeMap = new Map<string, { amount: number; count: number }>();
  let canonicalName = "";
  let theme: string | null = null;
  let natureJuridique: string | null = null;

  for (const y of idx.availableYears) {
    try {
      const f = readJson<SubvBen>(`subventions/beneficiaires_${y}.json`);
      for (const b of f.data) {
        if (b.beneficiaire.toLowerCase() !== target) continue;
        canonicalName = canonicalName || b.beneficiaire;
        theme = theme ?? b.thematique ?? null;
        natureJuridique = natureJuridique ?? b.nature_juridique ?? null;

        const cur = byYearMap.get(y) ?? { amount: 0, count: 0 };
        cur.amount += b.montant_total;
        cur.count += b.nb_subventions;
        byYearMap.set(y, cur);

        if (b.thematique) {
          const t = byThemeMap.get(b.thematique) ?? { amount: 0, count: 0 };
          t.amount += b.montant_total;
          t.count += b.nb_subventions;
          byThemeMap.set(b.thematique, t);
        }
      }
    } catch {}
  }

  if (!canonicalName) return null;

  const byYear = [...byYearMap.entries()]
    .map(([year, v]) => ({ year, amount: v.amount, count: v.count }))
    .sort((a, b) => a.year - b.year);
  const totalAmount = byYear.reduce((s, y) => s + y.amount, 0);
  const subventionCount = byYear.reduce((s, y) => s + y.count, 0);
  const byTheme = [...byThemeMap.entries()]
    .map(([th, v]) => ({ theme: th, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // Highlights: YoY swings ≥ 20% (absolute) on the byYear series
  const highlights: { year: number; pct: number; kind: "up" | "down" }[] = [];
  for (let i = 1; i < byYear.length; i++) {
    const cur = byYear[i];
    const prev = byYear[i - 1];
    if (prev.amount <= 0) continue;
    const pct = ((cur.amount - prev.amount) / prev.amount) * 100;
    if (Math.abs(pct) >= 20) {
      highlights.push({ year: cur.year, pct, kind: pct > 0 ? "up" : "down" });
    }
  }

  // Theme rank — where does this asso sit in its primary thematic?
  // Compare against the most recent year available in the subventions index.
  let themeRank: AssociationFiche["themeRank"] = null;
  if (theme) {
    try {
      const latestYear = idx.availableYears[0];
      const f = readJson<SubvBen>(`subventions/beneficiaires_${latestYear}.json`);
      const sameTheme = f.data
        .filter((b) => b.thematique === theme)
        .sort((a, b) => b.montant_total - a.montant_total);
      const targetLower = canonicalName.toLowerCase();
      const rank = sameTheme.findIndex((b) => b.beneficiaire.toLowerCase() === targetLower) + 1;
      if (rank > 0) {
        themeRank = { rank, total: sameTheme.length, theme };
      }
    } catch {
      /* missing file — skip */
    }
  }

  return {
    name: canonicalName,
    theme,
    natureJuridique,
    totalAmount,
    subventionCount,
    yearsActive: byYear.map((y) => y.year),
    byYear,
    byTheme,
    themeRank,
    highlights,
  };
}

// ─── Projet (investissements) fiche ────────────────────────────────────────

export type ProjetVulgarization = {
  description_claire: string;
  quoi_concretement: string;
  pourquoi_ca_compte: string;
  typologie_normalisee: string;
  model?: string;
};

export type ProjetFiche = {
  id: string;
  name: string;
  arrondissement: number;
  chapitre: string;
  typeAp: string | null;
  montant: number;
  year: number;
  lat: number | null;
  lon: number | null;
  geoLabel: string | null;
  sourcePdf: string | null;
  sourcePage: number | null;
  confidence: number | null;
  /** Vulgarisation IA si dispo dans le cache. */
  vulgarization: ProjetVulgarization | null;
  /** Rank parmi les projets de même typologie (ou chapitre) dans le même exercice. */
  typologieRank: { rank: number; total: number; typologie: string } | null;
  /** Rank parmi tous les projets du même arrondissement, même exercice. */
  arrRank: { rank: number; total: number; arr: number } | null;
  /** Projets similaires (même typologie + top montants) — pour "voir aussi". */
  similaires: {
    id: string;
    name: string;
    montant: number;
    arrondissement: number;
    typologie: string | null;
  }[];
};

let _projetsVulg: Record<string, ProjetVulgarization> | null = null;

export function loadProjetVulgarization(id: string): ProjetVulgarization | null {
  if (_projetsVulg === null) {
    const data = readJsonOrNull<VulgarizationCache<ProjetVulgarization>>("enrichment/vulgarization_projets.json");
    _projetsVulg = data?.items ?? {};
  }
  return _projetsVulg[id] ?? null;
}

export function loadProjet(id: string): ProjetFiche | null {
  const decoded = decodeURIComponent(id);
  // Scan all years
  for (let y = 2024; y >= 2018; y--) {
    let year: InvComplet;
    try {
      year = readJson<InvComplet>(`map/investissements_complet_${y}.json`);
    } catch {
      continue;
    }
    const row = year.data.find((p) => p.id === decoded);
    if (!row) continue;
    const r = row as typeof row & {
      type_ap?: string;
      source_pdf?: string;
      source_page?: number;
      confidence?: number;
      geo_label?: string;
    };

    const vulgarization = loadProjetVulgarization(r.id);
    const typologie = vulgarization?.typologie_normalisee ?? null;
    const montant = Number(r.montant ?? 0);
    const arrondissement = Number(r.arrondissement) || 0;

    // Rank by typologie + same year — requires vulgarization cache to be useful
    let typologieRank: ProjetFiche["typologieRank"] = null;
    if (typologie) {
      const sameTypo = year.data
        .filter((p) => {
          const vv = loadProjetVulgarization(p.id);
          return vv?.typologie_normalisee === typologie;
        })
        .slice()
        .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0));
      const rank = sameTypo.findIndex((p) => p.id === r.id) + 1;
      if (rank > 0) typologieRank = { rank, total: sameTypo.length, typologie };
    }

    // Rank by arrondissement + same year
    let arrRank: ProjetFiche["arrRank"] = null;
    if (arrondissement > 0) {
      const sameArr = year.data
        .filter((p) => Number(p.arrondissement) === arrondissement)
        .slice()
        .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0));
      const rank = sameArr.findIndex((p) => p.id === r.id) + 1;
      if (rank > 0) arrRank = { rank, total: sameArr.length, arr: arrondissement };
    }

    // Similar projects — same typologie, different id, top montants
    const similaires: ProjetFiche["similaires"] = [];
    if (typologie) {
      const peers = year.data
        .filter((p) => {
          if (p.id === r.id) return false;
          const vv = loadProjetVulgarization(p.id);
          return vv?.typologie_normalisee === typologie;
        })
        .slice()
        .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0))
        .slice(0, 4);
      for (const peer of peers) {
        const pvv = loadProjetVulgarization(peer.id);
        similaires.push({
          id: peer.id,
          name: peer.nom_projet ?? "Projet sans nom",
          montant: Number(peer.montant ?? 0),
          arrondissement: Number(peer.arrondissement) || 0,
          typologie: pvv?.typologie_normalisee ?? null,
        });
      }
    }

    return {
      id: r.id,
      name: r.nom_projet ?? "Projet sans nom",
      arrondissement,
      chapitre: r.chapitre_libelle ?? "—",
      typeAp: r.type_ap ?? null,
      montant,
      year: y,
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      geoLabel: r.geo_label ?? null,
      sourcePdf: r.source_pdf ?? null,
      sourcePage: r.source_page ?? null,
      confidence: r.confidence ?? null,
      vulgarization,
      typologieRank,
      arrRank,
      similaires,
    };
  }
  return null;
}

// ─── Bailleur (logement social) fiche ──────────────────────────────────────

export type BailleurFiche = {
  name: string;
  type: string;
  color: string;
  share: number;
  description: string;
};

export function loadBailleur(slug: string): BailleurFiche | null {
  const data = loadLogementSocialData();
  const decoded = decodeURIComponent(slug).toLowerCase();
  return (
    data.bailleurs.find(
      (b) =>
        b.name.toLowerCase() === decoded ||
        b.name.toLowerCase().replace(/\s+/g, "-") === decoded,
    ) ?? null
  );
}

export function loadQuiRecoitData(requestedYear?: number): QuiRecoitData {
  const idx = readJson<SubvIndex>("subventions/index.json");
  const yr = requestedYear && idx.availableYears.includes(requestedYear)
    ? requestedYear
    : idx.availableYears[0];
  const prev = idx.availableYears.find((y) => y !== yr) ?? yr;
  const ben = readJson<SubvBen>(`subventions/beneficiaires_${yr}.json`);

  // Pre-load every available year once — used for the top-10 history and the
  // "movers" section (biggest gains/losses between current year and prev).
  const yearlyData = new Map<number, SubvBen>();
  for (const y of idx.availableYears) {
    try { yearlyData.set(y, readJson<SubvBen>(`subventions/beneficiaires_${y}.json`)); } catch {}
  }
  // Quick index: { benefName -> { year -> amount } }
  const benHistory = new Map<string, Map<number, number>>();
  for (const [y, file] of yearlyData.entries()) {
    for (const b of file.data) {
      if (!benHistory.has(b.beneficiaire)) benHistory.set(b.beneficiaire, new Map());
      benHistory.get(b.beneficiaire)!.set(y, b.montant_total);
    }
  }

  const ty = idx.totalsByYear[String(yr)];
  const tyPrev = idx.totalsByYear[String(prev)];
  const deltaMontantPct = tyPrev ? ((ty.montant_total - tyPrev.montant_total) / tyPrev.montant_total) * 100 : 0;
  const deltaNbPct = tyPrev ? ((ty.nb_subventions - tyPrev.nb_subventions) / tyPrev.nb_subventions) * 100 : 0;

  const sorted = ben.data.slice().sort((a, b) => b.montant_total - a.montant_total);
  const top10 = sorted.slice(0, 10).map((b, i) => {
    const histMap = benHistory.get(b.beneficiaire);
    const history = idx.availableYears
      .slice()
      .sort((a, b2) => a - b2)
      .map((y) => ({ year: y, amount: histMap?.get(y) ?? 0 }));
    return {
      rank: i + 1,
      name: b.beneficiaire,
      theme: b.thematique ?? null,
      amount: b.montant_total,
      nb: b.nb_subventions,
      history,
    };
  });

  // By theme: sum up + keep top-5 benéficiaires par thème
  type ThemeAgg = { amount: number; count: number; items: { name: string; amount: number; nb: number }[] };
  const themeAgg = new Map<string, ThemeAgg>();
  for (const b of ben.data) {
    const t = b.thematique || "Autres";
    const cur = themeAgg.get(t) ?? { amount: 0, count: 0, items: [] };
    cur.amount += b.montant_total;
    cur.count += b.nb_subventions;
    cur.items.push({ name: b.beneficiaire, amount: b.montant_total, nb: b.nb_subventions });
    themeAgg.set(t, cur);
  }
  const byTheme = [...themeAgg.entries()]
    .map(([theme, v]) => ({
      theme,
      amount: v.amount,
      count: v.count,
      topBen: v.items.sort((a, b) => b.amount - a.amount).slice(0, 5),
    }))
    .sort((a, b) => b.amount - a.amount);

  const availableYearsSorted = idx.availableYears.slice().sort((a, b) => a - b);
  const allBeneficiaires = ben.data
    .map((b) => {
      const histMap = benHistory.get(b.beneficiaire);
      const history = availableYearsSorted.map((y) => ({
        year: y,
        amount: histMap?.get(y) ?? 0,
      }));
      return {
        name: b.beneficiaire,
        theme: b.thematique ?? null,
        amount: b.montant_total,
        nb: b.nb_subventions,
        history,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const yearsSummary = idx.availableYears
    .map((y) => ({ year: y, total: idx.totalsByYear[String(y)]?.montant_total ?? 0, count: idx.totalsByYear[String(y)]?.nb_subventions ?? 0 }))
    .sort((a, b) => a.year - b.year);

  // Median subvention amount — rough proxy from the top 500 values
  const amounts = ben.data.map((b) => b.montant_total).sort((a, b) => a - b);
  const medianSubvention = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;

  // Concentration top 10 / total
  const top10Sum = top10.reduce((s, t) => s + t.amount, 0);
  const concentrationTop10Pct = ty.montant_total > 0 ? (top10Sum / ty.montant_total) * 100 : 0;

  // Movers — biggest gains / losses vs previous comparable year
  const prevFile = yearlyData.get(prev);
  const prevMap = new Map<string, number>();
  if (prevFile) for (const b of prevFile.data) prevMap.set(b.beneficiaire, b.montant_total);
  const moversAll = ben.data
    .map((b) => {
      const pv = prevMap.get(b.beneficiaire) ?? 0;
      const delta = pv > 0 ? ((b.montant_total - pv) / pv) * 100 : b.montant_total > 0 ? 999 : 0;
      return { name: b.beneficiaire, amount: b.montant_total, delta, prev: pv };
    })
    // Require at least €100k this year AND a baseline previous year ≥ €50k to avoid noise
    .filter((m) => m.amount >= 100_000 && m.prev >= 50_000);
  const hausses = moversAll.slice().sort((a, b) => b.delta - a.delta).slice(0, 5).map(({ name, amount, delta }) => ({ name, amount, delta }));
  const baisses = moversAll.slice().sort((a, b) => a.delta - b.delta).slice(0, 5).map(({ name, amount, delta }) => ({ name, amount, delta }));

  const availableThemes = byTheme.map((t) => t.theme);

  return {
    year: yr,
    previousYear: prev,
    total: ty.montant_total,
    nbSubventions: ty.nb_subventions,
    nbBeneficiaires: ben.nb_beneficiaires,
    medianSubvention,
    topThemeName: byTheme[0]?.theme ?? null,
    topThemeAmount: byTheme[0]?.amount ?? 0,
    concentrationTop10Pct,
    deltaMontantPct,
    deltaNbPct,
    top10,
    byTheme,
    allBeneficiaires,
    yearsSummary,
    availableThemes,
    movers: { hausses, baisses },
  };
}

// ─── Marchés publics ───────────────────────────────────────────────────────

type MarcheRow = {
  fournisseur_nom?: string;
  objet?: string;
  montant_min?: number;
  montant_max?: number;
  categorie_libelle?: string;
  nature?: string;
  date_notification?: string;
};

type MarchesFile = {
  year: number;
  generated_at?: string;
  enveloppe_max_totale?: number;
  total_montant?: number;
  nb_marches?: number;
  data?: MarcheRow[];
  marches?: MarcheRow[];
};

export type MarchesPageData = {
  year: number;
  availableYears: number[];
  total: number;
  nb: number;
  nbTitulaires: number;
  multiAttributaires: { count: number; amount: number };
  top10: {
    rank: number;
    name: string;
    siret: string;
    amount: number;
    nbContrats: number;
    contrats: { numero: string; objet: string; montant: number; categorie: string; nature: string; date: string }[];
  }[];
  byCategory: {
    category: string;
    amount: number;
    count: number;
    topTitulaires: { name: string; amount: number; nb: number }[];
  }[];
  byNature: { nature: string; amount: number; count: number }[];
  allMarches: {
    numeroMarche: string;
    titulaire: string;
    titulaireSiret: string;
    objet: string;
    montant: number;
    categorie: string;
    nature: string;
    date: string;
    multiAttributaire: boolean;
  }[];
  yearsSummary: { year: number; total: number; count: number }[];
};

type MarchesIndexRaw = {
  availableYears?: number[];
  totalsByYear?: Record<string, { nb_marches: number; enveloppe_max_totale: number }>;
};

export function loadMarchesIndex() {
  return readJson<MarchesIndexRaw>("marches-publics/index.json");
}

// Fiche-level loaders — read a single contract or supplier across years.

export type ContratFiche = {
  numero: string;
  objet: string;
  nature: string;
  categorie: string;
  fournisseur: string;
  fournisseurSiret: string;
  multiAttributaire: boolean;
  montantMin: number;
  montantMax: number;
  dateNotification: string;
  dureeJours: number;
  perimetre: string;
  year: number;
};

export type ContratRanking = {
  montant: number;
  rankYear: number;          // position parmi tous les contrats de l'année (1 = plus gros)
  totalYear: number;
  rankNature: number;        // position parmi les contrats de même nature, même année
  totalNature: number;
  medianNature: number;      // médiane des montants pour cette nature/année
  year: number;
  nature: string;
};

/**
 * Computes where a contract sits among its peers (year + nature). Used to
 * give citizens a quick sense of scale: "is this a big deal or routine?"
 */
export function loadContratRanking(numero: string, year: number, nature: string, montant: number): ContratRanking | null {
  try {
    const f = readJson<MarchesFile>(`marches-publics/marches_${year}.json`);
    const rows = (f.data ?? f.marches ?? []) as (MarcheRow & { numero_marche?: string })[];
    const amounts = rows
      .map((r) => Number(r.montant_max ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => b - a);
    const natureRows = rows
      .filter((r) => (r.nature ?? "") === nature)
      .map((r) => Number(r.montant_max ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => b - a);
    const rankYear = amounts.findIndex((v) => v <= montant) + 1 || amounts.length + 1;
    const rankNature = natureRows.findIndex((v) => v <= montant) + 1 || natureRows.length + 1;
    const median = natureRows.length
      ? natureRows[Math.floor(natureRows.length / 2)]
      : 0;
    return {
      montant,
      rankYear,
      totalYear: amounts.length,
      rankNature,
      totalNature: natureRows.length,
      medianNature: median,
      year,
      nature,
    };
  } catch {
    return null;
  }
}

export function loadContrat(numero: string): ContratFiche | null {
  // Scan every year — the id is unique enough.
  const indexRaw = readJson<MarchesIndexRaw>("marches-publics/index.json");
  const years = (indexRaw.availableYears ?? []).slice().sort((a, b) => b - a);
  for (const y of years) {
    try {
      const f = readJson<MarchesFile>(`marches-publics/marches_${y}.json`);
      const rows = f.data ?? f.marches ?? [];
      const row = rows.find((m) => (m as MarcheRow & { numero_marche?: string }).numero_marche === numero);
      if (!row) continue;
      const r = row as MarcheRow & { numero_marche?: string; fournisseur_siret?: string; montant_min?: number; duree_jours?: number; perimetre_financier?: string; is_multiattributaire?: boolean };
      return {
        numero: r.numero_marche ?? numero,
        objet: r.objet ?? "",
        nature: r.nature ?? "—",
        categorie: r.categorie_libelle ?? "—",
        fournisseur: r.fournisseur_nom ?? "Non précisé",
        fournisseurSiret: r.fournisseur_siret ?? "",
        multiAttributaire: r.fournisseur_nom === "MARCHE MULTIATTRIBUTAIRE" || Boolean(r.is_multiattributaire),
        montantMin: Number(r.montant_min ?? 0),
        montantMax: Number(r.montant_max ?? 0),
        dateNotification: r.date_notification ?? "",
        dureeJours: Number(r.duree_jours ?? 0),
        perimetre: r.perimetre_financier ?? "—",
        year: y,
      };
    } catch {}
  }
  return null;
}

export type FournisseurFiche = {
  nom: string;
  siret: string;
  siren: string;
  totalAmount: number;
  contratCount: number;
  yearsActive: number[];
  byYear: { year: number; amount: number; count: number }[];
  byCategory: { category: string; amount: number; count: number }[];
  contrats: { numero: string; objet: string; montant: number; year: number; date: string; categorie: string; nature: string }[];
};

/**
 * Loads a supplier's full history across all available years. Works
 * either from SIREN (9-digit prefix of SIRET) or from the full SIRET.
 * Best-effort — SIRET data is partial for older years.
 */
export function loadFournisseur(key: string): FournisseurFiche | null {
  const indexRaw = readJson<MarchesIndexRaw>("marches-publics/index.json");
  const years = (indexRaw.availableYears ?? []).slice().sort((a, b) => a - b);
  const target = key.replace(/\s/g, "");
  const siren = target.slice(0, 9);

  const contrats: FournisseurFiche["contrats"] = [];
  const byYearMap = new Map<number, { amount: number; count: number }>();
  const byCatMap = new Map<string, { amount: number; count: number }>();
  let nom = "";
  let fullSiret = "";

  for (const y of years) {
    try {
      const f = readJson<MarchesFile>(`marches-publics/marches_${y}.json`);
      const rows = f.data ?? f.marches ?? [];
      for (const m of rows) {
        const r = m as MarcheRow & {
          numero_marche?: string;
          fournisseur_siret?: string;
        };
        const thisSiret = (r.fournisseur_siret ?? "").replace(/\s/g, "");
        const matchesBySiret = thisSiret === target || (thisSiret.length >= 9 && thisSiret.slice(0, 9) === siren);
        const matchesByName =
          !thisSiret && r.fournisseur_nom && r.fournisseur_nom.toLowerCase() === key.toLowerCase();
        if (!matchesBySiret && !matchesByName) continue;

        nom = nom || r.fournisseur_nom || "Non précisé";
        fullSiret = fullSiret || thisSiret;
        const v = Number(r.montant_max ?? r.montant_min ?? 0);
        const cat = r.categorie_libelle || r.nature || "Autres";

        contrats.push({
          numero: r.numero_marche ?? "",
          objet: r.objet ?? "",
          montant: v,
          year: y,
          date: r.date_notification ?? "",
          categorie: cat,
          nature: r.nature || "Autres",
        });

        const yy = byYearMap.get(y) ?? { amount: 0, count: 0 };
        yy.amount += v;
        yy.count += 1;
        byYearMap.set(y, yy);

        const cc = byCatMap.get(cat) ?? { amount: 0, count: 0 };
        cc.amount += v;
        cc.count += 1;
        byCatMap.set(cat, cc);
      }
    } catch {}
  }

  if (contrats.length === 0) return null;

  const totalAmount = contrats.reduce((s, c) => s + c.montant, 0);
  contrats.sort((a, b) => b.montant - a.montant);

  const byYear = [...byYearMap.entries()]
    .map(([year, v]) => ({ year, amount: v.amount, count: v.count }))
    .sort((a, b) => a.year - b.year);
  const byCategory = [...byCatMap.entries()]
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  return {
    nom,
    siret: fullSiret,
    siren: fullSiret.slice(0, 9) || siren,
    totalAmount,
    contratCount: contrats.length,
    yearsActive: byYear.map((y) => y.year),
    byYear,
    byCategory,
    contrats,
  };
}

export function loadMarchesPageData(requestedYear?: number): MarchesPageData {
  const indexRaw = readJson<MarchesIndexRaw>("marches-publics/index.json");
  const years = (indexRaw.availableYears ?? []).slice().sort((a, b) => a - b);
  const yr = requestedYear && years.includes(requestedYear)
    ? requestedYear
    : years[years.length - 1] ?? 2024;
  const file = readJson<MarchesFile>(`marches-publics/marches_${yr}.json`);
  const marches = file.data ?? file.marches ?? [];

  const MULTI_NAME = "MARCHE MULTIATTRIBUTAIRE";
  type TitAgg = {
    amount: number;
    count: number;
    siret: string;
    contrats: { numero: string; objet: string; montant: number; categorie: string; nature: string; date: string }[];
  };
  const titAgg = new Map<string, TitAgg>();
  type CatAgg = { amount: number; count: number; items: Map<string, { amount: number; count: number }> };
  const catAgg = new Map<string, CatAgg>();
  const natureAgg = new Map<string, { amount: number; count: number }>();
  const multi = { count: 0, amount: 0 };
  let total = 0;
  for (const m of marches) {
    const r = m as MarcheRow & { numero_marche?: string; fournisseur_siret?: string; is_multiattributaire?: boolean };
    const v = Number(r.montant_max ?? r.montant_min ?? 0);
    total += v;
    const isMulti = r.fournisseur_nom === MULTI_NAME || Boolean(r.is_multiattributaire);
    if (isMulti) {
      multi.count += 1;
      multi.amount += v;
    }
    const t = r.fournisseur_nom || "Non précisé";
    const tA = titAgg.get(t) ?? { amount: 0, count: 0, siret: "", contrats: [] };
    tA.amount += v;
    tA.count += 1;
    if (!tA.siret && r.fournisseur_siret && r.fournisseur_siret !== "#") {
      tA.siret = r.fournisseur_siret.replace(/\s/g, "");
    }
    tA.contrats.push({
      numero: r.numero_marche ?? "",
      objet: r.objet || "",
      montant: v,
      categorie: r.categorie_libelle || "—",
      nature: r.nature || "—",
      date: r.date_notification || "",
    });
    titAgg.set(t, tA);
    const c = r.categorie_libelle || r.nature || "Autres";
    const cA = catAgg.get(c) ?? { amount: 0, count: 0, items: new Map() };
    cA.amount += v;
    cA.count += 1;
    const titInCat = cA.items.get(t) ?? { amount: 0, count: 0 };
    titInCat.amount += v;
    titInCat.count += 1;
    cA.items.set(t, titInCat);
    catAgg.set(c, cA);
    const nature = (r.nature || "Autres").trim() || "Autres";
    const nA = natureAgg.get(nature) ?? { amount: 0, count: 0 };
    nA.amount += v;
    nA.count += 1;
    natureAgg.set(nature, nA);
  }

  // Exclude "MARCHE MULTIATTRIBUTAIRE" from the top 10 — it's a placeholder
  // name for contracts with multiple co-attributaires, not a real fournisseur.
  const top10 = [...titAgg.entries()]
    .filter(([name]) => name !== MULTI_NAME)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)
    .map(([name, v], i) => ({
      rank: i + 1,
      name,
      siret: v.siret,
      amount: v.amount,
      nbContrats: v.count,
      contrats: v.contrats.slice().sort((a, b) => b.montant - a.montant).slice(0, 12),
    }));

  const byCategory = [...catAgg.entries()]
    .map(([category, v]) => ({
      category,
      amount: v.amount,
      count: v.count,
      topTitulaires: [...v.items.entries()]
        .filter(([name]) => name !== MULTI_NAME)
        .map(([name, x]) => ({ name, amount: x.amount, nb: x.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 16);

  const byNature = [...natureAgg.entries()]
    .map(([nature, v]) => ({ nature, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const allMarches = marches
    .map((m) => {
      const r = m as MarcheRow & { numero_marche?: string; fournisseur_siret?: string; is_multiattributaire?: boolean };
      return {
        numeroMarche: r.numero_marche ?? "",
        titulaire: r.fournisseur_nom || "Non précisé",
        titulaireSiret: (r.fournisseur_siret ?? "").replace(/\s/g, ""),
        objet: r.objet || "",
        montant: Number(r.montant_max ?? r.montant_min ?? 0),
        categorie: r.categorie_libelle || r.nature || "Autres",
        nature: r.nature || "Autres",
        date: r.date_notification || "",
        multiAttributaire: r.fournisseur_nom === MULTI_NAME || Boolean(r.is_multiattributaire),
      };
    })
    .sort((a, b) => b.montant - a.montant);

  const yearsSummary: MarchesPageData["yearsSummary"] = years.map((y) => {
    const t = indexRaw.totalsByYear?.[String(y)];
    return {
      year: y,
      total: t?.enveloppe_max_totale ?? 0,
      count: t?.nb_marches ?? 0,
    };
  });

  return {
    year: yr as number,
    availableYears: years,
    total: file.enveloppe_max_totale ?? file.total_montant ?? total,
    nb: file.nb_marches ?? marches.length,
    nbTitulaires: titAgg.size,
    multiAttributaires: multi,
    top10,
    byCategory,
    byNature,
    allMarches,
    yearsSummary,
  };
}

// ─── Investissements ───────────────────────────────────────────────────────

type InvTrends = {
  years: Array<{
    year: number;
    depenses_total: number;
    recettes_total: number;
    depenses_hors_dette: number;
    par_chapitre: Array<{ label: string; depenses: number; recettes: number }>;
  }>;
};

type InvComplet = {
  year: number;
  stats?: { total?: number; count?: number; geolocalises?: number };
  data: Array<{
    id: string;
    annee: number;
    arrondissement: number;
    chapitre_libelle?: string;
    nom_projet: string;
    montant: number;
    type_ap?: string;
    lat?: number;
    lon?: number;
  }>;
};

export type InvestissementsData = {
  year: number;
  availableYears: number[];
  total: number;
  totalHorsDette: number;
  nbProjets: number;
  nbGeo: number;
  pctGeo: number;
  byChapitre: { label: string; amount: number }[];
  byArrondissement: { arr: number; amount: number; count: number }[];
  topProjets: { name: string; arr: number; chapitre: string; amount: number }[];
  geoPoints: {
    id: string;
    lat: number;
    lon: number;
    name: string;
    amount: number;
    chapitre: string;
    arr: number;
  }[];
  yearsSummary: { year: number; total: number; horsDette: number }[];
};

export function loadInvestissementsData(requestedYear?: number): InvestissementsData {
  const trends = readJson<InvTrends>("investissement_tendances.json");
  const pick = requestedYear != null
    ? trends.years.find((y) => y.year === requestedYear) ?? trends.years[trends.years.length - 1]
    : trends.years[trends.years.length - 1];
  const latest = pick;
  const year = latest.year;

  let complet: InvComplet | null = null;
  try {
    complet = readJson<InvComplet>(`map/investissements_complet_${year}.json`);
  } catch {}
  const projets = complet?.data ?? [];

  const arrAgg = new Map<number, { amount: number; count: number }>();
  for (const p of projets) {
    const a = Number(p.arrondissement) || 0;
    const cur = arrAgg.get(a) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.montant ?? 0);
    cur.count += 1;
    arrAgg.set(a, cur);
  }
  const byArrondissement = [...arrAgg.entries()]
    .map(([arr, v]) => ({ arr, amount: v.amount, count: v.count }))
    .filter((x) => x.arr > 0)
    .sort((a, b) => b.amount - a.amount);

  const topProjets = projets
    .slice()
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 10)
    .map((p) => ({
      name: p.nom_projet ?? "Projet non nommé",
      arr: p.arrondissement,
      chapitre: p.chapitre_libelle ?? "—",
      amount: p.montant,
    }));

  const nbGeo = projets.filter((p) => p.lat != null && p.lon != null).length;

  const geoPoints = projets
    .filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lon: p.lon as number,
      name: p.nom_projet ?? "Projet",
      amount: Number(p.montant ?? 0),
      chapitre: p.chapitre_libelle ?? "",
      arr: Number(p.arrondissement) || 0,
    }));

  return {
    year,
    availableYears: trends.years.map((y) => y.year).sort((a, b) => a - b),
    total: latest.depenses_total,
    totalHorsDette: latest.depenses_hors_dette,
    nbProjets: projets.length,
    nbGeo,
    pctGeo: projets.length > 0 ? (nbGeo / projets.length) * 100 : 0,
    byChapitre: latest.par_chapitre
      .map((c) => ({ label: c.label, amount: c.depenses }))
      .sort((a, b) => b.amount - a.amount),
    byArrondissement,
    topProjets,
    geoPoints,
    yearsSummary: trends.years.map((y) => ({
      year: y.year,
      total: y.depenses_total,
      horsDette: y.depenses_hors_dette,
    })),
  };
}

// ─── Patrimoine / Bilan ────────────────────────────────────────────────────

type BilanIndex = {
  availableYears: number[];
  latestYear: number;
  totalsByYear: Record<string, { actif_net: number; passif_net: number }>;
};

type BilanSankey = {
  year: number;
  totals: {
    actif_net: number;
    passif_net: number;
    fonds_propres: number;
    dette_totale: number;
    dettes_financieres: number;
    dettes_non_financieres: number;
    provisions: number;
  };
  links: Array<{ source: string; target: string; value: number }>;
};

export type PatrimoineData = {
  year: number;
  availableYears: number[];
  actif: number;
  passif: number;
  fondsPropres: number;
  detteTotale: number;
  detteFinanciere: number;
  detteNonFinanciere: number;
  provisions: number;
  capaciteDesendettement: number; // en années (approx)
  actifBreakdown: { label: string; value: number }[];
  passifBreakdown: { label: string; value: number }[];
  yearsSummary: { year: number; actif: number; passif: number; dette: number; fondsPropres: number }[];
};

const BILAN_CENTRAL = "Patrimoine Paris";

export function loadPatrimoineData(requestedYear?: number): PatrimoineData {
  const idx = readJson<BilanIndex>("bilan_index.json");
  const availableYears = idx.availableYears.slice().sort((a, b) => a - b);
  const year = requestedYear && availableYears.includes(requestedYear)
    ? requestedYear
    : idx.latestYear;
  const bilan = readJson<BilanSankey>(`bilan_sankey_${year}.json`);

  const actifLinks = bilan.links.filter((l) => l.target === BILAN_CENTRAL);
  const passifLinks = bilan.links.filter((l) => l.source === BILAN_CENTRAL);

  const actifBreakdown = actifLinks
    .map((l) => ({ label: l.source, value: l.value }))
    .sort((a, b) => b.value - a.value);
  const passifBreakdown = passifLinks
    .map((l) => ({ label: l.target, value: l.value }))
    .sort((a, b) => b.value - a.value);

  // Capacité de désendettement ≈ dette / épargne brute annuelle
  // On l'approxime ici comme dette / 600 M € (épargne brute moyenne Paris)
  const capaciteDesendettement = bilan.totals.dettes_financieres / 900_000_000;

  const yearsSummary: PatrimoineData["yearsSummary"] = [];
  for (const y of idx.availableYears.slice().sort((a, b) => a - b)) {
    try {
      const f = readJson<BilanSankey>(`bilan_sankey_${y}.json`);
      yearsSummary.push({
        year: y,
        actif: f.totals.actif_net,
        passif: f.totals.passif_net,
        dette: f.totals.dette_totale,
        fondsPropres: f.totals.fonds_propres,
      });
    } catch {}
  }

  return {
    year,
    availableYears,
    actif: bilan.totals.actif_net,
    passif: bilan.totals.passif_net,
    fondsPropres: bilan.totals.fonds_propres,
    detteTotale: bilan.totals.dette_totale,
    detteFinanciere: bilan.totals.dettes_financieres,
    detteNonFinanciere: bilan.totals.dettes_non_financieres,
    provisions: bilan.totals.provisions,
    capaciteDesendettement,
    actifBreakdown,
    passifBreakdown,
    yearsSummary,
  };
}

// ─── Logement social ───────────────────────────────────────────────────────

type ArrStats = {
  year: number;
  data: Array<{
    arrondissement: number;
    logements?: { total?: number; count?: number };
    investissements?: { total?: number; count?: number };
  }>;
};

export type LogementSocialData = {
  year: number;
  availableYears: number[];
  nouveauxParAn: number;
  nbOperations: number;
  sruRatio: number;
  sruTarget: number;
  stockTotal: number;
  byArrondissement: { arr: number; logements: number; operations: number }[];
  bailleurs: { name: string; type: string; color: string; share: number; description: string }[];
  yearsSummary: { year: number; logements: number }[];
};

export function loadLogementSocialData(requestedYear?: number): LogementSocialData {
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const yearsSummary: LogementSocialData["yearsSummary"] = [];
  const files: Record<number, ArrStats> = {};
  for (const y of years) {
    try {
      const d = readJson<ArrStats>(`map/arrondissements_stats_${y}.json`);
      files[y] = d;
      const total = d.data.reduce((s, a) => s + (a.logements?.total ?? 0), 0);
      yearsSummary.push({ year: y, logements: total });
    } catch {}
  }
  const availableYears = Object.keys(files).map(Number).sort((a, b) => a - b);
  const pickedYear =
    requestedYear && availableYears.includes(requestedYear)
      ? requestedYear
      : availableYears[availableYears.length - 1];
  const latest = files[pickedYear];
  if (!latest) {
    throw new Error("Missing arrondissements_stats data");
  }
  const nouveauxParAn = latest.data.reduce((s, a) => s + (a.logements?.total ?? 0), 0);
  const nbOperations = latest.data.reduce((s, a) => s + (a.logements?.count ?? 0), 0);

  const byArrondissement = latest.data
    .map((a) => ({
      arr: a.arrondissement,
      logements: a.logements?.total ?? 0,
      operations: a.logements?.count ?? 0,
    }))
    .filter((x) => x.arr > 0)
    .sort((a, b) => b.logements - a.logements);

  // Bailleurs principaux — références publiques ; à terme chargés depuis /data/logements
  const bailleurs = [
    { name: "Paris Habitat", type: "OPH (Ville)", color: "#2a3680", share: 49, description: "Office Public de l'Habitat de la Ville — plus grand bailleur social français." },
    { name: "RIVP", type: "SEM", color: "#1e45e4", share: 18, description: "Régie Immobilière de la Ville de Paris — SEM axée sur l'innovation habitat." },
    { name: "Elogie-Siemp", type: "SEM", color: "#a67638", share: 14, description: "Issue de la fusion Elogie et Siemp — réhabilitation et mixité sociale." },
    { name: "ICF Habitat", type: "Privé", color: "#5f6672", share: 7, description: "Filiale SNCF — logement des salariés et social." },
    { name: "3F Résidences", type: "Privé", color: "#9099a6", share: 6, description: "Groupe Action Logement — bailleur national présent à Paris." },
    { name: "Autres bailleurs", type: "Divers", color: "#e4e6ea", share: 6, description: "Dizaines de petits bailleurs sociaux et coopératifs." },
  ];

  // SRU officiel : Paris à 24,5 % au 31/12/2024 (source : DDT Paris)
  const sruRatio = 24.5;
  const sruTarget = 25;
  // Stock SRU inventaire 2024 : 258 400 logements sociaux sur 1 055 000 résidences principales
  const stockTotal = 258_400;

  return {
    year: latest.year,
    availableYears,
    nouveauxParAn,
    nbOperations,
    sruRatio,
    sruTarget,
    stockTotal,
    byArrondissement,
    bailleurs,
    yearsSummary,
  };
}

export function loadBudgetPageData(requestedYear?: number): BudgetPageData {
  const index = readJson<BudgetIndex>("budget_index.json");
  const year = requestedYear && index.availableYears.includes(requestedYear)
    ? requestedYear
    : index.latestYear;
  const sankey = readJson<BudgetSankeyFull>(`budget_sankey_${year}.json`);

  const byYear = Object.fromEntries(index.summary.map((s) => [s.year, s]));
  const ref = byYear[index.latestCompleteYear];
  const previousYear = index.latestCompleteYear;
  const deltaDepensesPct = ref
    ? ((sankey.totals.depenses - ref.depenses) / ref.depenses) * 100
    : 0;

  let fonctionnement = 0;
  let investissement = 0;
  for (const cat of Object.values(sankey.bySection)) {
    fonctionnement += cat.Fonctionnement?.total ?? 0;
    investissement += cat.Investissement?.total ?? 0;
  }
  // épargne brute ≈ recettes de fonctionnement - dépenses de fonctionnement
  // approximation : total recettes hors emprunts - fonctionnement
  const emprunts = sankey.links
    .filter((l) => l.source === "Emprunts" && l.target === "Budget Paris")
    .reduce((s, l) => s + l.value, 0);
  const epargneBrute = Math.max(0, sankey.totals.recettes - emprunts - fonctionnement);

  const topDepenses = sankey.links
    .filter((l) => l.source === "Budget Paris")
    .map((l) => {
      const cat = sankey.bySection[l.target];
      const items = [
        ...(cat?.Fonctionnement?.items ?? []),
        ...(cat?.Investissement?.items ?? []),
      ];
      // Keep raw names here — the page splits N2/N3 for display.
      const subPostes = items
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      return { label: l.target, value: l.value, subPostes };
    })
    .sort((a, b) => b.value - a.value);

  const recettesBreakdown = sankey.links
    .filter((l) => l.target === "Budget Paris")
    .map((l) => {
      const items = sankey.drilldown?.revenue?.[l.source] ?? [];
      // Keep raw names — the page splits N2/N3 for display.
      const subSources = items
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      return { label: l.source, value: l.value, subSources };
    })
    .sort((a, b) => b.value - a.value);

  const yearsSummary = index.summary
    .map((s) => ({
      year: s.year,
      type: s.type_budget,
      depenses: s.depenses,
      recettes: s.recettes,
      solde: s.solde,
    }))
    .sort((a, b) => a.year - b.year);

  return {
    year,
    previousYear,
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
  };
}
