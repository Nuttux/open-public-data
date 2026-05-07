import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data", "communes-all");

export type AllCommuneKpi = { montant: number; eur_hab: number };

export type AllCommuneEntry = {
  insee: string;
  slug: string;
  nom: string;
  dep_name: string;
  reg_name: string;
  pop: number;
  siren: string;
  kpis: Record<string, AllCommuneKpi>;
};

type AllCommunesIndex = {
  generated_at: string;
  source: string;
  source_url: string;
  year: number;
  kpi_keys: string[];
  kpi_labels_fr: Record<string, string>;
  n_communes: number;
  communes: Record<string, AllCommuneEntry>;
  slug_to_insee: Record<string, string>;
};

type AllCommunesMeta = {
  generated_at: string;
  year: number;
  source: string;
  n_communes: number;
  communes_meta: Array<{
    insee: string;
    slug: string;
    nom: string;
    dep_name: string;
    reg_name: string;
    pop: number;
  }>;
};

let _indexCache: AllCommunesIndex | null = null;
let _metaCache: AllCommunesMeta | null = null;

function loadIndex(): AllCommunesIndex | null {
  if (_indexCache) return _indexCache;
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "index.json"), "utf8");
    _indexCache = JSON.parse(raw) as AllCommunesIndex;
    return _indexCache;
  } catch {
    return null;
  }
}

function loadMeta(): AllCommunesMeta | null {
  if (_metaCache) return _metaCache;
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "_meta.json"), "utf8");
    _metaCache = JSON.parse(raw) as AllCommunesMeta;
    return _metaCache;
  } catch {
    return null;
  }
}

/** Resolve an entry by either slug or INSEE code. */
export function findCommuneByAny(input: string): AllCommuneEntry | null {
  const idx = loadIndex();
  if (!idx) return null;
  // Try INSEE code first
  if (/^\d{5}$/.test(input)) {
    return idx.communes[input] ?? null;
  }
  // Try slug
  const insee = idx.slug_to_insee[input];
  return insee ? (idx.communes[insee] ?? null) : null;
}

export function loadAllCommunesYear(): number | null {
  const idx = loadIndex();
  return idx?.year ?? null;
}

export function loadAllCommunesKpiLabels(): Record<string, string> {
  const idx = loadIndex();
  return idx?.kpi_labels_fr ?? {};
}

export function loadAllCommunesSource(): {
  source: string;
  source_url: string;
  year: number;
} | null {
  const idx = loadIndex();
  if (!idx) return null;
  return { source: idx.source, source_url: idx.source_url, year: idx.year };
}

/** All communes meta — used by sitemap. */
export function listAllCommunesMeta(): AllCommunesMeta["communes_meta"] {
  return loadMeta()?.communes_meta ?? [];
}
