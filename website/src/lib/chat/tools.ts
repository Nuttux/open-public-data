import fs from "node:fs";
import path from "node:path";
import { GENERATED_DATA_INVENTORY as INV } from "./dataContext.generated";

const DATA_DIR = path.join(process.cwd(), "public", "data");

// Les exports ne changent qu'au déploiement — cache mémoire process-wide.
const fileCache = new Map<string, unknown>();

function loadJson<T = unknown>(rel: string): T | null {
  if (fileCache.has(rel)) return fileCache.get(rel) as T | null;
  const p = path.join(DATA_DIR, rel);
  const parsed = fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf-8")) as T) : null;
  fileCache.set(rel, parsed);
  return parsed;
}

// Recherche insensible aux accents/majuscules, tous les mots requis.
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const queryTokens = (q: string) => fold(q).split(/\s+/).filter((t) => t.length >= 2);
const matchesAll = (hay: string, toks: string[]) => toks.every((t) => hay.includes(t));

const round0 = (v: number | undefined | null) => (typeof v === "number" ? Math.round(v) : v);

// ---------- data shapes ----------

type BeneficiaireRow = {
  beneficiaire?: string;
  nature_juridique?: string;
  thematique?: string;
  sous_categorie?: string;
  montant_total?: number;
  nb_subventions?: number;
};
type SubventionsYearFile = { data: BeneficiaireRow[]; total_montant?: number; nb_beneficiaires?: number };

type BenefSearchRow = {
  name?: string;
  norm?: string;
  siret?: string | null;
  theme?: string;
  totalAmount?: number;
  lastActiveYear?: number;
  nb?: number;
  byYear?: Record<string, number>;
};
type BenefSearchFile = { count?: number; years?: number[]; data: BenefSearchRow[] };

type ThemeEntry = { label?: string; montant?: number; count?: number };
type SubvTrendsFile = {
  note_perimetre?: string;
  source?: string;
  years: { year: number; total_montant?: number; nb_subventions?: number; nb_beneficiaires?: number; par_thematique?: ThemeEntry[] }[];
};

type MarcheRow = {
  objet?: string;
  nature?: string;
  fournisseur_nom?: string;
  fournisseur_siret?: string | null;
  is_multiattributaire?: boolean;
  montant_min?: number;
  montant_max?: number;
  date_notification?: string;
};
type MarchesYearFile = { data: MarcheRow[]; note?: string; enveloppe_max_totale?: number; nb_marches?: number };
type MarchesTrendsFile = {
  note?: string;
  years: { year: number; enveloppe_totale?: number; nb_marches?: number; par_nature?: ThemeEntry[]; par_categorie?: ThemeEntry[] }[];
};

type SankeyLink = { source?: string; target?: string; value?: number };
type SankeyFile = {
  year: number;
  type_budget?: string;
  dataStatus?: string;
  totals?: Record<string, number>;
  links?: SankeyLink[];
};

type BudgetNatureFile = {
  year: number;
  total_depenses?: number;
  niveau_1?: { nature?: string; montant?: number; pct?: number }[];
  niveau_2?: Record<string, { thematique?: string; montant?: number; pct?: number }[]>;
};

type EvolutionFile = {
  year_types?: Record<string, string>;
  definitions?: Record<string, string>;
  years: {
    year: number;
    type_budget?: string;
    totals?: Record<string, number>;
    sections?: { fonctionnement?: Record<string, number>; investissement?: Record<string, number> };
    variations?: Record<string, number>;
    epargne_brute?: number;
  }[];
};

type VoteExecuteFile = {
  coverage?: { comparison_years?: number[]; forecast_years?: number[]; note_perimeter?: string };
  definitions?: Record<string, string>;
  global_rates?: {
    annee: number;
    type?: string;
    depenses_vote?: number;
    depenses_execute?: number;
    taux_global?: number;
    vote_fonct?: number;
    execute_fonct?: number;
    taux_fonct?: number;
    vote_inves?: number;
    execute_inves?: number;
    taux_inves?: number;
  }[];
};

type InvestFile = {
  source?: string;
  note_perimetre?: string;
  years: {
    year: number;
    depenses_total?: number;
    recettes_total?: number;
    depenses_hors_dette?: number;
    par_chapitre?: { label?: string; depenses?: number; recettes?: number }[];
  }[];
};

