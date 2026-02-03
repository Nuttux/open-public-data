'use client';

/**
 * Composant MapFilters - Filtres pour la carte
 * 
 * Permet de filtrer:
 * - Par année
 * - Par type de données (subventions, logements)
 * - Par montant
 * - Par direction (pour subventions)
 */

import { useState, useMemo } from 'react';
import type { MapLayerType } from '@/lib/types/map';

/**
 * Configuration d'un layer de données
 */
interface LayerOption {
  id: MapLayerType;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const LAYER_OPTIONS: LayerOption[] = [
  {
    id: 'subventions',
    label: 'Subventions',
    icon: '💰',
    color: 'bg-purple-500',
    description: 'Subventions aux associations',
  },
  {
    id: 'logements',
    label: 'Logements sociaux',
    icon: '🏠',
    color: 'bg-emerald-500',
    description: 'Programmes de logements sociaux',
  },
  {
    id: 'choropleth-subventions',
    label: 'Carte arrondissements',
    icon: '🗺️',
    color: 'bg-amber-500',
    description: 'Totaux par arrondissement',
  },
];

/**
 * Stats par type de layer
 */
interface SubventionStats {
  count: number;
  total: number;
  geolocated: number;
}

interface LogementStats {
  count: number;
  total: number;
}

interface MapFiltersProps {
  availableYears: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  activeLayers: MapLayerType[];
  onLayersChange: (layers: MapLayerType[]) => void;
  isLoading?: boolean;
  stats?: {
    subventions: SubventionStats;
    logements: LogementStats;
  };
}

export default function MapFilters({
  availableYears,
  selectedYear,
  onYearChange,
  activeLayers,
  onLayersChange,
  isLoading = false,
  stats,
}: MapFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  /**
   * Toggle un layer
   */
  const toggleLayer = (layerId: MapLayerType) => {
    if (activeLayers.includes(layerId)) {
      onLayersChange(activeLayers.filter(l => l !== layerId));
    } else {
      onLayersChange([...activeLayers, layerId]);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <span className="font-semibold text-slate-200">Filtres</span>
        </div>
        <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Sélecteur d'année */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Année
            </label>
            <select
              value={selectedYear}
              onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
              disabled={isLoading}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Layers toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Données affichées
            </label>
            <div className="space-y-2">
              {LAYER_OPTIONS.map((layer) => {
                const isActive = activeLayers.includes(layer.id);
                const isSubventions = layer.id === 'subventions';
                const subStats = stats?.subventions;
                const logStats = stats?.logements;
                
                return (
                  <button
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    disabled={isLoading}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm
                      transition-all duration-200 disabled:opacity-50
                      ${isActive 
                        ? 'bg-slate-700/50 border border-slate-600' 
                        : 'bg-slate-900/30 border border-transparent hover:bg-slate-700/30'
                      }
                    `}
                  >
                    <div className={`w-4 h-4 rounded ${layer.color} flex items-center justify-center`}>
                      {isActive && <span className="text-white text-xs">✓</span>}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span>{layer.icon}</span>
                        <span className={isActive ? 'text-slate-200' : 'text-slate-400'}>
                          {layer.label}
                        </span>
                      </div>
                      {isSubventions && subStats && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {subStats.geolocated || 0} / {subStats.count || 0} géolocalisés
                        </div>
                      )}
                      {!isSubventions && logStats && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {logStats.count || 0} programmes
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats rapides */}
          {stats && (
            <div className="pt-3 border-t border-slate-700/50">
              <div className="text-xs text-slate-500">
                {activeLayers.includes('subventions') && stats.subventions && (
                  <p>
                    💰 Total subventions:{' '}
                    <span className="text-purple-400 font-medium">
                      {(stats.subventions.total / 1_000_000).toFixed(1)} M€
                    </span>
                  </p>
                )}
                {activeLayers.includes('logements') && stats.logements && (
                  <p className="mt-1">
                    🏠 Total logements:{' '}
                    <span className="text-emerald-400 font-medium">
                      {stats.logements.total.toLocaleString('fr-FR')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
