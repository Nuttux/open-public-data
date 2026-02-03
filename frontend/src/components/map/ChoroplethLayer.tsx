'use client';

/**
 * Composant ChoroplethLayer - Carte choroplèthe des arrondissements
 * 
 * Affiche les arrondissements de Paris colorés selon une métrique:
 * - Total des subventions
 * - Nombre de logements sociaux
 * - Investissements
 * 
 * Les polygones sont récupérés depuis l'API Paris OpenData
 */

import { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PathOptions, Layer } from 'leaflet';
import type { ArrondissementStats } from '@/lib/types/map';
import { formatEuroCompact } from '@/lib/formatters';

/**
 * Type de métrique pour la coloration
 */
export type ChoroplethMetric = 'subventions' | 'logements' | 'investissements';

/**
 * Props du composant
 */
interface ChoroplethLayerProps {
  stats: ArrondissementStats[];
  metric: ChoroplethMetric;
  opacity?: number;
  onArrondissementClick?: (code: number) => void;
}

/**
 * Palette de couleurs pour la choroplèthe (du plus clair au plus foncé)
 */
const COLOR_SCALES: Record<ChoroplethMetric, string[]> = {
  subventions: ['#f3e8ff', '#d8b4fe', '#a855f7', '#7c3aed', '#5b21b6'],
  logements: ['#d1fae5', '#6ee7b7', '#10b981', '#059669', '#047857'],
  investissements: ['#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#b45309'],
};

/**
 * Calcule la couleur en fonction de la valeur et des seuils
 */
function getColor(value: number, max: number, scale: string[]): string {
  if (max === 0) return scale[0];
  const ratio = value / max;
  const index = Math.min(Math.floor(ratio * scale.length), scale.length - 1);
  return scale[index];
}

/**
 * Chemin vers le fichier GeoJSON statique des arrondissements
 */
const ARRONDISSEMENTS_GEOJSON_PATH = '/data/map/arrondissements.geojson';

export default function ChoroplethLayer({
  stats,
  metric,
  opacity = 0.7,
  onArrondissementClick,
}: ChoroplethLayerProps) {
  const map = useMap();
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Charger les polygones des arrondissements depuis le fichier statique
   */
  useEffect(() => {
    async function loadGeoJSON() {
      try {
        const response = await fetch(ARRONDISSEMENTS_GEOJSON_PATH);
        if (!response.ok) throw new Error('Failed to load arrondissements GeoJSON');
        const data = await response.json();
        setGeoData(data);
      } catch (error) {
        console.error('Error loading arrondissements GeoJSON:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadGeoJSON();
  }, []);

  /**
   * Calcule la valeur max pour la normalisation des couleurs
   */
  const maxValue = stats.reduce((max, s) => {
    const value = metric === 'subventions' 
      ? s.totalSubventions 
      : metric === 'logements' 
        ? s.totalLogements 
        : s.totalInvestissement;
    return Math.max(max, value);
  }, 0);

  /**
   * Récupère les stats d'un arrondissement par son code
   */
  const getStatsForArrondissement = (code: number): ArrondissementStats | undefined => {
    return stats.find(s => s.code === code);
  };

  /**
   * Style d'un polygone selon les stats
   */
  const style = (feature: Feature<Geometry, { c_ar: number }> | undefined): PathOptions => {
    if (!feature) return {};
    
    const code = feature.properties?.c_ar;
    const arrStats = getStatsForArrondissement(code);
    
    const value = arrStats 
      ? (metric === 'subventions' 
          ? arrStats.totalSubventions 
          : metric === 'logements' 
            ? arrStats.totalLogements 
            : arrStats.totalInvestissement)
      : 0;

    return {
      fillColor: getColor(value, maxValue, COLOR_SCALES[metric]),
      weight: 2,
      opacity: 1,
      color: '#334155',
      fillOpacity: opacity,
    };
  };

  /**
   * Gestion des événements sur chaque feature
   */
  const onEachFeature = (
    feature: Feature<Geometry, { c_ar: number; l_ar: string }>,
    layer: Layer
  ) => {
    const code = feature.properties?.c_ar;
    const nom = feature.properties?.l_ar || `${code}ème`;
    const arrStats = getStatsForArrondissement(code);

    // Popup avec les stats
    const popupContent = `
      <div style="min-width: 180px; padding: 8px;">
        <h3 style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">${nom}</h3>
        ${arrStats ? `
          <div style="font-size: 12px; color: #64748b;">
            <p><strong>Subventions:</strong> ${formatEuroCompact(arrStats.totalSubventions)}</p>
            <p><strong>Logements:</strong> ${arrStats.totalLogements.toLocaleString('fr-FR')}</p>
            <p><strong>Nb programmes:</strong> ${arrStats.nbProgrammesLogement}</p>
          </div>
        ` : '<p style="color: #94a3b8; font-size: 12px;">Pas de données</p>'}
      </div>
    `;
    
    layer.bindPopup(popupContent);

    // Événements hover
    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 3,
          color: '#f59e0b',
          fillOpacity: 0.9,
        });
        target.bringToFront();
      },
      mouseout: (e) => {
        const target = e.target;
        target.setStyle(style(feature));
      },
      click: () => {
        onArrondissementClick?.(code);
      },
    });
  };

  if (isLoading || !geoData) {
    return null;
  }

  return (
    <GeoJSON
      data={geoData}
      style={style as (feature: Feature<Geometry, unknown> | undefined) => PathOptions}
      onEachFeature={onEachFeature as (feature: Feature<Geometry, unknown>, layer: Layer) => void}
    />
  );
}

/**
 * Composant Légende pour la choroplèthe
 */
export function ChoroplethLegend({ 
  metric, 
  maxValue 
}: { 
  metric: ChoroplethMetric; 
  maxValue: number;
}) {
  const scale = COLOR_SCALES[metric];
  const labels = ['0', formatEuroCompact(maxValue * 0.25), formatEuroCompact(maxValue * 0.5), formatEuroCompact(maxValue * 0.75), formatEuroCompact(maxValue)];
  
  const metricLabels: Record<ChoroplethMetric, string> = {
    subventions: 'Total subventions',
    logements: 'Nb logements',
    investissements: 'Investissements',
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur rounded-lg p-3">
      <h4 className="text-xs font-semibold text-slate-300 mb-2">
        {metricLabels[metric]}
      </h4>
      <div className="flex items-center gap-1">
        {scale.map((color, i) => (
          <div key={i} className="flex flex-col items-center">
            <div 
              className="w-6 h-4 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-slate-500 mt-1">
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
