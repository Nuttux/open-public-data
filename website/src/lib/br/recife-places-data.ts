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

export function loadPlacesFile(): PlacesFile {
  return readDataJson<PlacesFile>(`${NS}/places.json`);
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
