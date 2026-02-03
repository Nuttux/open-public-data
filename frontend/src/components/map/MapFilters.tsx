'use client';

/**
 * Composant MapFilters - Filtres pour la carte
 * 
 * Permet de filtrer:
 * - Par année
 * - Par type de données (subventions, logements, autorisations)
 * - Par thématique (culture, sport, social, etc.)
 * - Mode choroplèthe (per capita par arrondissement)
 */

import { useState } from 'react';
import type { MapLayerType } from '@/lib/types/map';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import { DATA_SOURCES } from '@/lib/constants/arrondissements';

/**
 * Configuration d'un layer de données
 */
interface LayerOption {
  id: MapLayerType;
  label: string;
  icon: string;
  color: string;
  description: string;
  sourceUrl: string;
}

const LAYER_OPTIONS: LayerOption[] = [
  {
    id: 'subventions',
    label: 'Subventions',
    icon: '💰',
    color: 'bg-purple-500',
    description: 'Subventions aux associations',
    sourceUrl: DATA_SOURCES.subventions.url,
  },
  {
    id: 'logements',
    label: 'Logements sociaux',
    icon: '🏠',
    color: 'bg-emerald-500',
    description: 'Programmes de logements sociaux',
    sourceUrl: DATA_SOURCES.logementsSociaux.url,
  },
];

/**
 * Stats pour un layer
 */
interface LayerStats {
  count: number;
  total: number;
  geolocated?: number;
}

interface MapFiltersProps {
  availableYears: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  activeLayers: MapLayerType[];
  onLayersChange: (layers: MapLayerType[]) => void;
  // Thématiques
  availableThematiques: string[];
  selectedThematiques: string[];
  onThematiquesChange: (thematiques: string[]) => void;
  // Choroplèthe
  showChoropleth: boolean;
  onChoroplethChange: (show: boolean) => void;
  choroplethMetric: 'subventions' | 'logements' | 'investissements';
  onChoroplethMetricChange: (metric: 'subventions' | 'logements' | 'investissements') => void;
  // État
  isLoading?: boolean;
  stats?: {
    subventions: LayerStats;
    logements: LayerStats;
  };
}

export default function MapFilters({
  availableYears,
  selectedYear,
  onYearChange,
  activeLayers,
  onLayersChange,
  availableThematiques,
  selectedThematiques,
  onThematiquesChange,
  showChoropleth,
  onChoroplethChange,
  choroplethMetric,
  onChoroplethMetricChange,
  isLoading = false,
  stats,
}: MapFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showThematiques, setShowThematiques] = useState(false);

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

  /**
   * Toggle une thématique
   */
  const toggleThematique = (thematique: string) => {
    if (selectedThematiques.includes(thematique)) {
      onThematiquesChange(selectedThematiques.filter(t => t !== thematique));
    } else {
      onThematiquesChange([...selectedThematiques, thematique]);
    }
  };

  /**
   * Sélectionner/désélectionner toutes les thématiques
   */
  const toggleAllThematiques = () => {
    if (selectedThematiques.length === availableThematiques.length) {
      onThematiquesChange([]);
    } else {
      onThematiquesChange([...availableThematiques]);
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

          {/* Mode d'affichage */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Mode d&apos;affichage
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => onChoroplethChange(false)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                  !showChoropleth
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                📍 Points
              </button>
              <button
                onClick={() => onChoroplethChange(true)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                  showChoropleth
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🗺️ Par arrdt
              </button>
            </div>
          </div>

          {/* Métrique choroplèthe */}
          {showChoropleth && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Métrique (par habitant)
              </label>
              <select
                value={choroplethMetric}
                onChange={(e) => onChoroplethMetricChange(e.target.value as 'subventions' | 'logements' | 'investissements')}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="subventions">💰 Subventions / hab</option>
                <option value="logements">🏠 Logements / 1000 hab</option>
                <option value="investissements">📋 Investissements / hab</option>
              </select>
            </div>
          )}

          {/* Layers toggle (mode points uniquement) */}
          {!showChoropleth && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Données affichées
              </label>
              <div className="space-y-2">
                {LAYER_OPTIONS.map((layer) => {
                  const isActive = activeLayers.includes(layer.id);
                  const layerStats = layer.id === 'subventions' ? stats?.subventions : stats?.logements;
                  
                  return (
                    <div key={layer.id} className="space-y-1">
                      <button
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
                          {layerStats && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {layer.id === 'subventions' && layerStats.geolocated !== undefined ? (
                                <>{layerStats.geolocated} / {layerStats.count} géolocalisés</>
                              ) : (
                                <>{layerStats.count} programmes</>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                      {/* Lien source */}
                      <a
                        href={layer.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-purple-400 hover:text-purple-300 pl-10"
                      >
                        📎 Voir la source
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtres par thématique */}
          {!showChoropleth && activeLayers.includes('subventions') && availableThematiques.length > 0 && (
            <div>
              <button
                onClick={() => setShowThematiques(!showThematiques)}
                className="w-full flex items-center justify-between text-xs font-medium text-slate-400 mb-2"
              >
                <span>Filtrer par thématique</span>
                <span className={`transition-transform ${showThematiques ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {showThematiques && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <button
                    onClick={toggleAllThematiques}
                    className="w-full text-left px-2 py-1 text-xs text-purple-400 hover:text-purple-300"
                  >
                    {selectedThematiques.length === availableThematiques.length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'}
                  </button>
                  {availableThematiques.map((thematique) => {
                    const info = THEMATIQUE_LABELS[thematique as ThematiqueSubvention];
                    const isSelected = selectedThematiques.includes(thematique);
                    
                    return (
                      <button
                        key={thematique}
                        onClick={() => toggleThematique(thematique)}
                        className={`
                          w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs
                          ${isSelected ? 'bg-slate-700/50 text-slate-200' : 'text-slate-400 hover:bg-slate-700/30'}
                        `}
                      >
                        <span className={`w-3 h-3 rounded border ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-500'}`}>
                          {isSelected && <span className="text-white text-[8px] flex items-center justify-center">✓</span>}
                        </span>
                        <span>{info?.icon || '📋'}</span>
                        <span>{info?.label || thematique}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Stats rapides */}
          {stats && (
            <div className="pt-3 border-t border-slate-700/50">
              <div className="text-xs text-slate-500 space-y-1">
                {activeLayers.includes('subventions') && stats.subventions && (
                  <p>
                    💰 Total subventions:{' '}
                    <span className="text-purple-400 font-medium">
                      {(stats.subventions.total / 1_000_000).toFixed(1)} M€
                    </span>
                  </p>
                )}
                {activeLayers.includes('logements') && stats.logements && (
                  <p>
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