type PatrimoineFile = {
  year: number;
  structure_dette?: {
    total_dette_financiere?: number;
    instruments?: {
      label?: string;
      subtitle?: string;
      description?: string;
      encours?: number;
      part?: number;
      taux_moyen_pct?: number;
      maturite_moyenne_ans?: number;
    }[];
    taux?: { part_fixe?: number; part_variable?: number; taux_fixe_moyen_pondere_pct?: number; indice_variable?: string };
    bond_issuances?: { year?: number; amount_m_eur?: number; rate_pct?: number; maturity_years?: number; label?: string; meta?: string }[];
    bond_issuances_total_m_eur?: number;
    prochaine_echeance_lourde?: { annee?: number; mois?: string; montant_m_eur?: number; libelle?: string };
  };
};

type BilanFile = { year: number; totals?: Record<string, number>; kpis?: Record<string, number> };

type HorsBilanFile = {
  year: number;
  totals?: Record<string, number>;
  taux?: {
    part_fixe?: number;
    part_variable?: number;
    taux_moyen_pondere_pct?: number;
    duree_residuelle_moyenne_ans?: number;
  };
  by_nature?: { key?: string; label?: string; capital_restant?: number; share?: number; count_emprunts?: number }[];
  top_beneficiaires?: { name?: string; capital_restant?: number; share?: number; nature_dominante?: string; count_emprunts?: number }[];
  top_preteurs?: { name?: string; capital_restant?: number; share?: number }[];
};

type LogementRow = Record<string, unknown>;
type LogementFile = {
  year?: number;
  source?: string;
  source_url?: string;
  paris_total?: LogementRow;
  arrondissements?: (LogementRow & { arrondissement?: number; ratio_dem_attrib?: number })[];
};

// ---------- tool implementations ----------

export function list_datasets() {
  return {
    subventions: INV.subventions && { years: INV.subventions.years, thematiques: INV.subventions.thematiques },
    marches_publics: INV.marches && { years: INV.marches.years, note: INV.marches.note },
    budget: INV.budget && { years: INV.budget.years, year_types: INV.budget.year_types },
    budget_par_nature: { years: INV.budget_nature.years },
    evolution_budget: INV.evolution && { years: INV.evolution.years },
    vote_vs_execute: INV.vote_execute && { comparison_years: INV.vote_execute.comparison_years },
    investissements: INV.investissements && { years: INV.investissements.years },
    dette_directe: { years: INV.dette.years },
    bilan_patrimoine: { years: INV.bilan.years },
    garanties_hors_bilan: { years: INV.hors_bilan.years },
    logement_social: INV.logement_social && { year: INV.logement_social.year },
  };
}

export function get_subventions_summary({ year, top_n = 10, thematique }: { year: number; top_n?: number; thematique?: string }) {
  const d = loadJson<SubventionsYearFile>(`subventions/beneficiaires_${year}.json`);
  if (!d) return { error: `Pas de subventions pour ${year}`, annees_disponibles: INV.subventions?.years };
  const toks = thematique ? queryTokens(thematique) : null;
  const rows = toks ? d.data.filter((r) => matchesAll(fold(r.thematique ?? ""), toks)) : d.data;
  const top = [...rows].sort((a, b) => (b.montant_total ?? 0) - (a.montant_total ?? 0)).slice(0, Math.min(top_n, 25));
  return {
    year,
    filtre_thematique: thematique ?? null,
    total_montant: round0(thematique ? rows.reduce((s, r) => s + (r.montant_total ?? 0), 0) : d.total_montant),
    nb_beneficiaires: thematique ? rows.length : d.nb_beneficiaires,
    source: "Open Data Paris — subventions votées (montants annuels par bénéficiaire)",
    top: top.map((r) => ({
      beneficiaire: r.beneficiaire,
      nature_juridique: r.nature_juridique,
      thematique: r.thematique,
      montant_total: round0(r.montant_total),
      nb_subventions: r.nb_subventions,
    })),
  };
}

