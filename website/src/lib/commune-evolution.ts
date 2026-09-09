import "server-only";
import { readCommuneJson } from "@/lib/commune-store";
import manifest from "@/data/communes-evolution-manifest.json";

/** National commune évolution (OFGL, 7 ans) — per-commune trajectory JSON in the
 *  PRIVATE bucket, read server-side. Committed manifest = presence. Deterministic. */

type Manifest = { source: string; bucket: string; n_communes: number; communes: Record<string, { years: number[] }> };
const M = manifest as Manifest;

const PREFIX = process.env.COMMUNE_EVOL_PREFIX ?? "communes-evolution";

export function communeHasEvolution(slug: string): boolean {
  const e = M.communes[slug];
  return Boolean(e && e.years && e.years.length >= 2);
}

export type EvolutionPoint = {
  year: number;
  depenses: number | null;
  recettes: number | null;
  epargne: number | null;
  dette: number | null;
  equipement: number | null;
  depenses_hab: number | null;
  recettes_hab: number | null;
  dette_hab: number | null;
  capacite_desendettement: number | null;
  /** Agrégats OFGL ajoutés (bloc 1b) — absents des fichiers plus anciens. */
  dgf?: number | null;
  concours_etat?: number | null;
  subventions_versees?: number | null;
  subventions_equipement_versees?: number | null;
  fiscalite_reversee?: number | null;
  impots_locaux?: number | null;
  frais_personnel?: number | null;
  achats_charges_externes?: number | null;
  teom?: number | null;
  depenses_totales?: number | null;
  recettes_totales?: number | null;
};
export type EvolutionData = {
  source: string;
  source_url: string;
  commune: { insee: string; slug: string; nom: string };
  years: number[];
  series: EvolutionPoint[];
};

export async function loadCommuneEvolution(slug: string): Promise<EvolutionData | null> {
  if (!communeHasEvolution(slug)) return null;
  return readCommuneJson<EvolutionData>(`${PREFIX}/${slug}/evolution.json`);
}
