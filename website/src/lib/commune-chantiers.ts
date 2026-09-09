import manifest from "@/data/communes-chantiers-manifest.json";
import { readCommuneJson } from "@/lib/commune-store";

/**
 * Chantiers de la commune financés par l'État (Fonds vert, bloc 4) : un
 * fichier par commune bénéficiaire dans le bucket privé. Le manifeste commité
 * (slug → nb, montant) est la présence instantanée.
 */
type Manifest = { source: string; bucket: string; n_communes: number; communes: Record<string, { nb: number; montant: number }> };
const M = manifest as Manifest;
const PREFIX = process.env.COMMUNE_CHANTIERS_PREFIX ?? "communes-chantiers";

export function communeHasChantiers(slug: string): boolean {
  return Boolean(M.communes[slug]);
}

export type Chantier = { annee: number | null; nom: string; resume: string | null; montant: number; demarche: string | null; dossier: string | null };
export type ChantiersData = {
  source: string;
  source_url: string;
  commune: { insee: string; slug: string; nom: string };
  total: { montant: number; nb: number; years: number[] };
  chantiers: Chantier[];
};

export async function loadCommuneChantiers(slug: string): Promise<ChantiersData | null> {
  if (!communeHasChantiers(slug)) return null;
  return readCommuneJson<ChantiersData>(`${PREFIX}/${slug}/chantiers.json`);
}
