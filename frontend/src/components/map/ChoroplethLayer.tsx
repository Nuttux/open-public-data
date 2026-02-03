'use client';

/**
 * Composant ChoroplethLayer - Carte choroplèthe des arrondissements
 * 
 * Affiche les arrondissements de Paris colorés selon une métrique per capita:
 * - Subventions par habitant
 * - Logements pour 1000 habitants
 * - Investissements par habitant
 * 
 * Source données: /data/map/arrondissements.geojson (Paris OpenData)
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PathOptions, Layer } from 'leaflet';
import type { ArrondissementStats } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';

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
   * Map des stats par code d'arrondissement pour accès rapide
   */
  const statsMap = useMemo(() => {
    const map = new Map<number, ArrondissementStats>();
    stats.forEach(s => map.set(s.code, s));
    return map;
  }, [stats]);

  /**
   * Calcule la valeur max per capita pour la normalisation des couleurs
   */
  const maxValue = useMemo(() => {
    return stats.reduce((max, s) => {
      const value = metric === 'subventions' 
        ? (s.subventionsPerCapita || 0)
        : metric === 'logements' 
          ? (s.logementsPerCapita || 0)
          : (s.investissementPerCapita || 0);
      return Math.max(max, value);
    }, 0);
  }, [stats, metric]);

  /**
   * Génère le style pour une feature
   */
  const getFeatureStyle = useCallback((code: number): PathOptions => {
    const arrStats = statsMap.get(code);
    
    // Utiliser les valeurs per capita pour la coloration
    const value = arrStats 
      ? (metric === 'subventions' 
          ? (arrStats.subventionsPerCapita || 0)
          : metric === 'logements' 
            ? (arrStats.logementsPerCapita || 0)
            : (arrStats.investissementPerCapita || 0))
      : 0;

    return {
      fillColor: getColor(value, maxValue, COLOR_SCALES[metric]),
      weight: 2,
      opacity: 1,
      color: '#334155',
      fillOpacity: opacity,
    };
  }, [statsMap, metric, maxValue, opacity]);

  /**
   * Style d'un polygone
   */
  const style = useCallback((feature: Feature<Geometry, { c_ar: number }> | undefined): PathOptions => {
    if (!feature) return {};
    const code = feature.properties?.c_ar;
    return getFeatureStyle(code);
  }, [getFeatureStyle]);

  /**
   * Gestion des événements sur chaque feature
   */
  const onEachFeature = useCallback((
    feature: Feature<Geometry, { c_ar: number; l_ar: string }>,
    layer: Layer
  ) => {
    const code = feature.properties?.c_ar;
    const nom = feature.properties?.l_ar || `${code}ème`;
    const arrStats = statsMap.get(code);

    // Popup avec les stats incluant population et per capita
    const population = arrStats?.population || 0;
    const popupContent = `
      <div style="min-width: 220px; padding: 8px; font-family: system-ui, sans-serif;">
        <h3 style="font-weight: bold; margin-bottom: 4px; font-size: 14px; color: #f1f5f9;">${nom}</h3>
        <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">Population: ${formatNumber(population)} hab.</p>
        ${arrStats ? `
          <div style="font-size: 12px; color: #e2e8f0; border-top: 1px solid #475569; padding-top: 8px;">
            <p style="margin-bottom: 6px;">
              <strong style="color: #a855f7;">💰 Subventions:</strong> ${formatEuroCompact(arrStats.totalSubventions || 0)}
              <br/><span style="color: #94a3b8; font-size: 11px;">${formatNumber(arrStats.subventionsPerCapita || 0)} €/hab</span>
            </p>
            <p style="margin-bottom: 6px;">
              <strong style="color: #10b981;">🏠 Logements:</strong> ${formatNumber(arrStats.totalLogements || 0)}
              <br/><span style="color: #94a3b8; font-size: 11px;">${(arrStats.logementsPerCapita || 0).toFixed(1)} / 1000 hab</span>
            </p>
            <p>
              <strong style="color: #f59e0b;">📋 Investissements:</strong> ${formatEuroCompact(arrStats.totalInvestissement || 0)}
              <br/><span style="color: #94a3b8; font-size: 11px;">${formatNumber(arrStats.investissementPerCapita || 0)} €/hab</span>
            </p>
          </div>
        ` : '<p style="color: #94a3b8; font-size: 12px;">Pas de données</p>'}
      </div>
    `;
    
    layer.bindPopup(popupContent, {
      className: 'custom-popup',
      maxWidth: 300,
    });

    // Style par défaut pour cet arrondissement
    const defaultStyle = getFeatureStyle(code);

    // Événements hover - utiliser le style par défaut sauvegardé
    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 3,
          color: '#fbbf24',
          fillOpacity: 0.85,
        });
        target.bringToFront();
      },
      mouseout: (e) => {
        const target = e.target;
        // Restaurer le style par défaut
        target.setStyle(defaultStyle);
      },
      click: () => {
        onArrondissementClick?.(code);
      },
    });
  }, [statsMap, getFeatureStyle, onArrondissementClick]);

  if (isLoading || !geoData) {
    return null;
  }

  // Clé unique pour forcer le re-render quand metric ou stats changent
  const geoJsonKey = `choropleth-${metric}-${stats.length}-${maxValue}`;

  return (
    <GeoJSON
      key={geoJsonKey}
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
  
  // Formater les labels selon la métrique avec des unités lisibles
  const formatLabel = (value: number) => {
    if (metric === 'logements') {
      if (value >= 100) return `${Math.round(value)}`;
      return value.toFixed(1);
    }
    // Pour subventions et investissements (€/hab)
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k€`;
    }
    return `${Math.round(value)}€`;
  };
  
  const labels = [
    '0',
    formatLabel(maxValue * 0.25),
    formatLabel(maxValue * 0.5),
    formatLabel(maxValue * 0.75),
    formatLabel(maxValue),
  ];
  
  const metricLabels: Record<ChoroplethMetric, string> = {
    subventions: '€ / habitant',
    logements: '/ 1000 hab',
    investissements: '€ / habitant',
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
