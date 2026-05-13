import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data", "national");

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

// ─── Eurostat COFOG (gov_10a_exp) ──────────────────────────────────────────

export type CofogFunction = {
  code: string;
  label_fr: string;
  label_en: string;
  values_pct_gdp: Record<string, number>;
};

export type CofogCountry = {
  code: string;
  label_fr: string;
  label_en: string;
};

export type EurostatCofog = {
  perimeter: string;
  perimeter_label_fr: string;
  perimeter_label_en: string;
  source: string;
  source_url: string;
  source_dataset_id: string;
  unit: string;
  unit_en: string;
  year: number;
  fetched_at: string;
  eurostat_updated: string;
  countries: CofogCountry[];
  functions: CofogFunction[];
  notes_fr: string;
  notes_en: string;
};

type CofogIndex = {
  available_years: number[];
  latest_year: number;
  source: string;
  source_url: string;
  fetched_at: string;
};

export function loadEurostatCofog(): EurostatCofog | null {
  const idx = readJsonOrNull<CofogIndex>("eurostat_cofog_index.json");
  if (!idx) return null;
  return readJsonOrNull<EurostatCofog>(`eurostat_cofog_${idx.latest_year}.json`);
}

// ─── Eurostat quarterly debt (gov_10q_ggdebt) ──────────────────────────────

export type DebtPoint = { t: string; v: number | null };

export type DebtSeries = {
  code: string;
  label_fr: string;
  label_en: string;
  pc_gdp: DebtPoint[];
  mio_eur: DebtPoint[];
};

export type DebtPeer = {
  geo: string;
  label_fr: string;
  label_en: string;
  value_pct_gdp: number | null;
};

export type EurostatDette = {
  perimeter: string;
  perimeter_label_fr: string;
  perimeter_label_en: string;
  source: string;
  source_url: string;
  source_dataset_id: string;
  na_item: string;
  fetched_at: string;
  eurostat_updated: string;
  latest_quarter: string;
  fr_series: DebtSeries[];
  peer_compare: {
    quarter: string;
    values: DebtPeer[];
  };
  notes_fr: string;
  notes_en: string;
};

export function loadEurostatDette(): EurostatDette | null {
  return readJsonOrNull<EurostatDette>("eurostat_dette.json");
}

// ─── Eurostat tax revenue (gov_10a_taxag) ──────────────────────────────────

export type FiscaliteRow = {
  code: string;
  label_fr: string;
  label_en: string;
  pc_gdp: number | null;
  mio_eur: number | null;
};

export type FiscaliteSeries = {
  code: string;
  label_fr: string;
  label_en: string;
  pc_gdp: Array<{ t: string; v: number | null }>;
};

export type FiscalitePeer = {
  geo: string;
  label_fr: string;
  label_en: string;
  value_pct_gdp: number | null;
};

export type EurostatFiscalite = {
  perimeter: string;
  perimeter_label_fr: string;
  perimeter_label_en: string;
  source: string;
  source_url: string;
  source_dataset_id: string;
  fetched_at: string;
  latest_year: number;
  fr_total_po: FiscaliteRow;
  fr_breakdown: FiscaliteRow[];
  fr_evolution: FiscaliteSeries[];
  evolution_years: string[];
  peer_compare: {
    year: number;
    values: FiscalitePeer[];
  };
  notes_fr: string;
  notes_en: string;
};

export function loadEurostatFiscalite(): EurostatFiscalite | null {
  return readJsonOrNull<EurostatFiscalite>("eurostat_fiscalite.json");
}

// ─── État LFI (data.gouv plf{YY}-depenses) ────────────────────────────────

export type EtatProgramme = {
  code: string;
  label: string;
  ae: number;
  cp: number;
};

export type EtatMission = {
  code: string;
  label: string;
  ae: number;
  cp: number;
  programmes: EtatProgramme[];
};

export type EtatLFI = {
  perimeter: string;
  perimeter_label_fr: string;
  perimeter_label_en: string;
  source: string;
  source_url: string;
  source_dataset_id: string;
  exercice: number;
  loi: string;
  fetched_at: string;
  totals: {
    bg_brut_cp: number;
    bg_brut_ae: number;
    bg_net_cp: number;
    bg_net_ae: number;
    remboursements_degrev_cp: number;
    remboursements_degrev_ae: number;
    n_missions: number;
  };
  missions: EtatMission[];
  notes_fr: string;
  notes_en: string;
};