export function get_subventions_tendances({ year }: { year?: number }) {
  const d = loadJson<SubvTrendsFile>("subventions/subventions_tendances.json");
  if (!d) return { error: "tendances absentes" };
  if (year == null) {
    return {
      source: d.source,
      note_perimetre: d.note_perimetre,
      years_summary: d.years.map((y) => ({
        year: y.year,
        total_montant: round0(y.total_montant),
        nb_subventions: y.nb_subventions,
        nb_beneficiaires: y.nb_beneficiaires,
      })),
    };
  }
  const m = d.years.find((y) => y.year === year);
  if (!m) return { error: `pas de tendances ${year}`, annees_disponibles: d.years.map((y) => y.year) };
  return {
    year: m.year,
    total_montant: round0(m.total_montant),
    nb_subventions: m.nb_subventions,
    note_perimetre: d.note_perimetre,
    par_thematique: (m.par_thematique ?? []).map((t) => ({ label: t.label, montant: round0(t.montant), count: t.count })),
  };
}

export function search_beneficiaire({ query, year, limit = 12 }: { query: string; year?: number; limit?: number }) {
  const idx = loadJson<BenefSearchFile>("subventions/beneficiaires_search.json");
  if (!idx) return { error: "index de recherche absent" };
  const toks = queryTokens(query);
  if (!toks.length) return { error: "requête trop courte" };
  const matches = idx.data.filter((r) => matchesAll(r.norm ?? fold(r.name ?? ""), toks));
  const filtered = year ? matches.filter((r) => r.byYear && r.byYear[String(year)] != null) : matches;
  filtered.sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0));
  return {
    query,
    annees_couvertes: idx.years,
    nb_matches: filtered.length,
    note: "totalAmount = cumul sur toutes les années disponibles ; byYear = montant par année ; une même entité peut apparaître sous plusieurs libellés proches — vérifier les variantes",
    results: filtered.slice(0, Math.min(limit, 20)).map((r) => ({
      beneficiaire: r.name,
      thematique: r.theme,
      total_toutes_annees: round0(r.totalAmount),
      byYear: Object.fromEntries(Object.entries(r.byYear ?? {}).map(([y, v]) => [y, round0(v)])),
    })),
  };
}

export function get_marches_summary({ year, top_n = 10 }: { year: number; top_n?: number }) {
  const d = loadJson<MarchesYearFile>(`marches-publics/marches_${year}.json`);
  if (!d) return { error: `Pas de marchés pour ${year}`, annees_disponibles: INV.marches?.years };
  const trends = loadJson<MarchesTrendsFile>("marches-publics/marches_tendances.json");
  const yTrend = trends?.years.find((y) => y.year === year);
  const top = [...d.data].sort((a, b) => (b.montant_max ?? 0) - (a.montant_max ?? 0)).slice(0, Math.min(top_n, 25));
  return {
    year,
    note: d.note ?? "montant_max = enveloppe pluriannuelle (plafond contractuel), pas une dépense annuelle",
    enveloppe_max_totale: round0(d.enveloppe_max_totale),
    nb_marches: d.nb_marches,
    par_nature: yTrend?.par_nature?.map((n) => ({ label: n.label, montant: round0(n.montant), count: n.count })),
    top_categories: yTrend?.par_categorie?.slice(0, 8).map((c) => ({ label: c.label, montant: round0(c.montant), count: c.count })),
    top_contrats: top.map((r) => ({
      objet: r.objet,
      nature: r.nature,
      fournisseur: r.fournisseur_nom,
      montant_max: round0(r.montant_max),
      date_notification: r.date_notification,
    })),
  };
}

export function search_marches({ query, year, min_montant = 0, limit = 12 }: { query: string; year?: number; min_montant?: number; limit?: number }) {
  const toks = queryTokens(query);
  if (!toks.length) return { error: "requête trop courte" };
  const years = year ? [year] : [...(INV.marches?.years ?? [])].sort((a, b) => b - a);
  type Hit = { year: number; objet?: string; fournisseur?: string; nature?: string; montant_max?: number | null; date_notification?: string };
  const results: Hit[] = [];
  let total = 0;
  for (const y of years) {
    const d = loadJson<MarchesYearFile>(`marches-publics/marches_${y}.json`);
    if (!d) continue;
    for (const r of d.data) {
      if ((r.montant_max ?? 0) < min_montant) continue;
      if (!matchesAll(fold(`${r.objet ?? ""} ${r.fournisseur_nom ?? ""}`), toks)) continue;
      total += r.montant_max ?? 0;
      results.push({
        year: y,
        objet: r.objet,
        fournisseur: r.fournisseur_nom,
        nature: r.nature,
        montant_max: round0(r.montant_max),
        date_notification: r.date_notification,
      });
    }
  }
  results.sort((a, b) => (b.montant_max ?? 0) - (a.montant_max ?? 0));
  return {
    query,
    annees_cherchees: year ? [year] : `${Math.min(...years)}–${Math.max(...years)}`,
    nb_matches: results.length,
    somme_enveloppes_max: round0(total),
    note: "montants = enveloppes pluriannuelles (plafonds), PAS des dépenses annuelles ; la somme cumule des contrats de durées différentes",
    results: results.slice(0, Math.min(limit, 20)),
  };
}

