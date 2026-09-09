import taux from "@/data/communes-taux.json";

/**
 * Les taux de taxe foncière votés par la commune (REI, DGFiP), bloc 4.
 * Fichier commité, une entrée par commune : taux sur le bâti (appliqué,
 * voté), part intercommunale, non-bâti, médiane de la strate, historique.
 */
export type TauxCommune = {
  annee: number;
  tfb: number | null;
  tfb_vote: number | null;
  tfb_epci: number | null;
  tfnb: number | null;
  mediane: number | null;
  epci: string | null;
  hist: Record<string, number>;
};
type File = { source: string; source_url: string; annee: number; n_communes: number; communes: Record<string, TauxCommune> };
const F = taux as File;

export function loadTaux(insee: string): TauxCommune | null {
  return F.communes[insee] ?? null;
}
export const TAUX_SOURCE = { label: F.source, url: F.source_url, annee: F.annee };
