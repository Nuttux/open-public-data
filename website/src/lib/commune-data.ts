import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data", "communes");

function readJsonOrNull<T>(file: string): T | null {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export type KpiPoint = {
  year: number;
  montant: number;
  eur_hab: number | null;
};

export type CommuneSeries = Record<string, KpiPoint[]>;

export type CommuneCity = {
  slug: string;
  nom: string;
  code_insee: string;
  siren: string;
  dep_name: string;
  reg_name: string;
  population_latest: number | null;
  latest_year: number | null;
  years: number[];
  series: CommuneSeries;
};

export type CommuneData = {
  generated_at: string;
  source: string;
  source_url: string;
  perimeter_label_fr: string;
  perimeter_label_en: string;
  city: CommuneCity;
  kpi_labels_fr: Record<string, string>;
  kpi_labels_en: Record<string, string>;
};

export type CommuneIndex = {
  generated_at: string;
  source: string;
  source_url: string;
  cities: Array<{
    slug: string;
    nom: string;
    code_insee: string;
    latest_year: number | null;
  }>;
};

export function loadCommune(slug: string): CommuneData | null {
  return readJsonOrNull<CommuneData>(`${slug}.json`);
}

export function loadCommunesIndex(): CommuneIndex | null {
  return readJsonOrNull<CommuneIndex>("_index.json");
}

/**
 * Load all peer cities (the 9 biggest excluding the focal slug).
 * Used by the peer-compare section on /fr/city/[slug].
 */
export function loadPeerCities(focalSlug: string): CommuneData[] {
  const idx = loadCommunesIndex();
  if (!idx) return [];
  const peers: CommuneData[] = [];
  for (const c of idx.cities) {
    if (c.slug === focalSlug) continue;
    const data = loadCommune(c.slug);
    if (data) peers.push(data);
  }
  return peers;
}

// ─── DECP marchés (per-commune aggregates) ────────────────────────────────

export type CommuneMarchesYear = {
  year: number;
  montant: number;
  count: number;
};

export type CommuneMarchesTitulaire = {
  id: string;
  nom: string;
  montant: number;
  count: number;
};

export type CommuneMarches = {
  generated_at: string;
  source: string;
  source_url: string;
  source_resource_id: string;
  commune: { slug: string; nom: string; siren: string };
  aggregates: {
    total_count: number;
    total_montant: number;
    coverage_pct: number;
    n_with_montant: number;
    by_year: CommuneMarchesYear[];
    top_titulaires_window_years: number;
    top_titulaires: CommuneMarchesTitulaire[];
  };
  notes_fr: string;
  notes_en: string;
};

export function loadCommuneMarches(slug: string): CommuneMarches | null {
  return readJsonOrNull<CommuneMarches>(`${slug}_marches.json`);
}

// ─── Computed metric: capacité de désendettement ──────────────────────────
// Years to repay debt if all gross savings went to debt service.
// Standard threshold: <8 years = healthy, 8-12 = vigilance, >12 = stress.

export function computeCapaciteDesendettement(
  data: CommuneData,
): { years: number; year: number } | null {
  const ly = data.city.latest_year;
  if (!ly) return null;
  const dette = data.city.series.encours_dette?.find((p) => p.year === ly)?.montant;
  const epargne = data.city.series.epargne_brute?.find((p) => p.year === ly)?.montant;
  if (!dette || !epargne || epargne <= 0) return null;
  return { years: dette / epargne, year: ly };
}
