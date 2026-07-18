import fs from "node:fs";
import path from "node:path";

/**
 * Lieux v0 — chargement des fiches exportées par
 * `pipeline/scripts/export/export_lieux.py` (docs/paris-lieux/PLAN.md).
 * Volontairement séparé de fusion-data.ts le temps du v0 (4 lieux) ;
 * à fusionner quand l'entité sera stabilisée.
 */

export type LieuMoment = {
  id: string;
  seance: string;
  fait: string;
  pourquoi?: string;
  source_url: string | null;
  /** Moment jugé marquant (saillance forte) — mis en avant ; les autres sont
   *  repliés. Absent/true si la fiche n'a pas encore de hiérarchisation. */
  vedette?: boolean;
};

export type LieuMontant = {
  seance: string | null;
  montant: string;
  objet: string;
  citation?: string;
  source_url: string | null;
};

export type LieuBmoExtrait = { date: string; extrait: string; source_url: string };
/** Marché public rattaché au lieu — même statut d'argent public qu'une
 *  subvention ou un investissement. `numero_marche` mène à la fiche contrat. */
export type LieuMarche = {
  numero_marche: string;
  objet: string;
  fournisseur: string | null;
  montant_max: number;
  date_notification?: string | null;
  preuve?: string | null;
};
/** Récit sourcé « ce que dit l'archive » — écrit à partir des extraits retenus.
 *  Les citations brutes restent dessous, dépliables, comme preuve. */
export type LieuBmoRecit = string | null;

export type LieuInvest = {
  annee: string | number;
  montant_eur: number;
  nom_projet: string;
  source_pdf?: string | null;
  /** id de fiche projet (`/investissements/projet/[id]`) — lien lieu → projet. */
  id?: string | null;
};

export type LieuFicheData = {
  generated_at: string;
  source_pipeline: string;
  slug: string;
  name: string;
  kind_fr: string;
  kind_en: string;
  arrondissement: number;
  lat: number;
  lon: number;
  photo: string | null;
  /** D'où vient la photo : vignette d'article (Wikipédia) ou repêchage Commons —
   *  licences et auteurs différents. */
  photo_credit: { licence: string | null; auteur: string | null; url: string | null; source: string } | null;
  wiki: { extract: string | null; url: string | null; source: { name: string; url: string } };
  famille: string;
  stats: {
    n_delibs: number;
    delibs_span: [number, number] | null;
    n_bmo_brut: number;
    n_bmo_verifies: number | null;
    invest_total_eur: number;
    invest_annees: string[];
    /** Couverture de lecture réelle : combien de documents l'agent a lus, et
     *  selon quelle règle de sélection (prep_lieu_contexts.py). */
    lecture_mode: string | null;
    n_lus: number | null;
    /** Documents qui portent réellement sur le lieu (voir LieuIndexEntry). */
    n_lieu: number | null;
  };
  subventions_exploitant: {
    nom_fiche: string;
    total_eur: number;
    annees: [string, string];
    rows: { annee: string; montant_eur: number; beneficiaire: string; thematique: string | null }[];
    /** Périmètre de l'exploitant : « mono » (ne gère que ce lieu) ou « multi »
     *  (gère aussi d'autres sites — la subvention ne va pas qu'ici). */
    perimetre?: string;
    note_publique?: string | null;
    autres_sites?: string[];
  } | null;
  /** Bénéficiaires qui reçoivent de l'argent pour une activité DANS le lieu sans
   *  le gérer (résidents) — affichés à part de l'exploitant. */
  residents: { beneficiaire: string; montant_total: number; preuve?: string }[];
  kpi_montant: { valeur: string; label_fr: string; label_en: string; source_url: string | null } | null;
  synthese_fr: string | null;
  moments: LieuMoment[];
  montants: LieuMontant[];
  bmo_extraits: LieuBmoExtrait[];
  bmo_recit?: LieuBmoRecit;
  /** Marchés publics rattachés au lieu par le juge (rôle « au-lieu »). */
  marches?: LieuMarche[];
  invest: LieuInvest[];
  sources: Record<string, { name: string; url: string }>;
};

export type LieuIndexEntry = {
  slug: string;
  name: string;
  kind_fr: string;
  /** Famille de lieu — vient du seed (colonne `famille`), pilote la couleur
   *  et les filtres de la carte. */
  famille: string;
  arrondissement: number;
  lat: number;
  lon: number;
  /** Documents du Conseil de Paris qui portent réellement sur ce lieu, tels que
   *  la lecture les a classés. `stats.n_delibs` (total brut du Solr du portail)
   *  ne doit jamais être affiché : 99 % de bruit sur les noms courants. */
  n_lieu: number | null;
  n_moments: number;
  argent_total_eur?: number;
  depuis?: number | null;
  photo: string | null;
};

const DATA_DIR = path.join(process.cwd(), "public", "data", "lieux");

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadLieuxIndex(): LieuIndexEntry[] {
  const raw = readJson<{ lieux?: LieuIndexEntry[] }>("index.json");
  return raw?.lieux ?? [];
}

export function loadLieu(slug: string): LieuFicheData | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return readJson<LieuFicheData>(`lieu_${slug}.json`);
}


export type LieuLien = { slug: string; lieu: string; role?: string };

let _revCache: { beneficiaires: Record<string, LieuLien>; projets: Record<string, LieuLien> } | null = null;
function loadReverse() {
  if (_revCache) return _revCache;
  _revCache = readJson<{ beneficiaires: Record<string, LieuLien>; projets: Record<string, LieuLien> }>("reverse_index.json")
    ?? { beneficiaires: {}, projets: {} };
  return _revCache;
}

function normKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Le lieu dont ce bénéficiaire de subvention est l'exploitant ou un résident
 *  (index inverse issu du juge). Sert le lien « ↗ Voir le lieu » sur les fiches
 *  subvention/association. */
export function lieuForBeneficiaire(name: string): LieuLien | null {
  return loadReverse().beneficiaires[normKey(name)] ?? null;
}

/** Le lieu auquel ce projet d'investissement se rattache. */
export function lieuForProjet(nomProjet: string): LieuLien | null {
  return loadReverse().projets[normKey(nomProjet)] ?? null;
}