type EtatLFIIndex = {
  available_years: number[];
  latest_year: number;
};

export function loadEtatLFI(): EtatLFI | null {
  const idx = readJsonOrNull<EtatLFIIndex>("etat_lfi_index.json");
  if (!idx) return null;
  return readJsonOrNull<EtatLFI>(`etat_lfi_${idx.latest_year}.json`);
}

export function loadEtatLFIHistory(): EtatLFI[] {
  const idx = readJsonOrNull<EtatLFIIndex>("etat_lfi_index.json");
  if (!idx) return [];
  const out: EtatLFI[] = [];
  for (const y of idx.available_years) {
    const data = readJsonOrNull<EtatLFI>(`etat_lfi_${y}.json`);
    if (data) out.push(data);
  }
  out.sort((a, b) => a.exercice - b.exercice);
  return out;
}

// ─── Daily Bread constants (page /daily-bread) ───────────────────────────
//
// Source unique pour le calculateur "Ce que je finance" : barème IR, taux
// CSG / cotisations / TVA, parts APU sub-sectors, missions État, équivalences
// concrètes — toutes sourcées (CGI, URSSAF, Eurostat, INSEE, OFGL, DREES).
//
// Fichier généré par `pipeline/scripts/export/export_daily_bread.py`.

export type DailyBreadIRTranche = {
  tranche: number;
  seuil_haut_eur_par_part: number | null;
  taux_marginal: number;
};

export type DailyBreadSourcedBlock<T> = T & {
  source: string;
  source_url: string;
  date_reference: string;
  notes?: string;
};

