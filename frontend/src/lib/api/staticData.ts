/**
 * Client pour charger les données cartographiques statiques
 * 
 * Charge les fichiers JSON pré-exportés depuis /public/data/map/
 * au lieu de faire des appels API à chaque chargement de page.
 */

import type { 
  Subvention, 
  LogementSocial, 
  ArrondissementStats,
  AutorisationProgramme,
} from '../types/map';

const BASE_PATH = '/data/map';

/**
 * Index des subventions avec thématiques
 */
interface SubventionsIndex {
  availableYears: number[];
  thematiques: string[];
}

/**
 * Index des autorisations de programmes
 */
interface AutorisationsIndex {
  availableYears: number[];
  thematiques: string[];
  missions: string[];
}

/**
 * Cache en mémoire pour les données chargées
 */
const dataCache: {
  logements?: LogementSocial[];
  logementsParArr?: ArrondissementStats[];
  subventions?: Record<number, Subvention[]>;
  subventionsIndex?: SubventionsIndex;
  autorisations?: Record<number, AutorisationProgramme[]>;
  autorisationsIndex?: AutorisationsIndex;
  arrondissementsStats?: ArrondissementStats[];
} = {};

/**
 * Charge un fichier JSON statique
 */
async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

/**
 * Charge les logements sociaux (tous, car déjà géolocalisés)
 */
export async function loadLogementsSociaux(): Promise<LogementSocial[]> {
  if (dataCache.logements) {
    return dataCache.logements;
  }

  const data = await loadJson<{
    total: number;
    count: number;
    data: LogementSocial[];
  }>(`${BASE_PATH}/logements_sociaux.json`);

  dataCache.logements = data.data;
  return data.data;
}

/**
 * Charge les stats de logements par arrondissement
 */
export async function loadLogementsParArrondissement(): Promise<ArrondissementStats[]> {
  if (dataCache.logementsParArr) {
    return dataCache.logementsParArr;
  }

  const data = await loadJson<Array<{
    code: number;
    nom: string;
    totalLogements: number;
    nbProgrammes: number;
  }>>(`${BASE_PATH}/logements_par_arrondissement.json`);

  // Transformer en ArrondissementStats
  const stats: ArrondissementStats[] = data.map(d => ({
    code: d.code,
    nom: d.nom,
    totalSubventions: 0,
    nbSubventions: 0,
    totalLogements: d.totalLogements,
    nbProgrammesLogement: d.nbProgrammes,
    totalInvestissement: 0,
    nbAutorisations: 0,
  }));

  dataCache.logementsParArr = stats;
  return stats;
}

/**
 * Charge l'index des subventions (années et thématiques)
 */
export async function loadSubventionsIndex(): Promise<SubventionsIndex> {
  if (dataCache.subventionsIndex) {
    return dataCache.subventionsIndex;
  }

  try {
    const data = await loadJson<SubventionsIndex>(
      `${BASE_PATH}/subventions_index.json`
    );
    dataCache.subventionsIndex = data;
    return data;
  } catch {
    // Fallback si le fichier n'existe pas encore
    return {
      availableYears: [2024, 2023, 2022, 2021, 2020, 2019],
      thematiques: [],
    };
  }
}

/**
 * Charge l'index des autorisations de programmes
 */
export async function loadAutorisationsIndex(): Promise<AutorisationsIndex> {
  if (dataCache.autorisationsIndex) {
    return dataCache.autorisationsIndex;
  }

  try {
    const data = await loadJson<AutorisationsIndex>(
      `${BASE_PATH}/autorisations_index.json`
    );
    dataCache.autorisationsIndex = data;
    return data;
  } catch {
    return {
      availableYears: [2024, 2023, 2022, 2021, 2020, 2019, 2018],
      thematiques: [],
      missions: [],
    };
  }
}

/**
 * Charge les subventions pour une année donnée
 */
export async function loadSubventionsForYear(year: number): Promise<Subvention[]> {
  if (dataCache.subventions?.[year]) {
    return dataCache.subventions[year];
  }

  try {
    const data = await loadJson<{
      year: number;
      total: number;
      count: number;
      geolocated: number;
      data: Subvention[];
    }>(`${BASE_PATH}/subventions_${year}.json`);

    if (!dataCache.subventions) {
      dataCache.subventions = {};
    }
    dataCache.subventions[year] = data.data;
    return data.data;
  } catch {
    console.warn(`Subventions for ${year} not found, returning empty array`);
    return [];
  }
}

/**
 * Charge le GeoJSON des arrondissements
 */
export async function loadArrondissementsGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  return loadJson<GeoJSON.FeatureCollection>(`${BASE_PATH}/arrondissements.geojson`);
}

/**
 * Charge les stats combinées par arrondissement
 */
export async function loadArrondissementsStats(): Promise<ArrondissementStats[]> {
  if (dataCache.arrondissementsStats) {
    return dataCache.arrondissementsStats;
  }

  try {
    const data = await loadJson<ArrondissementStats[]>(
      `${BASE_PATH}/arrondissements_stats.json`
    );
    dataCache.arrondissementsStats = data;
    return data;
  } catch {
    // Fallback: charger les logements par arrondissement
    return loadLogementsParArrondissement();
  }
}

/**
 * Charge les autorisations de programmes pour une année
 */
export async function loadAutorisationsForYear(year: number): Promise<AutorisationProgramme[]> {
  if (dataCache.autorisations?.[year]) {
    return dataCache.autorisations[year];
  }

  try {
    const data = await loadJson<{
      year: number;
      total: number;
      count: number;
      data: AutorisationProgramme[];
    }>(`${BASE_PATH}/autorisations_${year}.json`);

    if (!dataCache.autorisations) {
      dataCache.autorisations = {};
    }
    dataCache.autorisations[year] = data.data;
    return data.data;
  } catch {
    console.warn(`Autorisations for ${year} not found`);
    return [];
  }
}

/**
 * Précharge toutes les données pour éviter les waterfalls
 */
export async function preloadAllMapData(): Promise<{
  logements: LogementSocial[];
  arrondissementsStats: ArrondissementStats[];
  subventionsIndex: SubventionsIndex;
  autorisationsIndex: AutorisationsIndex;
}> {
  const [logements, arrondissementsStats, subventionsIndex, autorisationsIndex] = await Promise.all([
    loadLogementsSociaux(),
    loadArrondissementsStats(),
    loadSubventionsIndex(),
    loadAutorisationsIndex(),
  ]);

  return { logements, arrondissementsStats, subventionsIndex, autorisationsIndex };
}

/**
 * Vide le cache (utile pour forcer un rechargement)
 */
export function clearDataCache(): void {
  delete dataCache.logements;
  delete dataCache.logementsParArr;
  delete dataCache.subventions;
  delete dataCache.subventionsIndex;
}
