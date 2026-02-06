'use client';

/**
 * Composant InvestissementsMap - Carte des investissements uniquement
 * 
 * Version simplifiée de ParisMap dédiée aux investissements
 * Affiche les projets avec différenciation précis/approximatif
 * 
 * Note: Ce composant doit être importé dynamiquement (next/dynamic)
 * car Leaflet nécessite window (SSR incompatible)
 */

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AutorisationProgramme, GeoPoint } from '@/lib/types/map';
import { formatEuroCompact } from '@/lib/formatters';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';

/**
 * Centre de Paris par défaut
 */
const PARIS_CENTER: GeoPoint = { lat: 48.8566, lon: 2.3522 };
const DEFAULT_ZOOM = 12;

/**
 * Centroïdes approximatifs des arrondissements de Paris
 * Pour placer les projets dont on connaît l'arrondissement mais pas l'adresse
 */
const ARRONDISSEMENT_CENTROIDS: Record<number, GeoPoint> = {
  0:  { lat: 48.8566, lon: 2.3470 },
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
 * Props du composant
 */
interface InvestissementsMapProps {
  projets: AutorisationProgramme[];
  isLoading?: boolean;
}

/**
 * Calcule le rayon d'un cercle en fonction du montant
 */
function getCircleRadius(montant: number): number {
  if (montant < 50000) return 5;
  if (montant < 200000) return 7;
  if (montant < 500000) return 9;
  if (montant < 1000000) return 11;
  if (montant < 5000000) return 13;
  return 15;
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
 * Composant principal de la carte des investissements
 */
export default function InvestissementsMap({
  projets,
  isLoading = false,
}: InvestissementsMapProps) {
  const [mapReady, setMapReady] = useState(false);

  /**
   * Projets avec coordonnées (précises ou centroïde)
   */
  const geoProjets = useMemo(() => {
    return projets
      .filter(p => {
        const hasPreciseCoords = p.latitude && p.longitude;
        const hasArrondissement = p.arrondissement && ARRONDISSEMENT_CENTROIDS[p.arrondissement];
        return hasPreciseCoords || hasArrondissement;
      })
      .map(p => {
        // Utiliser les coordonnées précises si disponibles
        if (p.latitude && p.longitude) {
          return {
            ...p,
            coordinates: { lat: p.latitude, lon: p.longitude },
            isPrecise: true,
          };
        }
        // Sinon, fallback sur le centroïde avec offset aléatoire
        return {
          ...p,
          coordinates: {
            lat: ARRONDISSEMENT_CENTROIDS[p.arrondissement!].lat + (Math.random() - 0.5) * 0.008,
            lon: ARRONDISSEMENT_CENTROIDS[p.arrondissement!].lon + (Math.random() - 0.5) * 0.008,
          },
          isPrecise: false,
        };
      });
  }, [projets]);

  // Stats pour la légende
  const preciseCount = geoProjets.filter(p => p.isPrecise).length;
  const approxCount = geoProjets.filter(p => !p.isPrecise).length;

  return (
    <div className="relative w-full h-full min-h-[500px]">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-[1000] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-300 text-sm">Chargement des projets...</p>
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

        {/* Marqueurs des projets */}
        {mapReady && geoProjets.map((projet, index) => {
          const themaLabel = THEMATIQUE_LABELS[projet.thematique as ThematiqueSubvention];
          
          return (
            <CircleMarker
              key={`projet-${projet.id}-${index}`}
              center={[projet.coordinates.lat, projet.coordinates.lon]}
              radius={getCircleRadius(projet.montant)}
              pathOptions={{
                color: projet.isPrecise ? '#f59e0b' : '#fb923c',
                fillColor: projet.isPrecise ? '#f59e0b' : '#fb923c',
                fillOpacity: projet.isPrecise ? 0.7 : 0.4,
                weight: projet.isPrecise ? 2 : 1,
                dashArray: projet.isPrecise ? undefined : '4,4',
              }}
            >
              <Popup maxWidth={350}>
                <div className="min-w-[280px] max-w-[320px]">
                  <h3 className="font-bold text-slate-900 mb-1 text-sm leading-tight">
                    {projet.apTexte}
                  </h3>
                  <p className="text-xl font-bold text-amber-600 mb-2">
                    {formatEuroCompact(projet.montant)}
                  </p>
                  <div className="text-xs text-slate-600 space-y-1.5">
                    <p className="leading-snug">
                      <strong>Chapitre:</strong>{' '}
                      <span className="text-slate-700">{projet.missionTexte}</span>
                    </p>
                    {projet.thematique && (
                      <p>
                        <strong>Thématique:</strong>{' '}
                        {themaLabel?.icon || '📋'}{' '}
                        {themaLabel?.label || projet.thematique}
                      </p>
                    )}
                    <p><strong>Année:</strong> {projet.annee}</p>
                    
                    {/* Localisation */}
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      {projet.isPrecise ? (
                        <>
                          <p className="flex items-center gap-1">
                            <span className="text-emerald-500">📍</span>
                            <strong>Localisation précise</strong>
                          </p>
                          {projet.adresse && (
                            <p className="text-slate-500 ml-5">{projet.adresse}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="flex items-center gap-1">
                            <span className="text-orange-400">📌</span>
                            <strong>Localisation approximative</strong>
                          </p>
                          <p className="text-slate-500 ml-5">
                            {projet.arrondissement === 0 
                              ? 'Paris Centre' 
                              : `${projet.arrondissement}ème arrondissement`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Légende */}
      <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur rounded-lg p-3 z-[1000]">
        <h4 className="text-xs font-semibold text-slate-300 mb-2">Investissements</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-amber-400" />
            <span className="text-slate-400">
              Précis ({preciseCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-400/50 border border-dashed border-orange-400" />
            <span className="text-slate-400">
              Approx. ({approxCount})
            </span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-700">
          <p className="text-[10px] text-slate-500">
            Total: {geoProjets.length} projets
          </p>
        </div>
      </div>
    </div>
  );
}
