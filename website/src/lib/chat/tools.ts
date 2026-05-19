import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data");

function loadJson<T = unknown>(rel: string): T | null {
  const p = path.join(DATA_DIR, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

// ---------- data shapes ----------

type IndexFile = {
  availableYears?: number[];
  totalsByYear?: Record<string, number>;
  year_types?: Record<string, string>;
  completeYears?: number[];
  note?: string;
};

type BeneficiaireRow = {
  beneficiaire?: string;
  nature_juridique?: string;
  thematique?: string;
  montant_total?: number;
  nb_subventions?: number;
};

type SubventionsYearFile = {
  data: BeneficiaireRow[];
  total_montant?: number;
  nb_beneficiaires?: number;
};

type TrendsYearEntry = {
  year: number;
  total_montant?: number;
  nb_subventions?: number;
};

type SubventionsTrendsFile = {
  years: TrendsYearEntry[];
};

type MarcheRow = {
  objet?: string;
  nature?: string;
  fournisseur_nom?: string;
  montant_max?: number;
  date_notification?: string;
};

type MarchesYearFile = {
  data: MarcheRow[];
  note?: string;
  enveloppe_max_totale?: number;
  nb_marches?: number;
};

type MarchesTrendsFile = {
  note?: string;
  years: unknown[];
};

type SankeyLink = { source?: string; target?: string; value?: number };
type SankeyFile = {
  year: number;
  type_budget?: string;
  dataStatus?: string;
  totals?: Record<string, number>;
  links?: SankeyLink[];
};

type PatrimoineInstrument = { label?: string; encours?: number; tag?: string };
type PatrimoineFile = {
  year: number;
  structure_dette?: {
    total_dette_financiere?: number;
    instruments?: PatrimoineInstrument[];
  };
};

// ---------- tool implementations ----------

export function list_datasets() {
  const out: Record<string, unknown> = {};
  const subv = loadJson<IndexFile>("subventions/index.json");
  if (subv) out.subventions = { years: subv.availableYears, totals: subv.totalsByYear };
  const march = loadJson<IndexFile>("marches-publics/index.json");
  if (march) out.marches_publics = { years: march.availableYears, totals: march.totalsByYear, note: march.note };
  const budget = loadJson<IndexFile>("budget_index.json");
  if (budget) out.budget = { years: budget.availableYears, year_types: budget.year_types, completeYears: budget.completeYears };
  const bilan = loadJson<IndexFile>("bilan_index.json");
  if (bilan) out.bilan_patrimoine = { years: bilan.availableYears };
  const hb = loadJson<IndexFile>("hors_bilan_index.json");
  if (hb) out.hors_bilan = { years: hb.availableYears };
  return out;
}

export function get_subventions_summary({ year, top_n = 10 }: { year: number; top_n?: number }) {
  const d = loadJson<SubventionsYearFile>(`subventions/beneficiaires_${year}.json`);
  if (!d) return { error: `Pas de subventions pour ${year}` };
  const top = [...d.data].sort((a, b) => (b.montant_total ?? 0) - (a.montant_total ?? 0)).slice(0, top_n);
  return {
    year,
    total_montant: d.total_montant,
    nb_beneficiaires: d.nb_beneficiaires,
    top: top.map((r) => ({
      beneficiaire: r.beneficiaire,
      nature_juridique: r.nature_juridique,
      thematique: r.thematique,
      montant_total: r.montant_total,
      nb_subventions: r.nb_subventions,
    })),
  };
}

export function get_subventions_tendances({ year }: { year?: number }) {
  const d = loadJson<SubventionsTrendsFile>("subventions/subventions_tendances.json");
  if (!d) return { error: "tendances absentes" };
  if (year == null) {
    return { years_summary: d.years.map((y) => ({ year: y.year, total_montant: y.total_montant, nb_subventions: y.nb_subventions })) };
  }
  const m = d.years.find((y) => y.year === year);
  return m ?? { error: `pas de tendances ${year}`, annees_disponibles: d.years.map((y) => y.year) };
}

type SearchSubvResult = {
  year: number;
  beneficiaire?: string;
  thematique?: string;
  montant_total?: number;
  nb_subventions?: number;
};

export function search_beneficiaire({ query, year, limit = 15 }: { query: string; year?: number; limit?: number }) {
  const q = query.toLowerCase().trim();
  const years = year ? [year] : [2024, 2023, 2022, 2019, 2018];
  const results: SearchSubvResult[] = [];
  for (const y of years) {
    const d = loadJson<SubventionsYearFile>(`subventions/beneficiaires_${y}.json`);
    if (!d) continue;
    for (const r of d.data) {
      if ((r.beneficiaire ?? "").toLowerCase().includes(q)) {
        results.push({ year: y, beneficiaire: r.beneficiaire, thematique: r.thematique, montant_total: r.montant_total, nb_subventions: r.nb_subventions });
      }
    }
  }
  results.sort((a, b) => (b.montant_total ?? 0) - (a.montant_total ?? 0));
  return { query, nb_matches: results.length, results: results.slice(0, limit) };
}

export function get_marches_summary({ year, top_n = 10 }: { year: number; top_n?: number }) {
  const d = loadJson<MarchesYearFile>(`marches-publics/marches_${year}.json`);
  if (!d) return { error: `Pas de marchés pour ${year}` };
  const top = [...d.data].sort((a, b) => (b.montant_max ?? 0) - (a.montant_max ?? 0)).slice(0, top_n);
  return {
    year,
    note: d.note,
    enveloppe_max_totale: d.enveloppe_max_totale,
    nb_marches: d.nb_marches,
    top: top.map((r) => ({ objet: r.objet, nature: r.nature, fournisseur: r.fournisseur_nom, montant_max: r.montant_max, date_notification: r.date_notification })),
  };
}

type SearchMarcheResult = {
  year: number;
  objet?: string;
  fournisseur?: string;
  nature?: string;
  montant_max?: number;
  date_notification?: string;
};

export function search_marches({ query, year, min_montant = 0, limit = 15 }: { query: string; year?: number; min_montant?: number; limit?: number }) {
  const q = query.toLowerCase().trim();
  const years = year ? [year] : Array.from({ length: 12 }, (_, i) => 2024 - i);
  const results: SearchMarcheResult[] = [];
  for (const y of years) {
    const d = loadJson<MarchesYearFile>(`marches-publics/marches_${y}.json`);
    if (!d) continue;
    for (const r of d.data) {
      const hay = `${r.objet ?? ""} ${r.fournisseur_nom ?? ""}`.toLowerCase();
      if (hay.includes(q) && (r.montant_max ?? 0) >= min_montant) {
        results.push({ year: y, objet: r.objet, fournisseur: r.fournisseur_nom, nature: r.nature, montant_max: r.montant_max, date_notification: r.date_notification });
      }
    }
  }
  results.sort((a, b) => (b.montant_max ?? 0) - (a.montant_max ?? 0));
  return { query, nb_matches: results.length, results: results.slice(0, limit) };
}

export function get_marches_tendances() {
  const d = loadJson<MarchesTrendsFile>("marches-publics/marches_tendances.json");
  if (!d) return { error: "absent" };
  return { note: d.note, years: d.years };
}

export function get_budget_sankey({ year }: { year: number }) {
  const d = loadJson<SankeyFile>(`budget_sankey_${year}.json`);
  if (!d) return { error: `Pas de budget sankey pour ${year}` };
  const links = [...(d.links ?? [])].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 15);
  return { year: d.year, type_budget: d.type_budget, dataStatus: d.dataStatus, totals: d.totals, top_links: links };
}

export function get_patrimoine({ year }: { year: number }) {
  const d = loadJson<PatrimoineFile>(`patrimoine_structure_${year}.json`);
  if (!d) return { error: `Pas de patrimoine pour ${year}` };
  const sd = d.structure_dette ?? {};
  return {
    year: d.year,
    total_dette_financiere: sd.total_dette_financiere,
    instruments: (sd.instruments ?? []).map((i) => ({ label: i.label, encours: i.encours, tag: i.tag })),
  };
}

// ---------- registry & schemas ----------

export const TOOL_SCHEMAS = [
  { name: "list_datasets", description: "Inventaire des datasets disponibles avec années couvertes.", input_schema: { type: "object", properties: {}, required: [] } },
  {
    name: "get_subventions_summary",
    description: "Totaux subventions pour une année + top N bénéficiaires par montant.",
    input_schema: { type: "object", properties: { year: { type: "integer" }, top_n: { type: "integer", default: 10 } }, required: ["year"] },
  },
  {
    name: "get_subventions_tendances",
    description: "Ventilation des subventions par thématique pour une année (Social, Culture, Logement, Sport...) ou tous les totaux annuels si year omis. À PRÉFÉRER pour 'quels secteurs', 'par thématique'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "search_beneficiaire",
    description: "Cherche un bénéficiaire de subventions par sous-chaîne (insensible casse), cross-années sauf si year précisé.",
    input_schema: { type: "object", properties: { query: { type: "string" }, year: { type: "integer" }, limit: { type: "integer", default: 15 } }, required: ["query"] },
  },
  {
    name: "get_marches_summary",
    description: "Totaux marchés publics année + top N par enveloppe max. ATTENTION enveloppe pluriannuelle ≠ dépense annuelle.",
    input_schema: { type: "object", properties: { year: { type: "integer" }, top_n: { type: "integer", default: 10 } }, required: ["year"] },
  },
  {
    name: "search_marches",
    description: "Cherche des marchés publics par mot-clé dans objet ou fournisseur. Filtres optionnels: année, montant_min.",
    input_schema: { type: "object", properties: { query: { type: "string" }, year: { type: "integer" }, min_montant: { type: "number", default: 0 }, limit: { type: "integer", default: 15 } }, required: ["query"] },
  },
  {
    name: "get_marches_tendances",
    description: "Évolution annuelle marchés 2013-2024 + ventilation par nature (TRAVAUX/SERVICES/FOURNITURES).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_budget_sankey",
    description: "Flux budgétaires (recettes/dépenses) d'une année + plus gros liens source→target.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: ["year"] },
  },
  {
    name: "get_patrimoine",
    description: "Structure de la dette financière de la Ville pour une année (total + instruments).",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: ["year"] },
  },
] as const;

type ToolArgs = Record<string, unknown>;

export const DISPATCH: Record<string, (args: ToolArgs) => unknown> = {
  list_datasets,
  get_subventions_summary: (args) => get_subventions_summary(args as { year: number; top_n?: number }),
  get_subventions_tendances: (args) => get_subventions_tendances(args as { year?: number }),
  search_beneficiaire: (args) => search_beneficiaire(args as { query: string; year?: number; limit?: number }),
  get_marches_summary: (args) => get_marches_summary(args as { year: number; top_n?: number }),
  search_marches: (args) => search_marches(args as { query: string; year?: number; min_montant?: number; limit?: number }),
  get_marches_tendances,
  get_budget_sankey: (args) => get_budget_sankey(args as { year: number }),
  get_patrimoine: (args) => get_patrimoine(args as { year: number }),
};

export function runTool(name: string, args: unknown): unknown {
  const fn = DISPATCH[name];
  if (!fn) return { error: `tool inconnu: ${name}` };
  const safeArgs = (args && typeof args === "object" ? args : {}) as ToolArgs;
  try {
    return fn(safeArgs);
  } catch (e) {
    return { error: `${(e as Error).name}: ${(e as Error).message}` };
  }
}