export function get_marches_tendances() {
  const d = loadJson<MarchesTrendsFile>("marches-publics/marches_tendances.json");
  if (!d) return { error: "absent" };
  return {
    note: d.note,
    years: d.years.map((y) => ({
      year: y.year,
      enveloppe_totale: round0(y.enveloppe_totale),
      nb_marches: y.nb_marches,
      par_nature: y.par_nature?.map((n) => ({ label: n.label, montant: round0(n.montant), count: n.count })),
    })),
  };
}

export function get_top_fournisseurs({ limit = 15, year }: { limit?: number; year?: number }) {
  const years = year ? [year] : [...(INV.marches?.years ?? [])];
  type Agg = { nom: string; total: number; nb: number; yMin: number; yMax: number };
  const bySupplier = new Map<string, Agg>();
  let multiTotal = 0;
  let multiNb = 0;
  for (const y of years) {
    const d = loadJson<MarchesYearFile>(`marches-publics/marches_${y}.json`);
    if (!d) continue;
    for (const r of d.data) {
      const montant = r.montant_max ?? 0;
      if (r.is_multiattributaire || fold(r.fournisseur_nom ?? "") === "marche multiattributaire") {
        multiTotal += montant;
        multiNb += 1;
        continue;
      }
      if (!r.fournisseur_nom) continue;
      // identité : SIREN (9 premiers chiffres du SIRET) si présent, sinon nom normalisé
      const key = r.fournisseur_siret ? r.fournisseur_siret.slice(0, 9) : fold(r.fournisseur_nom);
      const cur = bySupplier.get(key) ?? { nom: r.fournisseur_nom, total: 0, nb: 0, yMin: y, yMax: y };
      cur.total += montant;
      cur.nb += 1;
      cur.yMin = Math.min(cur.yMin, y);
      cur.yMax = Math.max(cur.yMax, y);
      bySupplier.set(key, cur);
    }
  }
  const top = [...bySupplier.values()].sort((a, b) => b.total - a.total).slice(0, Math.min(limit, 30));
  return {
    periode: year ? String(year) : `${Math.min(...years)}–${Math.max(...years)}`,
    note: "cumuls d'enveloppes contractuelles PLURIANNUELLES (plafonds), pas des dépenses réelles ; identité par SIREN quand disponible, sinon par nom",
    marches_multiattributaires_hors_classement: { total_enveloppes: round0(multiTotal), nb_marches: multiNb, note: "groupements sans attributaire individuel identifié dans les données" },
    top: top.map((t) => ({
      fournisseur: t.nom,
      total_enveloppes_max: round0(t.total),
      nb_marches: t.nb,
      annees: t.yMin === t.yMax ? String(t.yMin) : `${t.yMin}–${t.yMax}`,
    })),
  };
}

export function get_budget_sankey({ year }: { year: number }) {
  const d = loadJson<SankeyFile>(`budget_sankey_${year}.json`);
  if (!d) return { error: `Pas de budget sankey pour ${year}`, annees_disponibles: INV.budget?.years };
  const links = [...(d.links ?? [])].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 15);
  return {
    year: d.year,
    type_budget: d.type_budget,
    dataStatus: d.dataStatus,
    note_perimetre: "flux agrégés des opérations ventilées ; le total du budget (avec dette, dotations) est plus élevé — utiliser get_evolution_budget pour les totaux complets",
    totals: Object.fromEntries(Object.entries(d.totals ?? {}).map(([k, v]) => [k, round0(v)])),
    top_links: links.map((l) => ({ source: l.source, target: l.target, value: round0(l.value) })),
  };
}

