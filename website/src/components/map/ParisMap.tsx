'use client';

/**
 * Composant ParisMap - Carte interactive de Paris
 * 
 * Utilise react-leaflet pour afficher:
 * - Points: subventions, logements sociaux, autorisations de programmes
 * - Polygones: arrondissements (choroplèthe)
 * 
 * Note: Ce composant doit être importé dynamiquement (next/dynamic)
 * car Leaflet nécessite window (SSR incompatible)
 */

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Subvention, LogementSocial, GeoPoint, ArrondissementStats, AutorisationProgramme } from '@/lib/types/map';
import { formatEuroCompact } from '@/lib/formatters';
import { getDirectionName, THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import ChoroplethLayer, { ChoroplethLegend, type ChoroplethMetric } from './ChoroplethLayer';
import { MISC_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

/**
 * Centre de Paris par défaut
 */
const PARIS_CENTER: GeoPoint = { lat: 48.8566, lon: 2.3522 };
const DEFAULT_ZOOM = 12;

/**
 * Centroïdes approximatifs des arrondissements de Paris
 * Pour placer les autorisations de programmes dont on connaît l'arrondissement
 * 
 * Note: 0 = Paris Centre (fusion des 1-4 depuis 2020)
 */
const ARRONDISSEMENT_CENTROIDS: Record<number, GeoPoint> = {
  // Paris Centre (fusion 1-4)
  0:  { lat: 48.8566, lon: 2.3470 },
  // Arrondissements individuels (gardés pour données historiques)
  1:  { lat: 48.8603, lon: 2.3470 },
  2:  { lat: 48.8679, lon: 2.3423 },
  3:  { lat: 48.8638, lon: 2.3612 },
  4:  { lat: 48.8546, lon: 2.3575 },
  5:  { lat: 48.8449, lon: 2.3498 },
  6:  { lat: 48.8490, lon: 2.3328 },
  7:  { lat: 48.8566, lon: 2.3123 },
  8:  { lat: 48.8744, lon: 2.3108 },
  9:  { lat: 48.8764, lon: 2.3375 },
  10: { lat: 48.8758, lon: 2.3609 },
  11: { lat: 48.8592, lon: 2.3792 },
  12: { lat: 48.8396, lon: 2.3876 },
  13: { lat: 48.8322, lon: 2.3561 },
  14: { lat: 48.8286, lon: 2.3257 },
  15: { lat: 48.8421, lon: 2.2920 },
  16: { lat: 48.8637, lon: 2.2769 },
  17: { lat: 48.8864, lon: 2.3053 },
  18: { lat: 48.8914, lon: 2.3443 },
  19: { lat: 48.8848, lon: 2.3822 },
  20: { lat: 48.8638, lon: 2.3984 },
};

/**
 * Fix pour les icônes Leaflet avec Next.js
 */
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

/**
 * Props du composant ParisMap
 */
interface ParisMapProps {
  subventions?: Subvention[];
  logements?: LogementSocial[];
  autorisations?: AutorisationProgramme[];
  arrondissementStats?: ArrondissementStats[];
  showSubventions?: boolean;
  showLogements?: boolean;
  showAutorisations?: boolean;
  showChoropleth?: boolean;
  choroplethMetric?: ChoroplethMetric;
  onMarkerClick?: (type: 'subvention' | 'logement', id: string) => void;
  onArrondissementClick?: (code: number) => void;
  selectedId?: string;
  isLoading?: boolean;
}

/**
 * Calcule le rayon d'un cercle en fonction du montant
 * Tailles équilibrées entre les différents types de données
 */
function getCircleRadius(montant: number, type: 'subvention' | 'logement' | 'autorisation'): number {
  if (type === 'logement') {
    // Logements: basé sur nb logements (5-100+)
    if (montant < 10) return 4;
    if (montant < 30) return 6;
    if (montant < 50) return 8;
    if (montant < 100) return 10;
    if (montant < 200) return 12;
    return 14;
  }
  if (type === 'autorisation') {
    // Autorisations: montants en € (souvent 100k-10M)
    if (montant < 50000) return 5;
    if (montant < 200000) return 7;
    if (montant < 500000) return 9;
    if (montant < 1000000) return 11;
    if (montant < 5000000) return 13;
    return 15;
  }
  // Subventions: montants en € (souvent 1k-500k)
  if (montant < 5000) return 4;
  if (montant < 20000) return 6;
  if (montant < 50000) return 8;
  if (montant < 100000) return 10;
  if (montant < 300000) return 12;
  return 14;
}

/**
 * Composant pour recentrer la carte
 */
function MapController({ center, zoom }: { center?: GeoPoint; zoom?: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lon], zoom || map.getZoom());
    }
  }, [map, center, zoom]);

  return null;
}

/**
 * Composant principal de la carte
 */
