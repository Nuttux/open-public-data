import "server-only";
import { Storage } from "@google-cloud/storage";
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

const BUCKET_NAME = process.env.COMMUNE_DATA_BUCKET ?? "qipu-communes-budget";
const PREFIX = process.env.COMMUNE_MARCHES_PREFIX ?? "communes-marches";

let _storage: Storage | null = null;
function gcs(): Storage {
  if (!_storage) {
    _storage = new Storage({
      projectId: process.env.GCP_PROJECT ?? process.env.BQ_PROJECT ?? "open-data-france-484717",
    });
  }
  return _storage;
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
  total: { montant: number; nb_marches: number; nb_titulaires: number };
  by_year: { year: number; montant: number; nb: number }[];
  by_category: { categorie: string; montant: number; nb: number }[];
  top_titulaires: { nom: string; montant: number; nb: number }[];
  top_marches: {
    objet: string;
    montant: number;
    titulaire: string | null;
    annee: number | null;
    procedure: string | null;
    categorie: string | null;
  }[];
};

const memo = new Map<string, MarchesData | null>();
export async function loadCommuneMarches(slug: string): Promise<MarchesData | null> {
  if (!communeHasMarches(slug)) return null;
  const key = `${PREFIX}/${slug}/marches.json`;
  if (memo.has(key)) return memo.get(key) ?? null;
  try {
    const [buf] = await gcs().bucket(BUCKET_NAME).file(key).download();
    const val = JSON.parse(buf.toString("utf8")) as MarchesData;
    memo.set(key, val);
    return val;
  } catch {
    memo.set(key, null);
    return null;
  }
}