export function get_budget_nature({ year, nature }: { year: number; nature?: string }) {
  const d = loadJson<BudgetNatureFile>(`budget_nature_${year}.json`);
  if (!d) return { error: `Pas de budget par nature pour ${year}`, annees_disponibles: INV.budget_nature.years };
  if (nature) {
    const toks = queryTokens(nature);
    const key = Object.keys(d.niveau_2 ?? {}).find((k) => matchesAll(fold(k), toks));
    if (!key)
      return { error: `nature inconnue: ${nature}`, natures_disponibles: Object.keys(d.niveau_2 ?? {}) };
    const total = (d.niveau_1 ?? []).find((n) => n.nature === key);
    return {
      year: d.year,
      nature: key,
      total_nature: round0(total?.montant),
      note: "ventilation de cette nature comptable par thématique (croisement nature × secteur)",
      par_thematique: (d.niveau_2?.[key] ?? []).map((t) => ({ thematique: t.thematique, montant: round0(t.montant), pct: t.pct })),
    };
  }
  return {
    year: d.year,
    total_depenses: round0(d.total_depenses),
    note: "dépenses par nature comptable (M57), fonctionnement + investissement du Budget Principal ; chaque nature est ventilable par thématique via le param nature",
    par_nature: (d.niveau_1 ?? []).map((n) => ({ nature: n.nature, montant: round0(n.montant), pct: n.pct })),
  };
}

export function get_evolution_budget({ year }: { year?: number }) {
  const d = loadJson<EvolutionFile>("evolution_budget.json");
  if (!d) return { error: "absent" };
  if (year == null) {
    return {
      note: "recettes_propres = recettes hors emprunts ; epargne_brute = capacité d'autofinancement ; variation_dette_nette = emprunts - remboursements",
      years: [...d.years]
        .sort((a, b) => a.year - b.year)
        .map((y) => ({
          year: y.year,
          type_budget: y.type_budget,
          recettes: round0(y.totals?.recettes),
          depenses: round0(y.totals?.depenses),
          epargne_brute: round0(y.epargne_brute),
          emprunts: round0(y.totals?.emprunts),
          variation_dette_nette: round0(y.totals?.variation_dette_nette),
        })),
    };
  }
  const m = d.years.find((y) => y.year === year);
  if (!m) return { error: `pas de données ${year}`, annees_disponibles: d.years.map((y) => y.year) };
  return {
    year: m.year,
    type_budget: m.type_budget,
    definitions: d.definitions,
    totals: Object.fromEntries(Object.entries(m.totals ?? {}).map(([k, v]) => [k, round0(v)])),
    fonctionnement: m.sections?.fonctionnement && Object.fromEntries(Object.entries(m.sections.fonctionnement).map(([k, v]) => [k, round0(v)])),
    investissement: m.sections?.investissement && Object.fromEntries(Object.entries(m.sections.investissement).map(([k, v]) => [k, round0(v)])),
    epargne_brute: round0(m.epargne_brute),
  };
}

export function get_vote_vs_execute({ year }: { year?: number }) {
  const d = loadJson<VoteExecuteFile>("vote_vs_execute.json");
  if (!d) return { error: "absent" };
  const rows = (d.global_rates ?? []).filter((r) => r.type === "comparaison");
  const shape = (r: NonNullable<VoteExecuteFile["global_rates"]>[number]) => ({
    annee: r.annee,
    depenses_votees: round0(r.depenses_vote),
    depenses_executees: round0(r.depenses_execute),
    taux_execution_global_pct: r.taux_global,
    taux_fonctionnement_pct: r.taux_fonct,
    taux_investissement_pct: r.taux_inves,
  });
  if (year == null) {
    return { note_perimetre: d.coverage?.note_perimeter, definitions: d.definitions, comparaisons: rows.map(shape) };
  }
  const m = rows.find((r) => r.annee === year);
  if (!m) return { error: `pas de comparaison voté/exécuté pour ${year}`, annees_disponibles: rows.map((r) => r.annee) };
  return { note_perimetre: d.coverage?.note_perimeter, ...shape(m) };
}

