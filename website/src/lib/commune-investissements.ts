import "server-only";
import { readCommuneJson } from "@/lib/commune-store";
import manifest from "@/data/communes-investissements-manifest.json";

/** National commune investissements (DGFiP balances, section investissement) —
 *  per-commune JSON in the PRIVATE bucket, read server-side. Committed manifest
 *  = capability presence. Deterministic public data, no enrichment. */

type Manifest = {
  source: string;
  bucket: string;
  n_communes: number;
  communes: Record<string, { year: number; depenses: number }>;
};
const M = manifest as Manifest;

const PREFIX = process.env.COMMUNE_INVEST_PREFIX ?? "communes-investissements";

export function communeHasInvestissements(slug: string): boolean {
  const e = M.communes[slug];
  return Boolean(e && e.depenses > 0);
}

export type InvestissementsData = {
  source: string;
  source_url: string;
  commune: { insee: string; slug: string; nom: string };
  year: number;
  total: { depenses: number; recettes: number; depenses_eur_hab: number | null };
  depenses_par_groupe: { groupe: string; montant: number }[];
  financement_par_groupe: { groupe: string; montant: number }[];
  by_year: { year: number; depenses: number; recettes: number }[];
};

export async function loadCommuneInvestissements(slug: string): Promise<InvestissementsData | null> {
  if (!communeHasInvestissements(slug)) return null;
  return readCommuneJson<InvestissementsData>(`${PREFIX}/${slug}/investissements.json`);
}
