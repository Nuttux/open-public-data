/**
 * API Client pour recherche-entreprises.api.gouv.fr
 * 
 * Permet de récupérer la géolocalisation d'une entreprise/association
 * à partir de son numéro SIRET.
 * 
 * Limites API: 7 appels/seconde, taux de disponibilité 100%
 */

import type { GeoPoint, SiretGeoCache, Subvention } from '../types/map';

const API_URL = 'https://recherche-entreprises.api.gouv.fr/search';

/**
 * Cache en mémoire pour les résultats de géolocalisation
 * Évite les appels API répétés pour le même SIRET
 */
const geoCache: SiretGeoCache = {};

/**
 * Durée de validité du cache (24h en millisecondes)
 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Délai entre les requêtes pour respecter la limite API (150ms = ~6.5 req/s)
 */
const API_DELAY = 150;

/**
 * Résultat de géolocalisation d'un SIRET
 */
export interface SiretGeoResult {
  siret: string;
  coordinates: GeoPoint | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  success: boolean;
  error?: string;
}

/**
 * Vérifie si une entrée du cache est encore valide
 */
function isCacheValid(cachedAt: number): boolean {
  return Date.now() - cachedAt < CACHE_TTL;
}

/**
 * Nettoie le SIRET (supprime espaces et caractères non numériques)
 */
function cleanSiret(siret: string): string {
  return siret.replace(/\D/g, '');
}

/**
 * Attend un certain délai (pour rate limiting)
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Géolocalise un SIRET via l'API entreprises
 * @param siret - Numéro SIRET (14 chiffres)
 * @returns Résultat avec coordonnées ou erreur
 */
export async function geolocateSiret(siret: string): Promise<SiretGeoResult> {
  const cleanedSiret = cleanSiret(siret);
  
  // Vérifier le format SIRET
  if (cleanedSiret.length !== 14) {
    return {
      siret: cleanedSiret,
      coordinates: null,
      adresse: null,
      codePostal: null,
      commune: null,
      success: false,
      error: 'SIRET invalide (doit contenir 14 chiffres)',
    };
  }

  // Vérifier le cache
  const cached = geoCache[cleanedSiret];
  if (cached && isCacheValid(cached.fetchedAt)) {
    return {
      siret: cleanedSiret,
      coordinates: cached.coordinates,
      adresse: cached.adresse,
      codePostal: cached.codePostal,
      commune: cached.commune,
      success: true,
    };
  }

  try {
    // Recherche par SIRET exact
    const url = `${API_URL}?q=${cleanedSiret}&mtm_campaign=paris-budget`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return {
        siret: cleanedSiret,
        coordinates: null,
        adresse: null,
        codePostal: null,
        commune: null,
        success: false,
        error: 'SIRET non trouvé',
      };
    }

    // Chercher l'établissement avec le bon SIRET
    const result = data.results[0];
    const siege = result.siege;

    if (!siege || !siege.latitude || !siege.longitude) {
      return {
        siret: cleanedSiret,
        coordinates: null,
        adresse: siege?.adresse || null,
        codePostal: siege?.code_postal || null,
        commune: siege?.libelle_commune || null,
        success: false,
        error: 'Coordonnées non disponibles',
      };
    }

    const geoResult: SiretGeoResult = {
      siret: cleanedSiret,
      coordinates: {
        lat: parseFloat(siege.latitude),
        lon: parseFloat(siege.longitude),
      },
      adresse: siege.adresse || null,
      codePostal: siege.code_postal || null,
      commune: siege.libelle_commune || null,
      success: true,
    };

    // Mettre en cache
    geoCache[cleanedSiret] = {
      coordinates: geoResult.coordinates!,
      adresse: geoResult.adresse || '',
      codePostal: geoResult.codePostal || '',
      commune: geoResult.commune || '',
      fetchedAt: Date.now(),
    };

    return geoResult;

  } catch (error) {
    return {
      siret: cleanedSiret,
      coordinates: null,
      adresse: null,
      codePostal: null,
      commune: null,
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Géolocalise plusieurs SIRETs en batch avec rate limiting
 * @param sirets - Liste de SIRETs
 * @param onProgress - Callback de progression (optionnel)
 * @returns Liste des résultats
 */
export async function geolocateSiretBatch(
  sirets: string[],
  onProgress?: (current: number, total: number) => void
): Promise<SiretGeoResult[]> {
  const results: SiretGeoResult[] = [];
  const uniqueSirets = [...new Set(sirets.map(cleanSiret))];
  
  for (let i = 0; i < uniqueSirets.length; i++) {
    const result = await geolocateSiret(uniqueSirets[i]);
    results.push(result);
    
    onProgress?.(i + 1, uniqueSirets.length);
    
    // Rate limiting - attendre entre chaque requête
    if (i < uniqueSirets.length - 1) {
      await delay(API_DELAY);
    }
  }

  return results;
}

/**
 * Enrichit une liste de subventions avec les coordonnées géographiques
 * @param subventions - Liste de subventions
 * @param onProgress - Callback de progression
 * @returns Subventions enrichies avec coordonnées
 */
export async function enrichSubventionsWithGeo(
  subventions: Subvention[],
  onProgress?: (current: number, total: number, found: number) => void
): Promise<Subvention[]> {
  const enriched: Subvention[] = [];
  let found = 0;

  // Filtrer les subventions avec SIRET valide
  const withValidSiret = subventions.filter(s => s.siret && cleanSiret(s.siret).length === 14);
  
  for (let i = 0; i < withValidSiret.length; i++) {
    const sub = withValidSiret[i];
    const geoResult = await geolocateSiret(sub.siret);
    
    if (geoResult.success && geoResult.coordinates) {
      found++;
      enriched.push({
        ...sub,
        coordinates: geoResult.coordinates,
        adresse: geoResult.adresse || undefined,
        codePostal: geoResult.codePostal || undefined,
        commune: geoResult.commune || undefined,
      });
    } else {
      // Garder même sans coordonnées pour les stats
      enriched.push(sub);
    }

    onProgress?.(i + 1, withValidSiret.length, found);

    // Rate limiting
    if (i < withValidSiret.length - 1) {
      await delay(API_DELAY);
    }
  }

  return enriched;
}

/**
 * Récupère les statistiques du cache
 */
export function getCacheStats(): { size: number; validEntries: number } {
  const entries = Object.values(geoCache);
  const validEntries = entries.filter(e => isCacheValid(e.fetchedAt)).length;
  return {
    size: entries.length,
    validEntries,
  };
}

/**
 * Vide le cache de géolocalisation
 */
export function clearGeoCache(): void {
  Object.keys(geoCache).forEach(key => delete geoCache[key]);
}

/**
 * Exporte le cache pour persistance (localStorage)
 */
export function exportCache(): string {
  return JSON.stringify(geoCache);
}

/**
 * Importe un cache depuis une chaîne JSON
 */
export function importCache(cacheJson: string): void {
  try {
    const imported = JSON.parse(cacheJson) as SiretGeoCache;
    Object.assign(geoCache, imported);
  } catch {
    console.warn('Failed to import geo cache');
  }
}