export function get_investissements({ year }: { year?: number }) {
  const d = loadJson<InvestFile>("investissement_tendances.json");
  if (!d) return { error: "absent" };
  if (year == null) {
    return {
      source: d.source,
      note_perimetre: d.note_perimetre,
      years: d.years.map((y) => ({
        year: y.year,
        depenses_total: round0(y.depenses_total),
        depenses_hors_dette: round0(y.depenses_hors_dette),
      })),
    };
  }
  const m = d.years.find((y) => y.year === year);
  if (!m) return { error: `pas d'investissements ${year}`, annees_disponibles: d.years.map((y) => y.year) };
  return {
    year: m.year,
    note_perimetre: d.note_perimetre,
    depenses_total: round0(m.depenses_total),
    depenses_hors_dette: round0(m.depenses_hors_dette),
    recettes_total: round0(m.recettes_total),
    par_chapitre: (m.par_chapitre ?? [])
      .sort((a, b) => (b.depenses ?? 0) - (a.depenses ?? 0))
      .map((c) => ({ label: c.label, depenses: round0(c.depenses) })),
  };
}

export function get_dette_structure({ year }: { year?: number }) {
  const years = INV.dette.years;
  if (year == null) {
    return {
      note: "dette financière directe de la Ville (hors garanties données — voir get_hors_bilan)",
      series: years
        .map((y) => {
          const d = loadJson<PatrimoineFile>(`patrimoine_structure_${y}.json`);
          return d && { year: y, total_dette_financiere: round0(d.structure_dette?.total_dette_financiere) };
        })
        .filter(Boolean),
    };
  }
  const d = loadJson<PatrimoineFile>(`patrimoine_structure_${year}.json`);
  if (!d) return { error: `Pas de dette pour ${year}`, annees_disponibles: years };
  const sd = d.structure_dette ?? {};
  return {
    year: d.year,
    total_dette_financiere: round0(sd.total_dette_financiere),
    note: "dette directe uniquement ; les garanties accordées aux bailleurs sont dans get_hors_bilan",
    instruments: (sd.instruments ?? []).map((i) => ({
      label: i.label,
      qui: i.subtitle,
      description: i.description,
      encours: round0(i.encours),
      part: i.part,
      taux_moyen_pct: i.taux_moyen_pct,
      maturite_moyenne_ans: i.maturite_moyenne_ans,
    })),
    taux: sd.taux,
    emissions_obligataires: (sd.bond_issuances ?? []).map((b) => ({
      year: b.year,
      label: b.label,
      montant_m_eur: b.amount_m_eur,
      taux_pct: b.rate_pct,
      maturite_ans: b.maturity_years,
      note: b.meta,
    })),
    emissions_total_m_eur: sd.bond_issuances_total_m_eur,
    prochaine_echeance_lourde: sd.prochaine_echeance_lourde,
  };
}

export function get_bilan({ year }: { year?: number }) {
  const years = INV.bilan.years;
  if (year == null) {
    return {
      series: years
        .map((y) => {
          const d = loadJson<BilanFile>(`bilan_sankey_${y}.json`);
          return (
            d && {
              year: y,
              actif_net: round0(d.totals?.actif_net),
              fonds_propres: round0(d.totals?.fonds_propres),
              dette_totale: round0(d.totals?.dette_totale),
              ratio_endettement: d.kpis?.ratio_endettement,
            }
          );
        })
        .filter(Boolean),
    };
  }
  const d = loadJson<BilanFile>(`bilan_sankey_${year}.json`);
  if (!d) return { error: `Pas de bilan pour ${year}`, annees_disponibles: years };
  return {
    year: d.year,
    totals: Object.fromEntries(Object.entries(d.totals ?? {}).map(([k, v]) => [k, round0(v)])),
    kpis: d.kpis,
    note: "bilan comptable au 31/12 (actif/passif) ; dette_totale inclut dettes financières et non financières",
  };
}

