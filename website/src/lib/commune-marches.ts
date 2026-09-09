import "server-only";
import { readCommuneJson } from "@/lib/commune-store";
import manifest from "@/data/communes-marches-manifest.json";

/**
 * National commune marchés publics (DECP) — DELIVERY.
 *
 * Per-commune JSON in the PRIVATE bucket (communes-marches/ prefix), read
 * server-side with GCP credentials. Only a small slug→{years,montant,nb}
 * manifest is committed, so the capability resolver stays local + instant.
 * Deterministic public data (DECP) — no enrichment.
 */

type Manifest = {
  source: string;
  bucket: string;
  n_communes: number;
  communes: Record<string, { years: number[]; montant: number; nb: number }>;
};
const M = manifest as Manifest;

const PREFIX = process.env.COMMUNE_MARCHES_PREFIX ?? "communes-marches";

/** Nombre de marchés retenus pour la commune (manifeste), 0 si aucune page. */
export function marchesManifestCount(slug: string): number {
  return M.communes[slug]?.nb ?? 0;
}

export function communeHasMarches(slug: string): boolean {
  const e = M.communes[slug];
  return Boolean(e && e.nb > 0);
}

export type MarchesData = {
  source: string;
  source_url: string;
  coverage_note: string;
  commune: { insee: string; slug: string; nom: string };
  total: { montant: number; nb_marches: number; nb_titulaires: number; nb_exclus_invraisemblables?: number; annees_ecartees?: number[] };
  by_year: { year: number; montant: number; nb: number }[];
  /** Dernière année publiée, à part (bloc 1a) : la page ville parle de l'année. */
  last_year?: {
    year: number | null;
    montant: number;
    nb_marches: number;
    by_category: { categorie: string; montant: number; nb: number }[];
    top_titulaires: { nom: string; montant: number; nb: number; objet?: string; siren?: string; personne_physique?: boolean }[];
  };
  by_category: { categorie: string; montant: number; nb: number }[];
  top_titulaires: { nom: string; montant: number; nb: number; siren?: string; personne_physique?: boolean }[];
  top_marches: {
    nb_lots?: number;
    siren?: string | null;
    objet: string;
    montant: number;
    titulaire: string | null;
    annee: number | null;
    procedure: string | null;
    categorie: string | null;
  }[];
};

export async function loadCommuneMarches(slug: string): Promise<MarchesData | null> {
  if (!communeHasMarches(slug)) return null;
  return readCommuneJson<MarchesData>(`${PREFIX}/${slug}/marches.json`);
}

/** Fiche fournisseur locale (bloc 3) : par SIREN, tous les marchés que la
 *  commune lui a notifiés, lots regroupés. Jamais de personne physique. */
export type FournisseurLocalMarche = {
  objet: string;
  montant: number;
  nb_lots: number;
  annee: number | null;
  duree_mois: number | null;
  procedure: string | null;
  categorie: string | null;
};
export type FournisseurLocal = {
  siren: string;
  nom: string;
  montant: number;
  nb: number;
  first_year: number | null;
  last_year: number | null;
  marches: FournisseurLocalMarche[];
  /** Empreinte nationale (communes, montant, marchés) ; complète seulement si
   *  l'export a tourné sur toute la France (`national_complet`). */
  national: { communes: number; montant: number; nb: number } | null;
};
export type FournisseursData = {
  source: string;
  source_url: string;
  coverage_note: string;
  national_complet: boolean;
  commune: { insee: string; slug: string; nom: string };
  annees_ecartees: number[];
  fournisseurs: FournisseurLocal[];
};

export async function loadCommuneFournisseurs(slug: string): Promise<FournisseursData | null> {
  if (!communeHasMarches(slug)) return null;
  return readCommuneJson<FournisseursData>(`${PREFIX}/${slug}/fournisseurs.json`);
}
