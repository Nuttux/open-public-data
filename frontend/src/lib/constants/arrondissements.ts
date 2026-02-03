/**
 * Données démographiques des arrondissements de Paris
 * 
 * Source: INSEE - Recensement de la population 2021
 * https://www.insee.fr/fr/statistiques/2011101?geo=COM-75056
 * 
 * Dernière mise à jour: 2024 (données 2021)
 */

export interface ArrondissementInfo {
  code: number;
  nom: string;
  nomComplet: string;
  population: number;        // Population 2021
  superficie: number;        // km²
  densite: number;           // hab/km²
  codeINSEE: string;
}

/**
 * Population par arrondissement (INSEE 2021)
 * Total Paris: 2 133 111 habitants
 */
export const ARRONDISSEMENTS: ArrondissementInfo[] = [
  { code: 1,  nom: '1er',   nomComplet: '1er arrondissement',   population: 15939,  superficie: 1.83, densite: 8711,  codeINSEE: '75101' },
  { code: 2,  nom: '2ème',  nomComplet: '2ème arrondissement',  population: 20900,  superficie: 0.99, densite: 21111, codeINSEE: '75102' },
  { code: 3,  nom: '3ème',  nomComplet: '3ème arrondissement',  population: 33000,  superficie: 1.17, densite: 28205, codeINSEE: '75103' },
  { code: 4,  nom: '4ème',  nomComplet: '4ème arrondissement',  population: 28088,  superficie: 1.60, densite: 17555, codeINSEE: '75104' },
  { code: 5,  nom: '5ème',  nomComplet: '5ème arrondissement',  population: 56882,  superficie: 2.54, densite: 22395, codeINSEE: '75105' },
  { code: 6,  nom: '6ème',  nomComplet: '6ème arrondissement',  population: 40005,  superficie: 2.15, densite: 18607, codeINSEE: '75106' },
  { code: 7,  nom: '7ème',  nomComplet: '7ème arrondissement',  population: 48354,  superficie: 4.09, densite: 11822, codeINSEE: '75107' },
  { code: 8,  nom: '8ème',  nomComplet: '8ème arrondissement',  population: 35016,  superficie: 3.88, densite: 9024,  codeINSEE: '75108' },
  { code: 9,  nom: '9ème',  nomComplet: '9ème arrondissement',  population: 59835,  superficie: 2.18, densite: 27447, codeINSEE: '75109' },
  { code: 10, nom: '10ème', nomComplet: '10ème arrondissement', population: 83459,  superficie: 2.89, densite: 28878, codeINSEE: '75110' },
  { code: 11, nom: '11ème', nomComplet: '11ème arrondissement', population: 142583, superficie: 3.67, densite: 38851, codeINSEE: '75111' },
  { code: 12, nom: '12ème', nomComplet: '12ème arrondissement', population: 139867, superficie: 16.32, densite: 8570, codeINSEE: '75112' },
  { code: 13, nom: '13ème', nomComplet: '13ème arrondissement', population: 178350, superficie: 7.15, densite: 24944, codeINSEE: '75113' },
  { code: 14, nom: '14ème', nomComplet: '14ème arrondissement', population: 134382, superficie: 5.64, densite: 23826, codeINSEE: '75114' },
  { code: 15, nom: '15ème', nomComplet: '15ème arrondissement', population: 227746, superficie: 8.50, densite: 26794, codeINSEE: '75115' },
  { code: 16, nom: '16ème', nomComplet: '16ème arrondissement', population: 165062, superficie: 16.30, densite: 10126, codeINSEE: '75116' },
  { code: 17, nom: '17ème', nomComplet: '17ème arrondissement', population: 166518, superficie: 5.67, densite: 29369, codeINSEE: '75117' },
  { code: 18, nom: '18ème', nomComplet: '18ème arrondissement', population: 191531, superficie: 6.01, densite: 31869, codeINSEE: '75118' },
  { code: 19, nom: '19ème', nomComplet: '19ème arrondissement', population: 182952, superficie: 6.79, densite: 26945, codeINSEE: '75119' },
  { code: 20, nom: '20ème', nomComplet: '20ème arrondissement', population: 187642, superficie: 5.98, densite: 31378, codeINSEE: '75120' },
];

/**
 * Population totale de Paris
 */
export const PARIS_POPULATION_TOTAL = ARRONDISSEMENTS.reduce((sum, arr) => sum + arr.population, 0);

/**
 * Récupère les infos d'un arrondissement par son code (1-20)
 */
export function getArrondissementInfo(code: number): ArrondissementInfo | undefined {
  return ARRONDISSEMENTS.find(arr => arr.code === code);
}

/**
 * Récupère la population d'un arrondissement
 */
export function getArrondissementPopulation(code: number): number {
  const arr = ARRONDISSEMENTS.find(a => a.code === code);
  return arr?.population || 0;
}

/**
 * Map code -> population pour accès rapide
 */
export const POPULATION_PAR_ARRONDISSEMENT: Record<number, number> = Object.fromEntries(
  ARRONDISSEMENTS.map(arr => [arr.code, arr.population])
);

/**
 * URLs des sources de données pour l'auditabilité
 */
export const DATA_SOURCES = {
  population: {
    nom: 'INSEE - Recensement de la population 2021',
    url: 'https://www.insee.fr/fr/statistiques/2011101?geo=COM-75056',
    dateAcces: '2024-01',
  },
  subventions: {
    nom: 'Paris Open Data - Subventions aux associations votées',
    url: 'https://opendata.paris.fr/explore/dataset/subventions-associations-votees-/',
    api: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/subventions-associations-votees-/records',
  },
  logementsSociaux: {
    nom: 'Paris Open Data - Logements sociaux financés à Paris',
    url: 'https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/',
    api: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logements-sociaux-finances-a-paris/records',
  },
  arrondissements: {
    nom: 'Paris Open Data - Arrondissements',
    url: 'https://opendata.paris.fr/explore/dataset/arrondissements/',
    api: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson',
  },
  autorisationsProgrammes: {
    nom: 'Paris Open Data - Autorisations de Programmes',
    url: 'https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/',
    api: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/records',
  },
  siretGeoloc: {
    nom: 'API Recherche Entreprises - Géolocalisation SIRET',
    url: 'https://recherche-entreprises.api.gouv.fr/',
    documentation: 'https://www.data.gouv.fr/fr/dataservices/api-recherche-dentreprises/',
  },
};
