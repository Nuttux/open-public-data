import fs from "node:fs";
import path from "node:path";

/**
 * Daily Bread niveau 2 / niveau 3 / niveau 4 + agrégations + dept/region.
 *
 * Données : `public/data/national/daily_bread_drilldown.json` (Agent P/P2).
 * En dev, un stub portant `_stub: true` peut occuper ce chemin — le loader
 * le lit indifféremment.
 *
 * Server-side only (utilise `node:fs`). Les pages drawer + standalone
 * appellent ces helpers depuis des Server Components.
 *
 * Étapes de drill couvertes :
 *   bucket → level2 → level3 → level4 (action PLF, feuille pour l'instant)
 *   bucket etat → aggregation (regaliens / education / …) → missions level2
 *   bucket local → departement.level2 / region.level2
 *
 * Tout est strictement null-safe : si Agent P2 n'a pas (encore) shippé
 * `level4`/`aggregations`/`departement`/`region`, les helpers renvoient
 * simplement `null` ou `[]` — UI doit fallback gracieusement.
 */

export type BucketKey = "secu" | "etat" | "local";

export type DrilldownLevel4Entry = {
  key: string;
  label_fr: string;
  label_en: string;
  share_of_parent: number; // 0..1
  source?: string;
  source_url?: string;
};

export type DrilldownLevel3Entry = {
  key: string;
  label_fr: string;
  label_en: string;
  share_of_parent: number; // 0..1
  source?: string;
  source_url?: string;
  /** Niveau 4 = actions PLF (feuille). Optionnel — Agent P2. */
  level4?: DrilldownLevel4Entry[];
};

export type DrilldownLevel2Entry = {
  key: string;
  label_fr: string;
  label_en: string;
  share_of_parent: number; // 0..1
  source?: string;
  source_url?: string;
  level3?: DrilldownLevel3Entry[];
};

/**
 * Aggregation État (bucket éditorial) — référence des `key` level2 (missions
 * PLF) qui composent un bucket "Régaliens", "Éducation", etc. Le drawer
 * affiche les missions résolues comme cards cliquables.
 */
export type AggregationEntry = {
  key: string;
  label_fr: string;
  label_en: string;
  /** Part dans le bucket parent (État central). 0..1. */
  share_of_parent: number;
  /** Liste des keys level2 (missions PLF) — résolues côté loader. */
  missions: string[];
  source?: string;
  source_url?: string;
};

/**
 * Décomposition local-département / local-région — même shape qu'un bucket
 * level2 list, juste avec un label de groupe.
 */
export type LocalScopeBlock = {
  label_fr: string;
  label_en: string;
  level2: DrilldownLevel2Entry[];
};

export type DrilldownBucket = {
  code: string;
  label_fr: string;
  label_en: string;
  level2: DrilldownLevel2Entry[];
  /** État seulement (Agent P2). */
  aggregations?: AggregationEntry[];
  /** Local seulement (Agent P2). */
  departement?: LocalScopeBlock;
  /** Local seulement (Agent P2). */
  region?: LocalScopeBlock;
};

export type DailyBreadDrilldown = {
  _stub?: boolean;
  _stub_note?: string;
  generated_at?: string;
  buckets: Record<BucketKey, DrilldownBucket>;
};

const DATA_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "national",
  "daily_bread_drilldown.json",
);

let cache: DailyBreadDrilldown | null | undefined;

export function loadDrilldown(): DailyBreadDrilldown | null {
  if (cache !== undefined) return cache;
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    cache = JSON.parse(raw) as DailyBreadDrilldown;
  } catch {
    cache = null;
  }
  return cache;
}

export function getBucket(bucket: BucketKey): DrilldownBucket | null {
  const data = loadDrilldown();
  if (!data) return null;
  return data.buckets[bucket] ?? null;
}

export function getBucketLevel2(bucket: BucketKey): DrilldownLevel2Entry[] {
  const b = getBucket(bucket);
  return b?.level2 ?? [];
}

export function getLevel2Entry(
  bucket: BucketKey,
  level2Key: string,
): DrilldownLevel2Entry | null {
  const list = getBucketLevel2(bucket);
  return list.find((e) => e.key === level2Key) ?? null;
}

export function getLevel3(
  bucket: BucketKey,
  level2Key: string,
): DrilldownLevel3Entry[] | null {
  const entry = getLevel2Entry(bucket, level2Key);
  if (!entry) return null;
  return entry.level3 ?? null;
}

export function getLevel3Entry(
  bucket: BucketKey,
  level2Key: string,
  level3Key: string,
): DrilldownLevel3Entry | null {
  const list = getLevel3(bucket, level2Key);
  if (!list) return null;
  return list.find((e) => e.key === level3Key) ?? null;
}

