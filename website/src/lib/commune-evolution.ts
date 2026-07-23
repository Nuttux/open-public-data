import "server-only";
import { communeStorage } from "@/lib/commune-gcs";
import manifest from "@/data/communes-evolution-manifest.json";

/** National commune évolution (OFGL, 7 ans) — per-commune trajectory JSON in the
 *  PRIVATE bucket, read server-side. Committed manifest = presence. Deterministic. */

type Manifest = { source: string; bucket: string; n_communes: number; communes: Record<string, { years: number[] }> };
const M = manifest as Manifest;

const BUCKET_NAME = process.env.COMMUNE_DATA_BUCKET ?? "qipu-communes-budget";
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
};
export type EvolutionData = {
  source: string;
  source_url: string;
  commune: { insee: string; slug: string; nom: string };
  years: number[];
  series: EvolutionPoint[];
};

const memo = new Map<string, EvolutionData | null>();
export async function loadCommuneEvolution(slug: string): Promise<EvolutionData | null> {
  if (!communeHasEvolution(slug)) return null;
  const key = `${PREFIX}/${slug}/evolution.json`;
  if (memo.has(key)) return memo.get(key) ?? null;
  try {
    const [buf] = await communeStorage().bucket(BUCKET_NAME).file(key).download();
    const val = JSON.parse(buf.toString("utf8")) as EvolutionData;
    memo.set(key, val);
    return val;
  } catch {
    memo.set(key, null);
    return null;
  }
}
