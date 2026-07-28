import fs from "node:fs";
import path from "node:path";

/**
 * The single filesystem entry point for public/data JSON. Every server-side
 * loader (fusion-data, national-data, commune-data, lieux-data, chat tools)
 * reads through here — one place to reason about IO, caching and city paths.
 *
 * Data files are immutable per deploy, so parses are memoized. The cache is
 * bounded (FIFO) so a long-lived process can't accumulate every vintage of
 * every dataset in RAM.
 */

const DATA_ROOT = path.join(process.cwd(), "public", "data");
const MAX_ENTRIES = 64;
const cache = new Map<string, unknown>();

function remember<T>(key: string, value: T): T {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/** Read + parse a JSON file relative to public/data. Memoized. Throws if absent. */
export function readDataJson<T>(rel: string): T {
  if (cache.has(rel)) return cache.get(rel) as T;
  const raw = fs.readFileSync(path.join(DATA_ROOT, rel), "utf8");
  return remember(rel, JSON.parse(raw) as T);
}

/** Like readDataJson but returns null when the file is missing/unparsable. */
export function readDataJsonOrNull<T>(rel: string): T | null {
  if (cache.has(rel)) return cache.get(rel) as T | null;
  try {
    const raw = fs.readFileSync(path.join(DATA_ROOT, rel), "utf8");
    return remember(rel, JSON.parse(raw) as T);
  } catch {
    // Negative results are cached too: a missing vintage would otherwise be
    // re-stat'ed on every request by the multi-year scan loaders.
    remember(rel, null);
    return null;
  }
}

/**
 * Filenames in a public/data directory, without extension, sorted.
 *
 * For the one-file-per-entity exports (SF contract fiches) where the set of
 * keys IS the directory listing and there is no index file to read. Returns []
 * when the directory is absent, so a branch without hydrated data degrades
 * rather than failing the build. Not memoized: the only caller is the sitemap,
 * which runs once.
 */
export function listDataDir(rel: string, ext = ".json"): string[] {
  try {
    return fs
      .readdirSync(path.join(DATA_ROOT, rel))
      .filter((f) => f.endsWith(ext))
      .map((f) => f.slice(0, -ext.length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * City-relative data path. Paris keeps its files at the data root
 * (rétro-compat, cf. project_marseille_v1_decisions P0.2); other cities live
 * under data/<city>/. Client components use the mirror in lib/city-paths.ts.
 */
export function cityJsonPath(city: string, file: string): string {
  return city === "paris" ? file : `${city}/${file}`;
}

/** Test hook. */
export function clearDataCache(): void {
  cache.clear();
}
