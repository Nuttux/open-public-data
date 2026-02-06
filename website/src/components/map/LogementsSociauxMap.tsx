'use client';

/**
 * Composant LogementsSociauxMap - Carte dédiée aux logements sociaux
 * 
 * Version simplifiée de ParisMap avec:
 * - Points: programmes de logements sociaux (taille = nb logements)
 * - Choroplèthe: logements per capita par arrondissement
 * - Mise en évidence du bailleur sélectionné
 * 
 * Note: Ce composant doit être importé dynamiquement (next/dynamic)
 */

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LogementSocial, GeoPoint, ArrondissementStats } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';
import ChoroplethLayer, { ChoroplethLegend } from './ChoroplethLayer';

/**
 * Centre de Paris par défaut
 */
const PARIS_CENTER: GeoPoint = { lat: 48.8566, lon: 2.3522 };
const DEFAULT_ZOOM = 12;

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
interface LogementsSociauxMapProps {
  logements: LogementSocial[];
  arrondissementStats?: ArrondissementStats[];
  showChoropleth?: boolean;
  isLoading?: boolean;
  selectedBailleur?: string | null;
}

/**
 * Calcule le rayon d'un cercle en fonction du nombre de logements
 */
function getCircleRadius(nbLogements: number): number {
  if (nbLogements < 10) return 4;
  if (nbLogements < 30) return 6;
  if (nbLogements < 50) return 8;
  if (nbLogements < 100) return 10;
  if (nbLogements < 200) return 12;
  if (nbLogements < 500) return 14;
  return 16;
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
 * Composant principal de la carte des logements sociaux
 */
export default function LogementsSociauxMap({
  logements,
  arrondissementStats = [],
  showChoropleth = false,
  isLoading = false,
  selectedBailleur = null,
}: LogementsSociauxMapProps) {
  const [mapReady, setMapReady] = useState(false);

  // Max pour la légende choroplèthe
  const maxChoroplethValue = useMemo(() => {
    return arrondissementStats.reduce((max, s) => {
      return Math.max(max, s.logementsPerCapita || 0);
    }, 0);
  }, [arrondissementStats]);

  // Stats pour la légende
  const totalLogements = logements.reduce((sum, l) => sum + l.nbLogements, 0);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-[1000] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-300 text-sm">Chargement des logements...</p>
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

        {/* Layer Choroplèthe */}
        {showChoropleth && mapReady && arrondissementStats.length > 0 && (
          <ChoroplethLayer
            stats={arrondissementStats}
            metric="logements"
          />
        )}

        {/* Layer Points (quand pas en choroplèthe) */}
        {!showChoropleth && mapReady && logements.map((log, index) => {
          const isHighlighted = selectedBailleur ? log.bailleur === selectedBailleur : true;
          const opacity = selectedBailleur ? (isHighlighted ? 0.8 : 0.2) : 0.6;
          
          return (
            <CircleMarker
              key={`log-${log.id}-${index}`}
              center={[log.coordinates.lat, log.coordinates.lon]}
              radius={getCircleRadius(log.nbLogements)}
              pathOptions={{
                color: isHighlighted ? '#10b981' : '#475569',
                fillColor: isHighlighted ? '#10b981' : '#475569',
                fillOpacity: opacity,
                weight: isHighlighted ? 2 : 1,
              }}
            >
              <Popup>
                <div className="min-w-[220px]">
                  <h3 className="font-bold text-slate-900 mb-1 text-sm">{log.adresse}</h3>
                  <p className="text-2xl font-bold text-emerald-600 mb-2">
                    {log.nbLogements} logements
                  </p>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p><strong>Bailleur:</strong> {log.bailleur || '(non renseigné)'}</p>
                    <p><strong>Type:</strong> {log.natureProgramme}</p>
                    <p><strong>Mode:</strong> {log.modeRealisation}</p>
                    <p><strong>Année:</strong> {log.annee}</p>
                    <p><strong>Arrondissement:</strong> {log.arrondissement === 0 ? 'Centre' : `${log.arrondissement}ème`}</p>
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <p className="text-blue-600">PLAI (très social): {log.nbPLAI}</p>
                      <p className="text-cyan-600">PLUS (social): {log.nbPLUS}</p>
                      <p className="text-violet-600">PLS (intermédiaire): {log.nbPLS}</p>
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Légende points */}
      {!showChoropleth && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur rounded-lg p-3 z-[1000]">
          <h4 className="text-xs font-semibold text-slate-300 mb-2">Logements sociaux</h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-400">
                {formatNumber(logements.length)} programmes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
              <span className="text-slate-500 text-[10px]">
                Taille = nb logements
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-[10px] text-slate-500">
              Total: {formatNumber(totalLogements)} logements
            </p>
          </div>
        </div>
      )}

      {/* Légende choroplèthe */}
      {showChoropleth && arrondissementStats.length > 0 && (
        <div className="absolute bottom-4 right-4 z-[1000]">
          <ChoroplethLegend metric="logements" maxValue={maxChoroplethValue} />
        </div>
      )}
    </div>
  );
}
