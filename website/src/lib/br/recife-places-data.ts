/**
 * Server-side loaders for Recife civic places (facilities directory).
 * Reads public/data/br/recife/places.json. Identity/geo only (Phase 1).
 */
import { readDataJson } from "@/lib/data/read";

const NS = "br/recife";

export type PlaceIndexEntry = {
  slug: string; nome: string; familia: string; tipo: string | null;
  lat: number; lon: number; bairro: string | null;
  endereco: string | null; detalhe: string | null;
  obras_total?: number | null; n_obras?: number | null;
  // Curated editorial enrichment (place_editorial.json), merged at load.
  descricao?: string | null; descricao_en?: string | null;
  wiki_url?: string | null; photo?: string | null; photo_credit?: string | null;
};

type PlaceEditorial = {
  descricao?: string; descricao_en?: string;
  wiki_url?: string; photo?: string; photo_credit?: string;
};

export type PlaceObra = {
  contrato_id: string; numero: string; objeto: string | null;
  valor: number | null; ano: number | null; match_via: string;
};
export type PlaceObras = { obras_total: number; n_obras: number; contratos: PlaceObra[] };
export type PlacesSource = { name: string | null; source_url: string | null };
type PlacesFile = {
  source: PlacesSource; perimeter: string; count: number;
  familias: { familia: string; n: number }[];
  places: PlaceIndexEntry[];
};

/** Curated editorial layer (descriptions, wiki, photo) keyed by slug. Kept
 *  separate from the BQ-derived places.json so it survives re-exports; merged
 *  here so every consumer sees enriched entries. */
function loadEditorial(): Record<string, PlaceEditorial> {
  try {
    return readDataJson<{ items: Record<string, PlaceEditorial> }>(`${NS}/place_editorial.json`).items ?? {};
  } catch {
    return {};
  }
}

export function loadPlacesFile(): PlacesFile {
  const f = readDataJson<PlacesFile>(`${NS}/places.json`);
  const ed = loadEditorial();
  const places = f.places.map((p) => {
    const e = ed[p.slug];
    return e
      ? { ...p, descricao: e.descricao ?? null, descricao_en: e.descricao_en ?? null,
          wiki_url: e.wiki_url ?? null, photo: e.photo ?? null, photo_credit: e.photo_credit ?? null }
      : p;
  });
  return { ...f, places };
}

/** True when a place carries identified public-works spending (a R$ value tied
 *  to it via the contract crosswalk) — the money-bearing subset worth featuring
 *  on the map, ranked by that value. Places with matched works but no disclosed
 *  amount are excluded here so the map reads as "where the money landed". */
export function isEnrichedPlace(p: PlaceIndexEntry): boolean {
  return (p.obras_total ?? 0) > 0;
}

/**
 * Places file filtered to the enriched subset, with `count` and `familias`
 * recomputed so the page's intro stats and family chips match the visible map
 * (otherwise they'd still report all ~1,068 while the map shows ~44).
 */
export function loadEnrichedPlacesFile(): PlacesFile {
  const f = loadPlacesFile();
  const places = f.places.filter(isEnrichedPlace);
  const famMap = new Map<string, number>();
  for (const p of places) famMap.set(p.familia, (famMap.get(p.familia) ?? 0) + 1);
  const familias = [...famMap.entries()]
    .map(([familia, n]) => ({ familia, n }))
    .sort((a, b) => b.n - a.n);
  return { ...f, places, count: places.length, familias };
}
export function loadPlacesIndex(): PlaceIndexEntry[] {
  return loadPlacesFile().places;
}
export function loadPlace(slug: string): (PlaceIndexEntry & { source: PlacesSource }) | null {
  const f = loadPlacesFile();
  const p = f.places.find((x) => x.slug === slug);
  return p ? { ...p, source: f.source } : null;
}

/** Matched public-works evidence for a facility (obra crosswalk). Null if none. */
export function loadPlaceObras(slug: string): PlaceObras | null {
  const f = readDataJson<{ items: Record<string, PlaceObras> }>(`${NS}/place_obras.json`);
  return f.items?.[slug] ?? null;
}
