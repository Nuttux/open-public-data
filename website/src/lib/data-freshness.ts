import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fraîcheur des sources (server-side). Lit public/data/data_freshness.json,
 * produit par le refresh hebdo (export_data_freshness.py) : pour chaque
 * source, quand la Ville l'a publiée et quand Qipu l'a mise à jour.
 *
 * Deux dates, deux acteurs — le vocabulaire est fixé :
 *   FR « publié par la Ville le … · mis à jour sur Qipu le … »
 *   EN "published by the City on … · updated on Qipu on …"
 * (jamais « repris », qui se lirait comme « corrigé »).
 */

export type FreshnessSource = {
  source_id: string;
  label_fr: string;
  label_en: string;
  dataset_title: string;
  dataset_page_url: string | null;
  publisher: string | null;
  license_title: string | null;
  license_url: string | null;
  records_count: number | null;
  published_by_city_at: string | null;
  synced_at: string | null;
  years: {
    min: number | null;
    max: number | null;
    complete: number[];
    partial: { annee: number; n_rows: number; ratio: number | null }[];
  } | null;
  pages: string[];
};

export type DataFreshness = {
  generated_at: string;
  updated_on_qipu_at: string;
  sources: FreshnessSource[];
};

let cache: DataFreshness | null | undefined;

export function getDataFreshness(): DataFreshness | null {
  if (cache !== undefined) return cache;
  try {
    const p = path.join(process.cwd(), "public", "data", "data_freshness.json");
    cache = JSON.parse(readFileSync(p, "utf-8")) as DataFreshness;
  } catch {
    cache = null;
  }
  return cache;
}

/**
 * Pour le JSON-LD schema.org Dataset d'une page : `dateModified` = la date de
 * mise à jour de notre base dérivée (le refresh), `temporalCoverage` = les
 * années complètes publiées des sources concernées.
 */
export function freshnessFor(sourceIds: string[]): {
  dateModified?: string;
  publishedByCityAt?: string;
  temporalCoverage?: string;
} {
  const f = getDataFreshness();
  if (!f) return {};
  const rows = f.sources.filter((s) => sourceIds.includes(s.source_id));
  if (rows.length === 0) return { dateModified: f.updated_on_qipu_at };
  const cityDates = rows.map((s) => s.published_by_city_at).filter((d): d is string => !!d).sort();
  const mins = rows.map((s) => s.years?.min).filter((n): n is number => typeof n === "number");
  const maxs = rows.map((s) => s.years?.max).filter((n): n is number => typeof n === "number");
  return {
    dateModified: f.updated_on_qipu_at,
    publishedByCityAt: cityDates.at(-1),
    temporalCoverage: mins.length && maxs.length ? `${Math.min(...mins)}/${Math.max(...maxs)}` : undefined,
  };
}
