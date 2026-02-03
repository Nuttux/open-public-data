/**
 * API Client pour Paris Open Data
 * 
 * Endpoints utilisés:
 * - subventions-associations-votees-: Subventions avec SIRET
 * - logements-sociaux-finances-a-paris: Logements sociaux géolocalisés
 * - comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de: AP
 * - arrondissements: Polygones des arrondissements
 */

import type { 
  Subvention, 
  LogementSocial, 
  AutorisationProgramme, 
  Arrondissement,
  GeoPoint 
} from '../types/map';

const BASE_URL = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets';

/**
 * Construit l'URL pour une requête avec paramètres
 */
function buildUrl(dataset: string, params: Record<string, string | number>): string {
  const url = new URL(`${BASE_URL}/${dataset}/records`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });
  return url.toString();
}

/**
 * Fetch générique avec gestion d'erreurs
 */
async function fetchFromParis<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Paris OpenData API error: ${response.status}`);
  }
  return response.json();
}

/**
 * Récupère les subventions aux associations
 * @param annee - Année à filtrer (optionnel)
 * @param limit - Nombre max de résultats (défaut: 100)
 */
export async function fetchSubventions(
  annee?: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: Subvention[]; total: number }> {
  const params: Record<string, string | number> = {
    limit,
    offset,
    order_by: 'montant_vote desc',
  };
  
  if (annee) {
    params.where = `annee_budgetaire="${annee}"`;
  }

  const url = buildUrl('subventions-associations-votees-', params);
  const response = await fetchFromParis<{
    total_count: number;
    results: Array<{
      numero_de_dossier: string;
      annee_budgetaire: string;
      collectivite: string;
      nom_beneficiaire: string;
      numero_siret: string;
      objet_du_dossier: string;
      montant_vote: number;
      direction: string;
      nature_de_la_subvention: string;
      secteurs_d_activites_definies_par_l_association?: string;
    }>;
  }>(url);

  const data: Subvention[] = response.results.map((r) => ({
    id: r.numero_de_dossier,
    annee: parseInt(r.annee_budgetaire, 10),
    beneficiaire: r.nom_beneficiaire,
    siret: r.numero_siret,
    objet: r.objet_du_dossier || '',
    montant: r.montant_vote || 0,
    direction: r.direction || '',
    nature: r.nature_de_la_subvention || '',
    secteurs: r.secteurs_d_activites_definies_par_l_association 
      ? [r.secteurs_d_activites_definies_par_l_association]
      : undefined,
  }));

  return { data, total: response.total_count };
}

/**
 * Récupère tous les subventions pour une année (pagination automatique)
 */
export async function fetchAllSubventionsForYear(annee: number): Promise<Subvention[]> {
  const allData: Subvention[] = [];
  let offset = 0;
  const limit = 100;
  let total = Infinity;

  while (offset < total) {
    const result = await fetchSubventions(annee, limit, offset);
    allData.push(...result.data);
    total = result.total;
    offset += limit;
    
    // Limiter à 1000 pour les performances
    if (offset >= 1000) break;
  }

  return allData;
}

/**
 * Récupère les programmes de logements sociaux
 */
export async function fetchLogementsSociaux(
  annee?: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: LogementSocial[]; total: number }> {
  const params: Record<string, string | number> = {
    limit,
    offset,
    order_by: 'nb_logmt_total desc',
  };
  
  if (annee) {
    params.where = `annee="${annee}"`;
  }

  const url = buildUrl('logements-sociaux-finances-a-paris', params);
  const response = await fetchFromParis<{
    total_count: number;
    results: Array<{
      id_livraison: string;
      adresse_programme: string;
      code_postal: string;
      annee: string;
      bs: string;
      nb_logmt_total: number;
      nb_plai: number;
      nb_plus: number;
      nb_pluscd: number;
      nb_pls: number;
      mode_real: string;
      arrdt: number;
      nature_programme: string;
      geo_point_2d?: { lat: number; lon: number };
    }>;
  }>(url);

  const data: LogementSocial[] = response.results
    .filter(r => r.geo_point_2d) // Filtrer ceux sans coordonnées
    .map((r) => ({
      id: r.id_livraison,
      adresse: r.adresse_programme,
      codePostal: r.code_postal,
      annee: parseInt(r.annee, 10),
      bailleur: r.bs,
      nbLogements: r.nb_logmt_total || 0,
      nbPLAI: r.nb_plai || 0,
      nbPLUS: r.nb_plus || 0,
      nbPLUSCD: r.nb_pluscd || 0,
      nbPLS: r.nb_pls || 0,
      modeRealisation: r.mode_real || '',
      arrondissement: r.arrdt,
      natureProgramme: r.nature_programme || '',
      coordinates: {
        lat: r.geo_point_2d!.lat,
        lon: r.geo_point_2d!.lon,
      },
    }));

  return { data, total: response.total_count };
}

/**
 * Récupère toutes les données de logements sociaux
 */
export async function fetchAllLogementsSociaux(): Promise<LogementSocial[]> {
  const allData: LogementSocial[] = [];
  let offset = 0;
  const limit = 100;
  let total = Infinity;

  while (offset < total) {
    const result = await fetchLogementsSociaux(undefined, limit, offset);
    allData.push(...result.data);
    total = result.total;
    offset += limit;
  }

  return allData;
}

/**
 * Récupère les autorisations de programmes
 */
export async function fetchAutorisationsProgrammes(
  exercice?: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: AutorisationProgramme[]; total: number }> {
  const params: Record<string, string | number> = {
    limit,
    offset,
    order_by: 'mandate_titre_apres_regul desc',
  };
  
  if (exercice) {
    params.where = `exercice_comptable="${exercice}"`;
  }

  const url = buildUrl('comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de', params);
  const response = await fetchFromParis<{
    total_count: number;
    results: Array<{
      exercice_comptable: string;
      budget: string;
      mission_ap_cle: string;
      mission_ap_texte: string;
      activite_ap: string;
      direction_gestionnaire_cle: string;
      direction_gestionnaire_texte: string;
      autorisation_de_programme_cle: string;
      autorisation_de_programme_texte: string;
      nature_budgetaire_cle: string;
      nature_budgetaire_texte: string;
      domaine_fonctionnel_rubrique_reglementaire_cle: string;
      domaine_fonctionnel_rubrique_reglementaire_texte: string;
      mandate_titre_apres_regul: number;
    }>;
  }>(url);

  const data: AutorisationProgramme[] = response.results.map((r, index) => ({
    id: `${r.exercice_comptable}-${r.autorisation_de_programme_cle}-${index}`,
    exercice: parseInt(r.exercice_comptable, 10),
    budget: r.budget,
    mission: r.mission_ap_cle,
    missionTexte: r.mission_ap_texte || '',
    activite: r.activite_ap || '',
    directionCode: r.direction_gestionnaire_cle || '',
    directionTexte: r.direction_gestionnaire_texte || '',
    apCode: r.autorisation_de_programme_cle,
    apTexte: r.autorisation_de_programme_texte || '',
    natureCode: r.nature_budgetaire_cle || '',
    natureTexte: r.nature_budgetaire_texte || '',
    domaineCode: r.domaine_fonctionnel_rubrique_reglementaire_cle || '',
    domaineTexte: r.domaine_fonctionnel_rubrique_reglementaire_texte || '',
    montant: r.mandate_titre_apres_regul || 0,
  }));

  return { data, total: response.total_count };
}

/**
 * Récupère les polygones des arrondissements
 */
export async function fetchArrondissements(): Promise<Arrondissement[]> {
  const url = buildUrl('arrondissements', { limit: 20 });
  const response = await fetchFromParis<{
    results: Array<{
      c_ar: number;
      l_ar: string;
      surface?: number;
      perimetre?: number;
      geom_x_y?: { lat: number; lon: number };
      geom?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    }>;
  }>(url);

  return response.results.map((r) => ({
    code: r.c_ar,
    nom: r.l_ar,
    centroid: r.geom_x_y 
      ? { lat: r.geom_x_y.lat, lon: r.geom_x_y.lon }
      : { lat: 48.8566, lon: 2.3522 }, // Centre Paris par défaut
    geometry: r.geom || { type: 'Polygon', coordinates: [] },
    surface: r.surface,
    perimetre: r.perimetre,
  }));
}

/**
 * Récupère les années disponibles pour les subventions
 */
export async function fetchAvailableYears(): Promise<number[]> {
  const url = `${BASE_URL}/subventions-associations-votees-/records?select=annee_budgetaire&group_by=annee_budgetaire&order_by=annee_budgetaire desc&limit=20`;
  const response = await fetchFromParis<{
    results: Array<{ annee_budgetaire: string }>;
  }>(url);

  return response.results
    .map(r => parseInt(r.annee_budgetaire, 10))
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a);
}

/**
 * Récupère les statistiques par direction
 */
export async function fetchDirectionStats(annee?: number): Promise<{ direction: string; total: number; count: number }[]> {
  let url = `${BASE_URL}/subventions-associations-votees-/records?select=direction,sum(montant_vote) as total,count(*) as count&group_by=direction&order_by=total desc&limit=50`;
  
  if (annee) {
    url += `&where=annee_budgetaire="${annee}"`;
  }

  const response = await fetchFromParis<{
    results: Array<{ direction: string; total: number; count: number }>;
  }>(url);

  return response.results;
}
