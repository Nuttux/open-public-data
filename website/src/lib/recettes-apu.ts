import fs from "node:fs";
import path from "node:path";

/**
 * Loader pour les recettes des APU (S1311 État + S1313 Local + S1314 Sécu).
 * Format miroir du `daily_bread.json` apu_subsectors — chaque sous-secteur
 * a son `annual_eur` total + une liste d'items (nature des recettes).
 */

export type RecetteNature =
  | "direct"
  | "indirect"
  | "cotisation"
  | "csg"
  | "transfert"
  | "transfert_ue"
  | "non_fiscal";

export type RecetteItem = {
  key: string;
  label_fr: string;
  label_en: string;
  annual_eur: number;
  nature: RecetteNature;
  source: string;
  source_url: string;
  notes?: string;
};

export type RecetteInstitution = {
  label_fr: string;
  label_en: string;
  annual_eur: number;
  items: RecetteItem[];
};

export type RecettesApu = {
  generated_at: string;
  source_pipeline: string;
  audit_promise: string;
  macro: {
    year: number;
    pib_md_eur: number;
    depenses_apu_md_eur: number;
    recettes_apu_md_eur: number;
    deficit_md_eur: number;
    deficit_pct_pib: number;
    source: string;
    source_url: string;
    notes_fr: string;
  };
  institutions: {
    S1311: RecetteInstitution;
    S1313: RecetteInstitution;
    S1314: RecetteInstitution;
  };
  europe: {
    psr_ue_brut_md_eur: number;
    fonds_recus_md_eur: number;
    contribution_nette_md_eur: number;
    psr_source: string;
    psr_source_url: string;
    fonds_source: string;
    fonds_source_url: string;
    notes_fr: string;
    /** Décomposition du PSR-UE brut versé (RNB, TVA, plastique, NGEU). */
    psr_decomposition?: Array<{
      key: string;
      label_fr: string;
      label_en: string;
      annual_eur_md: number;
      notes?: string;
    }>;
    /** Décomposition des fonds reçus (PAC, FEDER/FSE, Horizon, NGEU). */
    fonds_decomposition?: Array<{
      key: string;
      label_fr: string;
      label_en: string;
      annual_eur_md: number;
      notes?: string;
    }>;
  };
  notes_fr: string;
};

const DATA_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "national",
  "recettes_apu.json",
);

let cache: RecettesApu | null | undefined;

export function loadRecettesApu(): RecettesApu | null {
  if (cache !== undefined) return cache;
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    cache = JSON.parse(raw) as RecettesApu;
  } catch {
    cache = null;
  }
  return cache;
}
