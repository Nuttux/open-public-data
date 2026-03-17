/**
 * Client pour charger les données multi-ville
 *
 * Charge les fichiers JSON pré-exportés depuis /public/data/villes/
 */

import type { BudgetData } from '../formatters';
import type {
  CitiesIndex,
  BenchmarkingData,
  CityEvolutionYear,
  CityMarchesData,
  CitySubventionsData,
  CityBilanData,
  YearIndex,
} from '../types/villes';

const VILLES_BASE = '/data/villes';

// In-memory cache
const cache = new Map<string, unknown>();

async function loadJson<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached) return cached as T;

  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  const data = await res.json();
  cache.set(path, data);
  return data as T;
}

// ── Cities Index ──────────────────────────────────────────────────────────────

export async function loadCitiesIndex(): Promise<CitiesIndex> {
  return loadJson<CitiesIndex>(`${VILLES_BASE}/cities.json`);
}

// ── Benchmarking ──────────────────────────────────────────────────────────────

export async function loadBenchmarking(): Promise<BenchmarkingData> {
  return loadJson<BenchmarkingData>(`${VILLES_BASE}/benchmarking.json`);
}

// ── Budget Sankey ─────────────────────────────────────────────────────────────

export async function loadCityBudgetSankey(slug: string, year: number): Promise<BudgetData> {
  return loadJson<BudgetData>(`${VILLES_BASE}/${slug}/budget_sankey_${year}.json`);
}

export async function loadCityBudgetIndex(slug: string): Promise<YearIndex> {
  return loadJson<YearIndex>(`${VILLES_BASE}/${slug}/budget_index.json`);
}

// ── Evolution ─────────────────────────────────────────────────────────────────

export async function loadCityEvolution(slug: string): Promise<CityEvolutionYear[]> {
  return loadJson<CityEvolutionYear[]>(`${VILLES_BASE}/${slug}/evolution.json`);
}

// ── Marchés ───────────────────────────────────────────────────────────────────

export async function loadCityMarches(slug: string, year: number): Promise<CityMarchesData> {
  return loadJson<CityMarchesData>(`${VILLES_BASE}/${slug}/marches_${year}.json`);
}

export async function loadCityMarchesIndex(slug: string): Promise<YearIndex> {
  return loadJson<YearIndex>(`${VILLES_BASE}/${slug}/marches_index.json`);
}

// ── Subventions ───────────────────────────────────────────────────────────────

export async function loadCitySubventions(slug: string, year: number): Promise<CitySubventionsData> {
  return loadJson<CitySubventionsData>(`${VILLES_BASE}/${slug}/subventions_${year}.json`);
}

export async function loadCitySubventionsIndex(slug: string): Promise<YearIndex> {
  return loadJson<YearIndex>(`${VILLES_BASE}/${slug}/subventions_index.json`);
}

// ── Bilan / Patrimoine ────────────────────────────────────────────────────────

export async function loadCityBilan(slug: string, year: number): Promise<CityBilanData> {
  return loadJson<CityBilanData>(`${VILLES_BASE}/${slug}/bilan_${year}.json`);
}

export async function loadCityBilanIndex(slug: string): Promise<YearIndex> {
  return loadJson<YearIndex>(`${VILLES_BASE}/${slug}/bilan_index.json`);
}