export function getLevel4(
  bucket: BucketKey,
  level2Key: string,
  level3Key: string,
): DrilldownLevel4Entry[] | null {
  const l3 = getLevel3Entry(bucket, level2Key, level3Key);
  if (!l3) return null;
  return l3.level4 ?? null;
}

export function getLevel4Entry(
  bucket: BucketKey,
  level2Key: string,
  level3Key: string,
  level4Key: string,
): DrilldownLevel4Entry | null {
  const list = getLevel4(bucket, level2Key, level3Key);
  if (!list) return null;
  return list.find((e) => e.key === level4Key) ?? null;
}

/**
 * Lookup unifié, étendu pour level4.
 *
 * Le `kind` permet aux pages d'afficher l'eyebrow correct sans deviner.
 */
export type DrilldownEntry =
  | { kind: "level2"; bucket: DrilldownBucket; entry: DrilldownLevel2Entry }
  | {
      kind: "level3";
      bucket: DrilldownBucket;
      parent: DrilldownLevel2Entry;
      entry: DrilldownLevel3Entry;
    }
  | {
      kind: "level4";
      bucket: DrilldownBucket;
      parentLevel2: DrilldownLevel2Entry;
      parentLevel3: DrilldownLevel3Entry;
      entry: DrilldownLevel4Entry;
    };

export function getDrilldownEntry(
  bucket: BucketKey,
  level2Key: string,
  level3Key?: string,
  level4Key?: string,
): DrilldownEntry | null {
  const b = getBucket(bucket);
  if (!b) return null;
  const l2 = b.level2.find((e) => e.key === level2Key);
  if (!l2) return null;
  if (!level3Key) {
    return { kind: "level2", bucket: b, entry: l2 };
  }
  const l3 = (l2.level3 ?? []).find((e) => e.key === level3Key);
  if (!l3) return null;
  if (!level4Key) {
    return { kind: "level3", bucket: b, parent: l2, entry: l3 };
  }
  const l4 = (l3.level4 ?? []).find((e) => e.key === level4Key);
  if (!l4) return null;
  return {
    kind: "level4",
    bucket: b,
    parentLevel2: l2,
    parentLevel3: l3,
    entry: l4,
  };
}

// ─── État aggregations ────────────────────────────────────────────────────

export function getEtatAggregations(): AggregationEntry[] {
  const b = getBucket("etat");
  return b?.aggregations ?? [];
}

export type ResolvedAggregation = AggregationEntry & {
  /** Les missions level2 résolues (entrées qui existent réellement). */
  resolvedMissions: DrilldownLevel2Entry[];
  bucket: DrilldownBucket;
};

export function getEtatAggregation(key: string): ResolvedAggregation | null {
  const b = getBucket("etat");
  if (!b) return null;
  const agg = (b.aggregations ?? []).find((a) => a.key === key);
  if (!agg) return null;
  const byKey = new Map(b.level2.map((e) => [e.key, e] as const));
  const resolvedMissions = (agg.missions ?? [])
    .map((mk) => byKey.get(mk))
    .filter((x): x is DrilldownLevel2Entry => Boolean(x));
  return { ...agg, resolvedMissions, bucket: b };
}

// ─── Local dept / region scopes ───────────────────────────────────────────

export function getDeptDrilldown(): LocalScopeBlock | null {
  const b = getBucket("local");
  return b?.departement ?? null;
}

export function getDeptEntry(level2Key: string): DrilldownLevel2Entry | null {
  const block = getDeptDrilldown();
  if (!block) return null;
  return block.level2.find((e) => e.key === level2Key) ?? null;
}

export function getDeptLevel3Entry(
  level2Key: string,
  level3Key: string,
): DrilldownLevel3Entry | null {
  const l2 = getDeptEntry(level2Key);
  if (!l2) return null;
  return (l2.level3 ?? []).find((e) => e.key === level3Key) ?? null;
}

export function getRegionDrilldown(): LocalScopeBlock | null {
  const b = getBucket("local");
  return b?.region ?? null;
}

export function getRegionEntry(level2Key: string): DrilldownLevel2Entry | null {
  const block = getRegionDrilldown();
  if (!block) return null;
  return block.level2.find((e) => e.key === level2Key) ?? null;
}

export function getRegionLevel3Entry(
  level2Key: string,
  level3Key: string,
): DrilldownLevel3Entry | null {
  const l2 = getRegionEntry(level2Key);
  if (!l2) return null;
  return (l2.level3 ?? []).find((e) => e.key === level3Key) ?? null;
}

export function isStub(): boolean {
  return Boolean(loadDrilldown()?._stub);
}