export function get_hors_bilan({ year }: { year?: number }) {
  const years = INV.hors_bilan.years;
  if (year == null) {
    return {
      note: "garanties d'emprunt ACCORDÉES par la Ville (hors-bilan) — pas sa dette directe ; la Ville ne paie qu'en cas de défaut de l'emprunteur",
      series: years
        .map((y) => {
          const d = loadJson<HorsBilanFile>(`hors_bilan_${y}.json`);
          return d && { year: y, capital_restant_garanti: round0(d.totals?.capital_restant), nb_beneficiaires: d.totals?.count_beneficiaires };
        })
        .filter(Boolean),
    };
  }
  const d = loadJson<HorsBilanFile>(`hors_bilan_${year}.json`);
  if (!d) return { error: `Pas de hors-bilan pour ${year}`, annees_disponibles: years };
  return {
    year: d.year,
    note: "garanties d'emprunt accordées (hors-bilan), essentiellement au logement social — PAS la dette directe de la Ville",
    totals: Object.fromEntries(Object.entries(d.totals ?? {}).map(([k, v]) => [k, round0(v)])),
    taux: d.taux && {
      taux_moyen_pondere_pct: d.taux.taux_moyen_pondere_pct,
      part_taux_fixe: d.taux.part_fixe,
      duree_residuelle_moyenne_ans: d.taux.duree_residuelle_moyenne_ans,
    },
    par_nature: (d.by_nature ?? []).map((n) => ({ label: n.label, capital_restant: round0(n.capital_restant), share: n.share })),
    top_beneficiaires: (d.top_beneficiaires ?? []).slice(0, 6).map((b) => ({
      name: b.name,
      capital_restant: round0(b.capital_restant),
      share: b.share,
      nature_dominante: b.nature_dominante,
    })),
    top_preteurs: (d.top_preteurs ?? []).slice(0, 5).map((p) => ({ name: p.name, capital_restant: round0(p.capital_restant), share: p.share })),
  };
}

export function get_logement_social() {
  const d = loadJson<LogementFile>("logement_attente_paris.json");
  if (!d) return { error: "absent" };
  const arrs = [...(d.arrondissements ?? [])].sort((a, b) => (b.ratio_dem_attrib ?? 0) - (a.ratio_dem_attrib ?? 0));
  return {
    year: d.year,
    source: d.source,
    source_url: d.source_url,
    paris_total: d.paris_total,
    note: "demandes_choix1 = demandes dont Paris est le 1er choix ; ratio_dem_attrib = demandes par attribution (tension)",
    arrondissements_plus_tendus: arrs.slice(0, 5),
    arrondissements_moins_tendus: arrs.slice(-3),
  };
}

// ---------- registry & schemas ----------