export default function ParisMap({
  subventions = [],
  logements = [],
  autorisations = [],
  arrondissementStats = [],
  showSubventions = true,
  showLogements = true,
  showAutorisations = false,
  showChoropleth = false,
  choroplethMetric = 'subventions',
  onMarkerClick,
  onArrondissementClick,
  selectedId,
  isLoading = false,
}: ParisMapProps) {
  const t = useT();
  const [mapReady, setMapReady] = useState(false);

  // Les subventions avec coordonnées
  const geoSubventions = subventions.filter(s => s.coordinates);
  
  /**
   * Autorisations avec coordonnées géographiques
   * 
   * Priorité: coordonnées précises (lat/lon) > centroid arrondissement
   * Les projets sans aucune localisation sont exclus
   */
  const geoAutorisations = useMemo(() => {
    return autorisations
      .filter(a => {
        // A des coordonnées précises OU un arrondissement connu
        const hasPreciseCoords = a.latitude && a.longitude;
        const hasArrondissement = a.arrondissement && ARRONDISSEMENT_CENTROIDS[a.arrondissement];
        return hasPreciseCoords || hasArrondissement;
      })
      .map(a => {
        // Utiliser les coordonnées précises si disponibles
        if (a.latitude && a.longitude) {
          return {
            ...a,
            coordinates: { lat: a.latitude, lon: a.longitude },
            isPrecise: true,  // Flag pour affichage différencié
          };
        }
        // Sinon, fallback sur le centroïde de l'arrondissement avec offset aléatoire
        return {
          ...a,
          coordinates: {
            lat: ARRONDISSEMENT_CENTROIDS[a.arrondissement!].lat + (Math.random() - 0.5) * 0.008,
            lon: ARRONDISSEMENT_CENTROIDS[a.arrondissement!].lon + (Math.random() - 0.5) * 0.008,
          },
          isPrecise: false,
        };
      });
  }, [autorisations]);

  // Calcul du max pour la légende choroplèthe (utilise percentile dans ChoroplethLayer)
  const maxChoroplethValue = useMemo(() => {
    return arrondissementStats.reduce((max, s) => {
      const value = choroplethMetric === 'subventions' 
        ? (s.subventionsPerCapita || 0)
        : choroplethMetric === 'logements' 
          ? (s.logementsPerCapita || 0)
          : (s.investissementPerCapita || 0);
      return Math.max(max, value);
    }, 0);
  }, [arrondissementStats, choroplethMetric]);
  
  return (
    <div className="relative w-full h-full min-h-[500px] rounded-xl overflow-hidden">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-[1000] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-300 text-sm">{t('ui.loading')}</p>
          </div>
        </div>
      )}

      <MapContainer
        center={[PARIS_CENTER.lat, PARIS_CENTER.lon]}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        whenReady={() => setMapReady(true)}
      >
        {/* Fond de carte sombre */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <MapController />

        {/* Layer Choroplèthe (arrondissements) */}
        {showChoropleth && mapReady && arrondissementStats.length > 0 && (
          <ChoroplethLayer
            stats={arrondissementStats}
            metric={choroplethMetric}
            onArrondissementClick={onArrondissementClick}
          />
        )}

        {/* Layer Subventions */}
        {showSubventions && mapReady && geoSubventions.map((sub, index) => (
          <CircleMarker
            key={`sub-${sub.id}-${index}`}
            center={[sub.coordinates!.lat, sub.coordinates!.lon]}
            radius={getCircleRadius(sub.montant, 'subvention')}
            pathOptions={{
              color: selectedId === sub.id ? '#f59e0b' : '#8b5cf6',
              fillColor: selectedId === sub.id ? '#f59e0b' : '#8b5cf6',
              fillOpacity: 0.6,
              weight: selectedId === sub.id ? 3 : 1,
            }}
            eventHandlers={{
              click: () => onMarkerClick?.('subvention', sub.id),
            }}
          >
            <Popup>
              <div className="min-w-[220px]">
                <h3 className="font-bold text-slate-100 mb-1">{sub.beneficiaire}</h3>
                <p className="text-2xl font-bold text-purple-600 mb-2">
                  {formatEuroCompact(sub.montant)}
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <strong>{t('map.direction')}</strong>{' '}
                    <span title={sub.direction}>{getDirectionName(sub.direction)}</span>
                  </p>
                  {sub.thematique && (
                    <p>
                      <strong>{t('map.theme')}</strong>{' '}
                      {THEMATIQUE_LABELS[sub.thematique as ThematiqueSubvention]?.icon || '📋'}{' '}
                      {THEMATIQUE_LABELS[sub.thematique as ThematiqueSubvention]?.label || sub.thematique}
                    </p>
                  )}
                  <p><strong>{t('map.nature')}</strong> {sub.nature}</p>
                  <p><strong>{t('map.object')}</strong> {sub.objet}</p>
                  {sub.adresse && <p><strong>{t('map.address')}</strong> {sub.adresse}</p>}
                  <p><strong>{t('map.year')}</strong> {sub.annee}</p>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Layer Logements Sociaux */}
        {showLogements && mapReady && logements.map((log, index) => (
          <CircleMarker
            key={`log-${log.id}-${index}`}
            center={[log.coordinates.lat, log.coordinates.lon]}
            radius={getCircleRadius(log.nbLogements, 'logement')}
            pathOptions={{
              color: selectedId === log.id ? '#f59e0b' : '#10b981',
              fillColor: selectedId === log.id ? '#f59e0b' : '#10b981',
              fillOpacity: 0.6,
              weight: selectedId === log.id ? 3 : 1,
            }}
            eventHandlers={{
              click: () => onMarkerClick?.('logement', log.id),
            }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-bold text-slate-100 mb-1">{log.adresse}</h3>
                <p className="text-2xl font-bold text-emerald-600 mb-2">
                  {log.nbLogements} {t('map.units')}
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <p><strong>{t('map.landlord')}</strong> {log.bailleur}</p>
                  <p><strong>{t('map.type')}</strong> {log.natureProgramme}</p>
                  <p><strong>{t('map.mode')}</strong> {log.modeRealisation}</p>
                  <p><strong>{t('map.year')}</strong> {log.annee}</p>
                  <p><strong>{t('map.district')}</strong> {`${log.arrondissement}${t('map.district_suffix')}`}</p>
                  <div className="mt-2 pt-2 border-t border-slate-700/50">
                    <p>{t('map.plai_label')} {log.nbPLAI}</p>
                    <p>{t('map.plus_label')} {log.nbPLUS}</p>
                    <p>{t('map.pls_label')} {log.nbPLS}</p>
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Layer Autorisations de programmes */}
        {showAutorisations && mapReady && geoAutorisations.map((ap, index) => (
          <CircleMarker
            key={`ap-${ap.id}-${index}`}
            center={[ap.coordinates.lat, ap.coordinates.lon]}
            radius={getCircleRadius(ap.montant, 'autorisation')}
            pathOptions={{
              // Couleur différente selon la précision de la géolocalisation
              color: ap.isPrecise ? '#f59e0b' : '#fb923c',
              fillColor: ap.isPrecise ? '#f59e0b' : '#fb923c',
              fillOpacity: ap.isPrecise ? 0.7 : 0.4,
              weight: ap.isPrecise ? 2 : 1,
              // Style pointillé pour les localisations approximatives
              dashArray: ap.isPrecise ? undefined : '4,4',
            }}
          >
            <Popup maxWidth={350}>
              <div className="min-w-[280px] max-w-[320px]">
                <h3 className="font-bold text-slate-100 mb-1 text-sm leading-tight">{ap.apTexte}</h3>
                <p className="text-xl font-bold text-amber-600 mb-2">
                  {formatEuroCompact(ap.montant)}
                </p>
                <div className="text-xs text-slate-600 space-y-1.5">
                  <p className="leading-snug">
                    <strong>{t('map.chapter')}</strong>{' '}
                    <span className="text-slate-700">{ap.missionTexte}</span>
                  </p>
                  {ap.thematique && (
                    <p>
                      <strong>{t('map.theme')}</strong>{' '}
                      {THEMATIQUE_LABELS[ap.thematique as ThematiqueSubvention]?.icon || '📋'}{' '}
                      {THEMATIQUE_LABELS[ap.thematique as ThematiqueSubvention]?.label || ap.thematique}
                    </p>
                  )}
                  <p><strong>{t('map.year')}</strong> {ap.annee}</p>
                  {/* Localisation avec indicateur de précision */}
                  <div className="mt-2 pt-2 border-t border-slate-700/50">
                    {ap.isPrecise ? (
                      <>
                        <p className="flex items-center gap-1">
                          <span className="text-emerald-500">{MISC_ICONS.mapPinPrecise}</span>
                          <strong>{t('map.precise_location')}</strong>
                        </p>
                        {ap.adresse && (
                          <p className="text-slate-500 ml-5">{ap.adresse}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="flex items-center gap-1">
                          <span className="text-orange-400">{MISC_ICONS.mapPinApprox}</span>
                          <strong>{t('map.approx_location')}</strong>
                        </p>
                        <p className="text-slate-500 ml-5">
                          {ap.arrondissement === 0 ? t('map.centre') : `${ap.arrondissement}${t('map.district_suffix')} arr.`}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Légende points */}
      {!showChoropleth && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur rounded-lg p-3 z-[1000]">
          <h4 className="text-xs font-semibold text-slate-300 mb-2">{t('map.legend')}</h4>
          <div className="space-y-1.5 text-xs">
            {showSubventions && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-slate-400">{t('map.grants')} ({geoSubventions.length})</span>
              </div>
            )}
            {showLogements && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-slate-400">{t('map.housing')} ({logements.length})</span>
              </div>
            )}
            {showAutorisations && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-amber-400" />
                  <span className="text-slate-400">
                    {t('map.precise_investments')} ({geoAutorisations.filter(a => a.isPrecise).length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-400/50 border border-dashed border-orange-400" />
                  <span className="text-slate-400">
                    {t('map.approx')} ({geoAutorisations.filter(a => !a.isPrecise).length})
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Légende choroplèthe */}
      {showChoropleth && arrondissementStats.length > 0 && (
        <div className="absolute bottom-4 right-4 z-[1000]">
          <ChoroplethLegend metric={choroplethMetric} maxValue={maxChoroplethValue} />
        </div>
      )}
    </div>
  );
}
