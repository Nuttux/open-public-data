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

/**
 * Centre de Paris par défaut
 */
const PARIS_CENTER: GeoPoint = { lat: 48.8566, lon: 2.3522 };
const DEFAULT_ZOOM = 12;

/**
 * Centroïdes approximatifs des arrondissements de Paris
 * Pour placer les autorisations de programmes dont on connaît l'arrondissement
 */
const ARRONDISSEMENT_CENTROIDS: Record<number, GeoPoint> = {
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
 */
function getCircleRadius(montant: number, type: 'subvention' | 'logement' | 'autorisation'): number {
  if (type === 'logement') {
    return Math.max(5, Math.min(30, Math.sqrt(montant) * 2));
  }
  if (type === 'autorisation') {
    // Autorisations: montants plus grands
    if (montant < 100000) return 5;
    if (montant < 500000) return 8;
    if (montant < 1000000) return 12;
    if (montant < 5000000) return 16;
    return 20;
  }
  // Pour subventions
  if (montant < 5000) return 5;
  if (montant < 20000) return 8;
  if (montant < 50000) return 12;
  if (montant < 100000) return 16;
  if (montant < 500000) return 22;
  return 30;
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
  const [mapReady, setMapReady] = useState(false);

  // Les subventions avec coordonnées
  const geoSubventions = subventions.filter(s => s.coordinates);
  
  // Les autorisations avec arrondissement connu
  const geoAutorisations = useMemo(() => {
    return autorisations
      .filter(a => a.arrondissement && ARRONDISSEMENT_CENTROIDS[a.arrondissement])
      .map(a => ({
        ...a,
        // Ajouter un petit offset aléatoire pour éviter que tous les points se superposent
        coordinates: {
          lat: ARRONDISSEMENT_CENTROIDS[a.arrondissement!].lat + (Math.random() - 0.5) * 0.008,
          lon: ARRONDISSEMENT_CENTROIDS[a.arrondissement!].lon + (Math.random() - 0.5) * 0.008,
        },
      }));
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
            <p className="text-slate-300 text-sm">Chargement des données...</p>
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
        {showSubventions && mapReady && geoSubventions.map((sub) => (
          <CircleMarker
            key={`sub-${sub.id}`}
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
                <h3 className="font-bold text-slate-900 mb-1">{sub.beneficiaire}</h3>
                <p className="text-2xl font-bold text-purple-600 mb-2">
                  {formatEuroCompact(sub.montant)}
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <strong>Direction:</strong>{' '}
                    <span title={sub.direction}>{getDirectionName(sub.direction)}</span>
                  </p>
                  {sub.thematique && (
                    <p>
                      <strong>Thématique:</strong>{' '}
                      {THEMATIQUE_LABELS[sub.thematique as ThematiqueSubvention]?.icon || '📋'}{' '}
                      {THEMATIQUE_LABELS[sub.thematique as ThematiqueSubvention]?.label || sub.thematique}
                    </p>
                  )}
                  <p><strong>Nature:</strong> {sub.nature}</p>
                  <p><strong>Objet:</strong> {sub.objet}</p>
                  {sub.adresse && <p><strong>Adresse:</strong> {sub.adresse}</p>}
                  <p><strong>Année:</strong> {sub.annee}</p>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Layer Logements Sociaux */}
        {showLogements && mapReady && logements.map((log) => (
          <CircleMarker
            key={`log-${log.id}`}
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
                <h3 className="font-bold text-slate-900 mb-1">{log.adresse}</h3>
                <p className="text-2xl font-bold text-emerald-600 mb-2">
                  {log.nbLogements} logements
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <p><strong>Bailleur:</strong> {log.bailleur}</p>
                  <p><strong>Type:</strong> {log.natureProgramme}</p>
                  <p><strong>Mode:</strong> {log.modeRealisation}</p>
                  <p><strong>Année:</strong> {log.annee}</p>
                  <p><strong>Arrondissement:</strong> {log.arrondissement}ème</p>
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <p>PLAI (très social): {log.nbPLAI}</p>
                    <p>PLUS (social): {log.nbPLUS}</p>
                    <p>PLS (intermédiaire): {log.nbPLS}</p>
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Layer Autorisations de programmes */}
        {showAutorisations && mapReady && geoAutorisations.map((ap) => (
          <CircleMarker
            key={`ap-${ap.id}`}
            center={[ap.coordinates.lat, ap.coordinates.lon]}
            radius={getCircleRadius(ap.montant, 'autorisation')}
            pathOptions={{
              color: '#f59e0b',
              fillColor: '#f59e0b',
              fillOpacity: 0.5,
              weight: 1,
            }}
          >
            <Popup>
              <div className="min-w-[220px]">
                <h3 className="font-bold text-slate-900 mb-1 text-sm leading-tight">{ap.apTexte}</h3>
                <p className="text-xl font-bold text-amber-600 mb-2">
                  {formatEuroCompact(ap.montant)}
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <p><strong>Mission:</strong> {ap.missionTexte}</p>
                  {ap.thematique && (
                    <p>
                      <strong>Thématique:</strong>{' '}
                      {THEMATIQUE_LABELS[ap.thematique as ThematiqueSubvention]?.icon || '📋'}{' '}
                      {THEMATIQUE_LABELS[ap.thematique as ThematiqueSubvention]?.label || ap.thematique}
                    </p>
                  )}
                  <p><strong>Direction:</strong> {ap.directionTexte}</p>
                  <p><strong>Année:</strong> {ap.annee}</p>
                  <p><strong>Arrondissement:</strong> {ap.arrondissement}ème</p>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Légende points */}
      {!showChoropleth && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur rounded-lg p-3 z-[1000]">
          <h4 className="text-xs font-semibold text-slate-300 mb-2">Légende</h4>
          <div className="space-y-1.5 text-xs">
            {showSubventions && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-slate-400">Subventions ({geoSubventions.length})</span>
              </div>
            )}
            {showLogements && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-slate-400">Logements ({logements.length})</span>
              </div>
            )}
            {showAutorisations && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-slate-400">Investissements ({geoAutorisations.length})</span>
              </div>
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
