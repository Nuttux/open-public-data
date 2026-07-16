/**
 * Cities registry — single source of truth for `/fr/city/[slug]` pages.
 *
 * Generated from `pipeline/seeds/seed_communes_cibles.csv` via
 * `pipeline/scripts/export/export_cities.py`.
 *
 * To add a city: add a row in the seed, run the export script, type-check.
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
