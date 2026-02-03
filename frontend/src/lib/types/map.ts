/**
 * Types pour les données cartographiques du dashboard Paris Budget
 * 
 * Contient les interfaces pour:
 * - Subventions aux associations (avec géolocalisation SIRET)
 * - Logements sociaux (déjà géolocalisés)
 * - Autorisations de programmes
 * - Arrondissements (polygones)
 */

/**
 * Point géographique simple (latitude, longitude)
 */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * Subvention à une association
 * Source: opendata.paris.fr - subventions-associations-votees-
 */
export interface Subvention {
  id: string;
  annee: number;
  beneficiaire: string;
  siret: string;
  objet: string;
  montant: number;
  direction: string;
  nature: string;
  secteurs?: string[];
  // Géolocalisation (enrichie via API entreprises)
  coordinates?: GeoPoint;
  adresse?: string;
  codePostal?: string;
  commune?: string;
}

/**
 * Programme de logement social
 * Source: opendata.paris.fr - logements-sociaux-finances-a-paris
 */
export interface LogementSocial {
  id: string;
  adresse: string;
  codePostal: string;
  annee: number;
  bailleur: string;
  nbLogements: number;
  nbPLAI: number;      // Très social
  nbPLUS: number;      // Social standard
  nbPLUSCD: number;    // Social CD
  nbPLS: number;       // Intermédiaire
  modeRealisation: string;
  arrondissement: number;
  natureProgramme: string;
  coordinates: GeoPoint;
}

/**
 * Autorisation de programme (investissement)
 * Source: opendata.paris.fr - comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de
 */
export interface AutorisationProgramme {
  id: string;
  exercice: number;
  budget: string;
  mission: string;
  missionTexte: string;
  activite: string;
  directionCode: string;
  directionTexte: string;
  apCode: string;
  apTexte: string;      // Texte descriptif pour extraction LLM
  natureCode: string;
  natureTexte: string;
  domaineCode: string;
  domaineTexte: string;
  montant: number;
  // Géolocalisation (extraite par LLM)
  coordinates?: GeoPoint;
  adresseExtraite?: string;
  arrondissementExtrait?: number;
  localisationType?: 'exact' | 'arrondissement' | 'paris' | 'inconnu';
}

/**
 * Arrondissement de Paris (pour carte choroplèthe)
 * Source: opendata.paris.fr - arrondissements
 */
export interface Arrondissement {
  code: number;         // 1-20
  nom: string;          // "10ème Ardt"
  centroid: GeoPoint;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  surface?: number;
  perimetre?: number;
}

/**
 * Données agrégées par arrondissement pour carte choroplèthe
 */
export interface ArrondissementStats {
  code: number;
  nom: string;
  totalSubventions: number;
  nbSubventions: number;
  totalLogements: number;
  nbProgrammesLogement: number;
  totalInvestissement: number;
  nbAutorisations: number;
  population?: number;      // Pour calcul per capita
  // Ratios calculés
  subventionsPerCapita?: number;
  logementsPerCapita?: number;
}

/**
 * Types de couches de données disponibles sur la carte
 */
export type MapLayerType = 
  | 'subventions' 
  | 'logements' 
  | 'autorisations'
  | 'choropleth-subventions'
  | 'choropleth-logements';

/**
 * Configuration d'une couche de carte
 */
export interface MapLayerConfig {
  id: MapLayerType;
  label: string;
  description: string;
  icon: string;
  color: string;
  enabled: boolean;
}

/**
 * Filtres appliqués aux données de la carte
 */
export interface MapFilters {
  anneeMin?: number;
  anneeMax?: number;
  annees?: number[];
  montantMin?: number;
  montantMax?: number;
  directions?: string[];
  arrondissements?: number[];
  natures?: string[];
  secteurs?: string[];
}

/**
 * État global de la carte
 */
export interface MapState {
  center: GeoPoint;
  zoom: number;
  activeLayers: MapLayerType[];
  filters: MapFilters;
  selectedItem?: {
    type: MapLayerType;
    id: string;
  };
}

/**
 * Réponse de l'API recherche-entreprises.api.gouv.fr
 */
export interface EntrepriseSearchResult {
  siren: string;
  siret: string;
  nom_complet: string;
  siege: {
    siret: string;
    adresse: string;
    code_postal: string;
    libelle_commune: string;
    latitude: string;
    longitude: string;
    departement: string;
  };
}

/**
 * Cache pour les géolocalisations SIRET
 */
export interface SiretGeoCache {
  [siret: string]: {
    coordinates: GeoPoint;
    adresse: string;
    codePostal: string;
    commune: string;
    fetchedAt: number;
  };
}
