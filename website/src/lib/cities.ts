/**
 * Cities registry — single source of truth for `/france/[slug]` pages.
 *
 * `src/data/cities.json` is a hand-maintained registry (the former
 * export_cities.py generator was removed 2026-08-26: it read columns that
 * `seed_communes_cibles.csv` no longer carries). Keep the seed's
 * code_insee / slug / nom in sync when adding a city.
 * Population values are sourced from OFGL (latest available year).
 */
import citiesData from "@/data/cities.json";

export type City = {
  slug: string;
  code_insee: string;
  nom: string;
  siren: string;
  population: number;
  dep_name: string;
  reg_name: string;
  lat: number;
  lng: number;
};

type CitiesPayload = {
  generated_at: string;
  source_pipeline: string;
  source_data: string;
  source_url: string;
  cities: City[];
};

const PAYLOAD = citiesData as CitiesPayload;

const CITY_BY_SLUG = new Map<string, City>(
  PAYLOAD.cities.map((c) => [c.slug, c]),
);

/** Returns the City for a slug, or undefined if not in the registry. */
export function getCity(slug: string): City | undefined {
  return CITY_BY_SLUG.get(slug);
}

/**
 * Villes qui ont LEURS PROPRES routes (app/fr/city/<slug>/…) : pour elles, la
 * route nationale `[slug]` doit s'effacer. Les huit autres villes du registre
 * (Lyon, Toulouse, Nice, Nantes, Montpellier, Strasbourg, Bordeaux, Lille)
 * n'ont pas de page propre : elles vivent sur les pages nationales comme toute
 * commune — les refuser parce qu'elles sont « au registre » les laissait sans
 * aucune page budget (404 en prod, vu le 2026-09-08 sur /fr/city/lyon/budget).
 */
const DEDICATED_ROUTES = new Set(["paris", "marseille"]);
export function hasDedicatedRoutes(slug: string): boolean {
  return DEDICATED_ROUTES.has(slug);
}

/** Returns the City or null. */
export function getCityOrNull(slug: string): City | null {
  return CITY_BY_SLUG.get(slug) ?? null;
}

/** All cities in the registry, in seed order (Paris first, then by population desc). */
export function listCities(): City[] {
  return PAYLOAD.cities.slice();
}

/** All slugs (for sitemap, params generation, etc.). */
export function listCitySlugs(): string[] {
  return PAYLOAD.cities.map((c) => c.slug);
}

/** Source metadata for citation. */
export function citiesSource(): {
  source_data: string;
  source_url: string;
  generated_at: string;
} {
  return {
    source_data: PAYLOAD.source_data,
    source_url: PAYLOAD.source_url,
    generated_at: PAYLOAD.generated_at,
  };
}
