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
 * Index des investissements (AP)
 * Nouveau format unifié depuis dbt core_ap_projets
 */
interface InvestissementsIndex {
  years: number[];
  totalRecords: number;
  totalMontant: number;
  coverage: {
    withArrondissement: number;
    withCoords: number;
    montantLocalise: number;
    pourcentageLocalise: number;
  };
}

/**
 * Legacy: Index des autorisations de programmes (deprecated)
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
  investissements?: Record<number, AutorisationProgramme[]>;
  investissementsIndex?: InvestissementsIndex;
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
 * Charge l'index des investissements (AP)
 * 
 * Utilise le nouveau format unifié depuis dbt core_ap_projets
 * qui contient toutes les années avec les données enrichies par LLM
 */
export async function loadAutorisationsIndex(): Promise<AutorisationsIndex> {
  if (dataCache.autorisationsIndex) {
    return dataCache.autorisationsIndex;
  }

  try {
    // Charger le nouvel index unifié des investissements
    const investData = await loadJson<InvestissementsIndex>(
      `${BASE_PATH}/investissements_index.json`
    ).catch(() => null);
    
    if (investData) {
      dataCache.investissementsIndex = investData;
      
      const result: AutorisationsIndex = {
        availableYears: investData.years,
        thematiques: [
          'education', 'sport', 'culture', 'environnement', 
          'mobilite', 'logement', 'social', 'democratie', 'urbanisme', 'autre'
        ],
        missions: [],
      };
      
      dataCache.autorisationsIndex = result;
      return result;
    }
    
    // Fallback: ancien format (autorisations + investissements_localises)
    const autorisationsData = await loadJson<AutorisationsIndex>(
      `${BASE_PATH}/autorisations_index.json`
    ).catch(() => ({ availableYears: [], thematiques: [], missions: [] }));
    
    const investLocalisesData = await loadJson<{
      availableYears: number[];
      source: string;
    }>(`${BASE_PATH}/investissements_localises_index.json`).catch(() => ({ availableYears: [] }));
    
    const allYears = [...new Set([
      ...investLocalisesData.availableYears,
      ...autorisationsData.availableYears,
    ])].sort((a, b) => b - a);
    
    const result: AutorisationsIndex = {
      availableYears: allYears,
      thematiques: autorisationsData.thematiques || [
        'education', 'sport', 'culture', 'environnement', 
        'mobilite', 'logement', 'social', 'democratie', 'autre'
      ],
      missions: autorisationsData.missions || [],
    };
    
    dataCache.autorisationsIndex = result;
    return result;
  } catch {
    return {
      availableYears: [2022, 2021, 2020, 2019, 2018],
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
 * 
 * Nouveau format depuis dbt: investissements + logements sociaux par arrondissement
 * (pas de subventions car non géolocalisées)
 */
export async function loadArrondissementsStats(): Promise<ArrondissementStats[]> {
  if (dataCache.arrondissementsStats) {
    return dataCache.arrondissementsStats;
  }

  try {
    // Nouveau format: { years, population, data: [...] }
    const rawData = await loadJson<{
      years: number[];
      population: Record<string, number>;
      data: Array<{
        arrondissement: number;
        population: number;
        investissements: { total: number; count: number };
        logements: { total: number; count: number };
        investissementsParHabitant: number;
        logementsParHabitant: number;
      }>;
    }>(`${BASE_PATH}/arrondissements_stats.json`);

    // Transformer vers le format ArrondissementStats
    const rawStats: ArrondissementStats[] = rawData.data.map(d => ({
      code: d.arrondissement,
      nom: `${d.arrondissement}${d.arrondissement === 1 ? 'er' : 'ème'} Ardt`,
      population: d.population,
      // Subventions: non géolocalisées, donc à 0
      totalSubventions: 0,
      nbSubventions: 0,
      subventionsPerCapita: 0,
      // Logements
      totalLogements: d.logements.total,
      nbProgrammesLogement: d.logements.count,
      logementsPerCapita: d.logementsParHabitant,
      // Investissements
      totalInvestissement: d.investissements.total,
      nbAutorisations: d.investissements.count,
      investissementPerCapita: d.investissementsParHabitant,
    }));

    // Agréger arrondissements 1-4 en "Paris Centre" (code 0)
    const arr1to4 = rawStats.filter(s => s.code >= 1 && s.code <= 4);
    const parisCentre: ArrondissementStats = {
      code: 0,
      nom: 'Paris Centre',
      population: arr1to4.reduce((sum, s) => sum + (s.population ?? 0), 0),
      totalSubventions: arr1to4.reduce((sum, s) => sum + s.totalSubventions, 0),
      nbSubventions: arr1to4.reduce((sum, s) => sum + s.nbSubventions, 0),
      subventionsPerCapita: 0,
      totalLogements: arr1to4.reduce((sum, s) => sum + s.totalLogements, 0),
      nbProgrammesLogement: arr1to4.reduce((sum, s) => sum + s.nbProgrammesLogement, 0),
      logementsPerCapita: 0,
      totalInvestissement: arr1to4.reduce((sum, s) => sum + s.totalInvestissement, 0),
      nbAutorisations: arr1to4.reduce((sum, s) => sum + s.nbAutorisations, 0),
      investissementPerCapita: 0,
    };
    // Calculer les ratios per capita
    if (parisCentre.population > 0) {
      parisCentre.subventionsPerCapita = parisCentre.totalSubventions / parisCentre.population;
      parisCentre.logementsPerCapita = (parisCentre.totalLogements / parisCentre.population) * 1000;
      parisCentre.investissementPerCapita = parisCentre.totalInvestissement / parisCentre.population;
    }

    // Filtrer les arrondissements 1-4 et ajouter Paris Centre au début
    const stats = [
      parisCentre,
      ...rawStats.filter(s => s.code >= 5),
    ];

    dataCache.arrondissementsStats = stats;
    return stats;
  } catch {
    // Fallback: ancien format (array direct) ou logements par arrondissement
    try {
      const data = await loadJson<ArrondissementStats[]>(
        `${BASE_PATH}/arrondissements_stats.json`
      );
      dataCache.arrondissementsStats = data;
      return data;
    } catch {
      return loadLogementsParArrondissement();
    }
  }
}

/**
 * Charge les investissements (AP) pour une année
 * 
 * Utilise le nouveau format unifié depuis dbt core_ap_projets
 * avec données enrichies par LLM (arrondissement, adresse, thématique)
 */
export async function loadAutorisationsForYear(year: number): Promise<AutorisationProgramme[]> {
  // Check cache
  if (dataCache.investissements?.[year]) {
    return dataCache.investissements[year];
  }
  if (dataCache.autorisations?.[year]) {
    return dataCache.autorisations[year];
  }

  try {
    // Essayer d'abord le nouveau format unifié (investissements_*.json)
    const rawData = await loadJson<{
      year: number;
      total: number;
      count: number;
      withArrondissement: number;
      withCoords: number;
      parThematique: Record<string, { total: number; count: number }>;
      parArrondissement: Record<string, { total: number; count: number }>;
      data: Array<{
        id: string;
        annee: number;
        apCode: string;
        apTexte: string;
        missionCode: string;
        missionLibelle: string;
        directionCode: string;
        direction: string;
        montant: number;
        thematique: string;
        arrondissement: number | null;
        adresse: string | null;
        latitude: number | null;
        longitude: number | null;
        nomLieu: string | null;
        sourceGeo: string | null;
        confiance: number | null;
      }>;
    }>(`${BASE_PATH}/investissements_${year}.json`);

    // Transformer vers le format AutorisationProgramme
    const data: AutorisationProgramme[] = rawData.data.map(item => ({
      id: item.id,
      annee: item.annee,
      budget: 'Ville de Paris',
      missionCode: item.missionCode || '',
      missionTexte: item.missionLibelle || '',
      activite: '',
      directionCode: item.directionCode || '',
      directionTexte: item.direction || '',
      apCode: item.apCode || '',
      apTexte: item.apTexte || '',
      natureTexte: '',
      domaineTexte: item.missionLibelle || '',
      montant: item.montant,
      thematique: item.thematique || 'autre',
      arrondissement: item.arrondissement || undefined,
      // Nouvelles propriétés enrichies par LLM
      adresse: item.adresse || undefined,
      latitude: item.latitude || undefined,
      longitude: item.longitude || undefined,
      nomLieu: item.nomLieu || undefined,
    }));

    if (!dataCache.investissements) {
      dataCache.investissements = {};
    }
    dataCache.investissements[year] = data;
    return data;
  } catch {
    // Fallback: ancien format (autorisations_*.json ou investissements_localises_*.json)
    try {
      if (year >= 2023) {
        const rawData = await loadJson<{
          year: number;
          stats: { projets_extraits: number; total_extrait: number };
          data: Array<{
            id: string;
            annee: number;
            arrondissement: number;
            chapitre_code: string;
            chapitre_libelle: string;
            nom_projet: string;
            montant: number;
            type_ap: string;
            confidence: number;
            source_page: number;
            source_pdf: string;
          }>;
        }>(`${BASE_PATH}/investissements_localises_${year}.json`);

        const data = rawData.data.map(item => ({
          id: item.id,
          annee: item.annee,
          budget: 'Ville de Paris',
          missionCode: item.chapitre_code || '',
          missionTexte: item.chapitre_libelle || '',
          activite: item.type_ap || '',
          directionCode: '',
          directionTexte: '',
          apCode: item.id,
          apTexte: item.nom_projet,
          natureTexte: item.type_ap || '',
          domaineTexte: item.chapitre_libelle || '',
          montant: item.montant,
          thematique: mapChapitreToThematique(item.chapitre_libelle),
          arrondissement: item.arrondissement > 0 ? item.arrondissement : undefined,
        }));

        if (!dataCache.autorisations) {
          dataCache.autorisations = {};
        }
        dataCache.autorisations[year] = data;
        return data;
      } else {
        const rawData = await loadJson<{
          year: number;
          total: number;
          count: number;
          data: AutorisationProgramme[];
        }>(`${BASE_PATH}/autorisations_${year}.json`);

        if (!dataCache.autorisations) {
          dataCache.autorisations = {};
        }
        dataCache.autorisations[year] = rawData.data;
        return rawData.data;
      }
    } catch (err) {
      console.warn(`Investissements for ${year} not found:`, err);
      return [];
    }
  }
}

/**
 * Mappe un chapitre budgétaire vers une thématique
 * Utilisé pour les investissements localisés extraits des PDFs
 */
function mapChapitreToThematique(chapitre: string): string {
  if (!chapitre) return 'autre';
  const upper = chapitre.toUpperCase();
  
  if (upper.includes('SCOLAIRE') || upper.includes('ECOLE') || upper.includes('CRÈCHE') || upper.includes('PETITE ENFANCE')) {
    return 'education';
  }
  if (upper.includes('SPORT') || upper.includes('PISCINE') || upper.includes('STADE') || upper.includes('GYMNASE')) {
    return 'sport';
  }
  if (upper.includes('CULTURE') || upper.includes('BIBLIOTHÈQUE') || upper.includes('MUSÉE') || upper.includes('THÉÂTRE')) {
    return 'culture';
  }
  if (upper.includes('ESPACE') || upper.includes('VERT') || upper.includes('PARC') || upper.includes('JARDIN') || upper.includes('ENVIRONNEMENT')) {
    return 'environnement';
  }
  if (upper.includes('VOIRIE') || upper.includes('CIRCULATION') || upper.includes('MOBILITÉ')) {
    return 'mobilite';
  }
  if (upper.includes('LOGEMENT') || upper.includes('HABITAT')) {
    return 'logement';
  }
  if (upper.includes('SOCIAL') || upper.includes('SOLIDARITÉ') || upper.includes('EHPAD')) {
    return 'social';
  }
  if (upper.includes('PARTICIPATIF') || upper.includes('CITOYEN')) {
    return 'democratie';
  }
  
  return 'autre';
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
  delete dataCache.investissements;
  delete dataCache.investissementsIndex;
  delete dataCache.autorisations;
  delete dataCache.autorisationsIndex;
  delete dataCache.arrondissementsStats;
}
