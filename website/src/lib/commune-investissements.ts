import "server-only";
import { Storage } from "@google-cloud/storage";
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

const BUCKET_NAME = process.env.COMMUNE_DATA_BUCKET ?? "qipu-communes-budget";
const PREFIX = process.env.COMMUNE_INVEST_PREFIX ?? "communes-investissements";

let _storage: Storage | null = null;
function gcs(): Storage {
  if (!_storage)
    _storage = new Storage({
      projectId: process.env.GCP_PROJECT ?? process.env.BQ_PROJECT ?? "open-data-france-484717",
    });
  return _storage;
}

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

const memo = new Map<string, InvestissementsData | null>();
export async function loadCommuneInvestissements(slug: string): Promise<InvestissementsData | null> {
  if (!communeHasInvestissements(slug)) return null;
  const key = `${PREFIX}/${slug}/investissements.json`;
  if (memo.has(key)) return memo.get(key) ?? null;
  try {
    const [buf] = await gcs().bucket(BUCKET_NAME).file(key).download();
    const val = JSON.parse(buf.toString("utf8")) as InvestissementsData;
    memo.set(key, val);
    return val;
  } catch {
    memo.set(key, null);
    return null;
  }
}