export type DailyBreadConstants = {
  generated_at: string;
  source_pipeline: string;
  audit_promise: string;
  fiscal_constants: {
    ir: DailyBreadSourcedBlock<{
      year: number;
      baremes: DailyBreadIRTranche[];
      plafond_demi_part_eur: number;
      /** Abattement 10% frais professionnels (CGI art. 83-3°). Optionnel —
       *  si absent, computeIR n'applique pas l'abattement (compat ancienne). */
      abattement_10pct_taux?: number;
      abattement_10pct_min_eur?: number;
      abattement_10pct_max_eur?: number;
      /** Décote IR (CGI art. 197 I-4). Optionnel — si absent, computeIR
       *  n'applique pas la décote. */
      decote_celibataire_seuil_eur?: number;
      decote_celibataire_base_eur?: number;
      decote_couple_seuil_eur?: number;
      decote_couple_base_eur?: number;
      decote_taux?: number;
    }>;
    csg_crds: DailyBreadSourcedBlock<{
      year: number;
      taux_total_activite: number;
      taux_csg_seul: number;
      taux_crds_seul: number;
      taux_csg_deductible_ir: number;
      assiette_abattement: number;
    }>;
    cotisations_salariales: DailyBreadSourcedBlock<{
      year: number;
      taux_hors_csg_moyen: number;
      taux_total_sur_brut: number;
    }>;
    tva: DailyBreadSourcedBlock<{
      year: number;
      taux_moyen_consommation: number;
      propension_consommer: number;
      taux_effectif_sur_disponible: number;
    }>;
    pfu: DailyBreadSourcedBlock<{
      year: number;
      taux_total: number;
      taux_ir: number;
      taux_prelevements_sociaux: number;
    }>;
    pension: DailyBreadSourcedBlock<{
      year: number;
      abattement_taux: number;
      abattement_plafond_eur: number;
      abattement_plancher_eur: number;
    }>;
    micro: DailyBreadSourcedBlock<{
      year: number;
      cotisations: {
        vente: number;
        services_bic: number;
        services_bnc: number;
        services_bnc_cipav: number;
      };
      cfp: {
        vente: number;
        services_bic: number;
        services_bnc: number;
      };
      abattements_ir: {
        vente: number;
        services_bic: number;
        services_bnc: number;
      };
      versement_liberatoire: {
        vente: number;
        services_bic: number;
        services_bnc: number;
      };
    }>;
    csg_retraite: DailyBreadSourcedBlock<{
      year: number;
      tranches: Array<{
        tranche: number;
        seuil_rfr_par_part_min: number;
        seuil_rfr_par_part_max: number | null;
        taux_csg: number;
        taux_crds: number;
        taux_casa: number;
        taux_total: number;
      }>;
    }>;
  };
  apu_subsectors: {
    year: number;
    source: string;
    source_url: string;
    institutions: Record<
      string,
      {
        label_fr: string;
        label_en: string;
        value_pct_gdp: number;
        share: number;
        /** €/an national pour ce sous-secteur — calculé pipeline-side
         *  via Eurostat nama_10_gdp × value_pct_gdp/100 (depuis 2026-05).
         *  Permet aux drawers Sécu/Local/État d'afficher le national absolu
         *  sans hardcode du PIB côté UI. Optional pour rester compatible
         *  avec d'anciens snapshots (avant la promotion sync). */
        annual_eur?: number | null;
      }
    >;
    totals?: {
      s13_consolidated_pct_gdp?: number | null;
      sum_subsectors_unconsolidated_pct_gdp?: number;
      intra_gov_transfers_pct_gdp?: number | null;
      gdp_total_md_eur?: number | null;
      gdp_source?: string;
      gdp_source_url?: string;
    };
  };
  subsector_breakdowns: {
    apul_breakdown: {
      description_fr: string;
      description_en: string;
      items: Record<
        string,
        {
          label_fr: string;
          label_en: string;
          value: number;
          year: number | null;
          source: string;
          source_url: string;
          date_reference: string;
          notes?: string;
        }
      >;
    };
    asso_breakdown: {
      description_fr: string;
      description_en: string;
      items: Record<
        string,
        {
          label_fr: string;
          label_en: string;
          value: number;
          year: number | null;
          source: string;
          source_url: string;
          date_reference: string;
          notes?: string;
        }
      >;
    };
  };
  state_breakdown: {
    year: number;
    source: string;
    source_url: string;
    perimeter_label_fr: string;
    total_net_cp_eur: number;
    top_missions_share_total: number;
    missions: Array<{
      code: string;
      label: string;
      cp_eur: number;
      share_of_state_net: number;
    }>;
    notes_fr: string;
  };
  local_avg_dep_eur_hab: {
    value_eur_hab: number | null;
    year?: number;
    n_communes_used?: number;
    total_pop_used?: number;
    source?: string;
    source_url?: string;
    notes_fr?: string;
  };
  equivalents: {
    description_fr: string;
    items: Record<
      string,
      {
        label_fr: string;
        label_en: string;
        value: number;
        unit: string;
        year: number | null;
        source: string;
        source_url: string;
        date_reference: string;
        notes?: string;
      }
    >;
  };
  deepdive: {
    sante: DailyBreadDeepDiveStack;
    retraites: DailyBreadDeepDiveStack;
    famille: DailyBreadDeepDiveStack;
    chomage: DailyBreadDeepDiveStack;
    defense: DailyBreadDeepDiveStack;
    education: DailyBreadDeepDiveStack;
    dette: DailyBreadDeepDiveStack;
    autres_ministeres: DailyBreadDeepDiveStack;
    bloc_communal: DailyBreadDeepDiveLocal;
    departement: DailyBreadDeepDiveLocal;
    region: DailyBreadDeepDiveLocal;
  };
};

// ─── Deep-dive types (under each Zoom panel) ─────────────────────────────

export type DailyBreadDeepDiveItem = {
  label_fr: string;
  label_en: string;
  montant_md_eur: number;
  share: number;
  notes?: string;
};

export type DailyBreadDeepDiveStack = {
  scope: string;
  perimeter_fr: string;
  perimeter_en: string;
  total_md_eur: number;
  sum_share: number;
  source: string;
  source_url: string;
  date_reference: string;
  items: Record<string, DailyBreadDeepDiveItem>;
  notes_fr?: string;
};

export type DailyBreadDeepDiveLocalItem = {
  share: number;
  eur_hab: number;
  label_fr: string;
  label_en: string;
};

export type DailyBreadDeepDiveLocal = {
  scope: string;
  perimeter_fr: string;
  perimeter_en: string;
  year?: number;
  source?: string;
  source_url?: string;
  scope_note_fr?: string;
  fonctions: string[];
  national_avg_weighted: Record<string, DailyBreadDeepDiveLocalItem>;
  by_insee_top_200: Record<string, Record<string, DailyBreadDeepDiveLocalItem>>;
  notes_fr?: string;
};

export function loadDailyBread(): DailyBreadConstants | null {
  return readJsonOrNull<DailyBreadConstants>("daily_bread.json");
}
