/**
 * Types pour le dashboard multi-ville et le benchmarking.
 */

// ── Cities Index ──────────────────────────────────────────────────────────────

export interface CitiesIndex {
  cities: CityIndexEntry[];
  latest_year: number | null;
  available_years: number[];
}

export interface CityIndexEntry {
  slug: string;
  name: string;
  population: number;
  available_years: number[];
  datasets: string[];
}

// ── Benchmarking ──────────────────────────────────────────────────────────────

export interface BenchmarkingData {
  latest_year: number | null;
  available_years: number[];
  cities: CityBenchmark[];
}

export interface CityBenchmark {
  slug: string;
  name: string;
  population: number;
  years: Record<string, CityKPIs>;
}

export interface CityKPIs {
  recettes_fonctionnement: number | null;
  depenses_fonctionnement: number | null;
  produits_fiscaux: number | null;
  dgf: number | null;
  charges_personnel: number | null;
  depenses_investissement: number | null;
  encours_dette: number | null;
  epargne_brute: number | null;
  epargne_nette: number | null;
  recettes_par_hab: number | null;
  depenses_par_hab: number | null;
  dette_par_hab: number | null;
  investissement_par_hab: number | null;
  personnel_par_hab: number | null;
  fiscalite_par_hab: number | null;
  taux_epargne_brute: number | null;
  pct_personnel: number | null;
  ratio_dette_recettes: number | null;
}

// ── City Evolution ────────────────────────────────────────────────────────────

export interface CityEvolutionYear {
  year: number;
  recettes_totales: number | null;
  depenses_totales: number | null;
  solde: number | null;
  epargne_brute: number | null;
  section: {
    Fonctionnement: { recettes: number | null; depenses: number | null };
    Investissement: { recettes: number | null; depenses: number | null };
  };
  par_categorie: {
    personnel: number | null;
    fonctionnement_courant: number | null;
    transferts: number | null;
    charges_financieres: number | null;
    investissements: number | null;
  };
}

// ── City Marchés ──────────────────────────────────────────────────────────────

export interface CityMarchesData {
  annee: number;
  city_slug: string;
  total_montant: number;
  total_marches: number;
  categories: MarchesCategory[];
  top_marches: MarcheDetail[];
}

export interface MarchesCategory {
  categorie: string;
  nb_marches: number;
  montant_total: number | null;
  montant_moyen: number | null;
}

export interface MarcheDetail {
  objet: string;
  montant: number | null;
  categorie: string;
  titulaire: string;
  date: string;
  procedure: string;
}

// ── City Subventions ──────────────────────────────────────────────────────────

export interface CitySubventionsData {
  annee: number;
  city_slug: string;
  total_montant: number | null;
  nb_subventions: number;
  nb_beneficiaires: number;
  beneficiaires: SubventionBeneficiaire[];
}

export interface SubventionBeneficiaire {
  beneficiaire: string;
  objet: string;
  montant: number | null;
  nature: string;
  date: string;
}

// ── City Bilan ────────────────────────────────────────────────────────────────

export interface CityBilanData {
  year: number;
  city_slug: string;
  totals: {
    actif_total: number | null;
    passif_total: number | null;
    dette_financiere: number | null;
    fonds_propres: number | null;
    tresorerie: number | null;
    immobilisations: number | null;
  };
  kpis: {
    ratio_endettement: number | null;
    pct_fonds_propres: number | null;
    dette_par_hab: number | null;
  };
}

// ── Simple Year Index ─────────────────────────────────────────────────────────

export interface YearIndex {
  availableYears: number[];
  latestYear?: number;
}