export const TOOL_SCHEMAS = [
  {
    name: "list_datasets",
    description: "Inventaire des datasets disponibles avec leurs années. Appelle-le si tu doutes de la couverture avant de répondre 'donnée absente'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_subventions_summary",
    description: "Totaux subventions d'une année + top N bénéficiaires. Param optionnel thematique (ex. 'Culture') pour un top filtré. Appelle-le pour 'qui reçoit le plus', 'top associations'.",
    input_schema: {
      type: "object",
      properties: { year: { type: "integer" }, top_n: { type: "integer", default: 10 }, thematique: { type: "string" } },
      required: ["year"],
    },
  },
  {
    name: "get_subventions_tendances",
    description: "Sans year : série annuelle des totaux de subventions. Avec year : ventilation par thématique (Social, Culture, Logement…). Appelle-le pour 'quels secteurs', 'évolution des subventions'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "search_beneficiaire",
    description: "Cherche un bénéficiaire de subventions par nom (insensible accents/casse, tous les mots requis). Renvoie le cumul et le détail par année. Appelle-le dès qu'un nom d'association/organisme est mentionné.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, year: { type: "integer" }, limit: { type: "integer", default: 12 } },
      required: ["query"],
    },
  },
  {
    name: "get_marches_summary",
    description: "Marchés publics d'une année : enveloppe totale, répartition par nature, top catégories d'achat, top contrats. Appelle-le pour 'plus gros marchés', 'sur quoi Paris passe des contrats'.",
    input_schema: { type: "object", properties: { year: { type: "integer" }, top_n: { type: "integer", default: 10 } }, required: ["year"] },
  },
  {
    name: "search_marches",
    description: "Cherche des marchés par mots-clés dans l'objet ou le fournisseur (insensible accents/casse), toutes années sauf si year. Appelle-le pour un fournisseur ('Capgemini'), un sujet ('vélo', 'conseil'), un type de prestation.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, year: { type: "integer" }, min_montant: { type: "number", default: 0 }, limit: { type: "integer", default: 12 } },
      required: ["query"],
    },
  },
  {
    name: "get_top_fournisseurs",
    description: "Classement des fournisseurs de la Ville par enveloppes cumulées (toutes années, ou une année via year). Les marchés multiattributaires (groupements sans nom) sont comptés à part. Appelle-le pour 'top fournisseurs', 'qui a le plus de contrats', 'plus gros prestataires'.",
    input_schema: { type: "object", properties: { limit: { type: "integer", default: 15 }, year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_marches_tendances",
    description: "Évolution annuelle des marchés publics (enveloppes, nombre, répartition TRAVAUX/SERVICES/FOURNITURES) sur toutes les années.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_budget_sankey",
    description: "Grands flux budgétaires d'une année (recettes→dépenses agrégées, opérations ventilées). Appelle-le pour 'd'où vient l'argent', 'où va l'argent' d'une année donnée.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: ["year"] },
  },
  {
    name: "get_budget_nature",
    description: "Dépenses d'une année par nature comptable : Personnel (masse salariale), péréquation, transferts sociaux… Avec le param nature (ex. 'Personnel'), ventile cette nature PAR THÉMATIQUE (Éducation, Social, Culture…) — le seul croisement nature × secteur disponible. Appelle-le pour 'salaires', 'salaires des écoles', 'combien part en X'.",
    input_schema: { type: "object", properties: { year: { type: "integer" }, nature: { type: "string" } }, required: ["year"] },
  },
  {
    name: "get_evolution_budget",
    description: "Sans year : série annuelle recettes/dépenses/épargne brute/emprunts/variation de dette. Avec year : détail complet (sections fonctionnement/investissement, définitions). Appelle-le pour 'le budget augmente ?', 'Paris s'endette ?', 'épargne'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_vote_vs_execute",
    description: "Compare budget voté (BP) et exécuté (CA) : taux d'exécution global, fonctionnement, investissement. Appelle-le pour 'Paris dépense-t-elle ce qu'elle vote ?', 'dépassement de budget'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_investissements",
    description: "Investissement réel (CA, hors dette) par an ; avec year : ventilation par chapitre (Aménagement & Habitat, Culture & Sport, Transports…). Appelle-le pour 'combien Paris investit', 'dans quoi'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_dette_structure",
    description: "Dette financière DIRECTE de la Ville. Sans year : série annuelle du total. Avec year : détail par instrument (obligataire/bancaire/divers, qui prête, taux, maturités), liste des émissions obligataires (dont green bonds), prochaine échéance lourde. Appelle-le pour 'combien Paris doit', 'qui prête', 'green bonds', 'la dette augmente ?'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_bilan",
    description: "Bilan comptable (actif/passif au 31/12) : actif net, fonds propres, ratio d'endettement. Sans year : série annuelle. Appelle-le pour 'que possède Paris', 'patrimoine', 'santé financière'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_hors_bilan",
    description: "Garanties d'emprunt ACCORDÉES par la Ville (≠ dette directe), essentiellement bailleurs sociaux. Avec year : top bénéficiaires (RIVP, Paris Habitat…), prêteurs, taux. Appelle-le pour 'garanties', 'engagements hors bilan'.",
    input_schema: { type: "object", properties: { year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_logement_social",
    description: "Demande de logement social à Paris : demandes, attributions, délai médian, tension par arrondissement (source DRIHL). Appelle-le pour 'liste d'attente', 'demandeurs de logement social'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
] as const;

type ToolArgs = Record<string, unknown>;

export const DISPATCH: Record<string, (args: ToolArgs) => unknown> = {
  list_datasets,
  get_subventions_summary: (a) => get_subventions_summary(a as { year: number; top_n?: number; thematique?: string }),
  get_subventions_tendances: (a) => get_subventions_tendances(a as { year?: number }),
  search_beneficiaire: (a) => search_beneficiaire(a as { query: string; year?: number; limit?: number }),
  get_marches_summary: (a) => get_marches_summary(a as { year: number; top_n?: number }),
  search_marches: (a) => search_marches(a as { query: string; year?: number; min_montant?: number; limit?: number }),
  get_marches_tendances,
  get_top_fournisseurs: (a) => get_top_fournisseurs(a as { limit?: number; year?: number }),
  get_budget_sankey: (a) => get_budget_sankey(a as { year: number }),
  get_budget_nature: (a) => get_budget_nature(a as { year: number; nature?: string }),
  get_evolution_budget: (a) => get_evolution_budget(a as { year?: number }),
  get_vote_vs_execute: (a) => get_vote_vs_execute(a as { year?: number }),
  get_investissements: (a) => get_investissements(a as { year?: number }),
  get_dette_structure: (a) => get_dette_structure(a as { year?: number }),
  get_bilan: (a) => get_bilan(a as { year?: number }),
  get_hors_bilan: (a) => get_hors_bilan(a as { year?: number }),
  get_logement_social,
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
