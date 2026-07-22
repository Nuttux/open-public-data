import "server-only";
import { loadAllCommunesIndex } from "@/lib/all-communes";

/**
 * Peer comparison — "comparaison à la strate" (OFGL-native).
 *
 * Every commune's per-capita OFGL indicators + population are already committed
 * in communes-all/index.json, so this needs NO BigQuery, NO bucket, NO export:
 * it assigns each commune to a DGCL demographic strata (a population bracket)
 * and compares it to the MEDIAN of that strata. Median (not average) is used on
 * purpose — it is robust to the handful of very-high-spending communes that
 * would skew an average. The output is positional and descriptive: it shows
 * where a commune sits among its peers, never a good/bad verdict.
 */

// DGCL strates de population (bornes hautes). The i18n label keys
// (fx.natcmp.strata_0 … strata_11) mirror this order.
const STRATA_EDGES = [100, 200, 500, 1000, 2000, 3500, 5000, 10000, 20000, 50000, 100000];
export const STRATA_COUNT = STRATA_EDGES.length + 1; // 12 buckets

/** Bucket index 0…11 for a population (DGCL demographic strata). */
export function strataIndex(pop: number): number {
  let i = 0;
  while (i < STRATA_EDGES.length && pop >= STRATA_EDGES[i]) i++;
  return i;
}

// Comparable per-capita basket. `capacite_financement` is intentionally excluded:
// its strata median sits near zero, which makes a "% vs median" meaningless.
export const PEER_KPI_KEYS = [
  "recettes_totales",
  "depenses_totales",
  "frais_personnel",
  "impots_locaux",
  "encours_dette",
  "epargne_brute",
] as const;
export type PeerKpiKey = (typeof PEER_KPI_KEYS)[number];

type StrataStats = { count: number; median: Record<string, number | null> };

let _statsCache: StrataStats[] | null = null;

function median(nums: number[]): number | null {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[mid] : (s[mid] + s[mid + 1]) / 2;
}

/** Per-strata medians over the whole national index — computed once, memoised. */
function strataStats(): StrataStats[] | null {
  if (_statsCache) return _statsCache;
  const idx = loadAllCommunesIndex();
  if (!idx) return null;
  const buckets = Array.from({ length: STRATA_COUNT }, () => ({
    count: 0,
    vals: Object.fromEntries(PEER_KPI_KEYS.map((k) => [k, [] as number[]])) as Record<string, number[]>,
  }));
  for (const c of Object.values(idx.communes)) {
    const b = buckets[strataIndex(c.pop)];
    b.count++;
    for (const k of PEER_KPI_KEYS) {
      const v = c.kpis[k]?.eur_hab;
      if (Number.isFinite(v)) b.vals[k].push(v as number);
    }
  }
  _statsCache = buckets.map((b) => ({
    count: b.count,
    median: Object.fromEntries(PEER_KPI_KEYS.map((k) => [k, median(b.vals[k])])),
  }));
  return _statsCache;
}

export function communeHasPeers(slug: string): boolean {
  const idx = loadAllCommunesIndex();
  if (!idx) return false;
  const insee = idx.slug_to_insee[slug];
  return !!insee && !!idx.communes[insee];
}

export type PeerRow = {
  key: PeerKpiKey;
  /** Commune value, €/hab. */
  value: number | null;
  /** Strata median, €/hab. */
  median: number | null;
  /** Commune relative to the strata median, in %. Null when the median ≈ 0. */
  deltaPct: number | null;
};

export type PeerComparison = {
  slug: string;
  nom: string;
  pop: number;
  strataIndex: number;
  /** Communes in the strata (including the commune itself). */
  peerCount: number;
  year: number;
  source: string;
  sourceUrl: string;
  rows: PeerRow[];
};

/** Peer comparison for a commune, or null if it is not in the national index. */
export function loadCommunePeers(slug: string): PeerComparison | null {
  const idx = loadAllCommunesIndex();
  if (!idx) return null;
  const insee = idx.slug_to_insee[slug];
  const c = insee ? idx.communes[insee] : null;
  if (!c) return null;
  const stats = strataStats();
  if (!stats) return null;
  const si = strataIndex(c.pop);
  const st = stats[si];
  const rows: PeerRow[] = PEER_KPI_KEYS.map((k) => {
    const value = c.kpis[k]?.eur_hab ?? null;
    const med = st.median[k] ?? null;
    const deltaPct =
      value != null && med != null && Math.abs(med) >= 1
        ? ((value - med) / Math.abs(med)) * 100
        : null;
    return { key: k, value, median: med, deltaPct };
  });
  return {
    slug,
    nom: c.nom,
    pop: c.pop,
    strataIndex: si,
    peerCount: st.count,
    year: idx.year,
    source: idx.source,
    sourceUrl: idx.source_url,
    rows,
  };
}
