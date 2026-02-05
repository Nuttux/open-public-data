'use client';

/**
 * Composant MapFilters - Filtres pour la carte
 * 
 * Permet de filtrer:
 * - Par année
 * - Par type de données (subventions, logements, autorisations)
 * - Par thématique (sous subventions)
 * - Mode choroplèthe (per capita par arrondissement)
 */

import { useState } from 'react';
import type { MapLayerType } from '@/lib/types/map';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';

/**
 * Configuration d'un layer de données
 */
interface LayerOption {
  id: MapLayerType;
  label: string;
  icon: string;
  color: string;
}

// Note: Subventions retirées car l'adresse du siège ne reflète pas où l'action est menée
// Voir page /subventions pour l'exploration par bénéficiaire
const LAYER_OPTIONS: LayerOption[] = [
  {
    id: 'logements',
    label: 'Logements sociaux',
    icon: '🏠',
    color: 'bg-emerald-500',
  },
  {
    id: 'autorisations',
    label: 'Investissements',
    icon: '📋',
    color: 'bg-amber-500',
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
  // Thématiques subventions
  availableThematiques: string[];
  selectedThematiques: string[];
  onThematiquesChange: (thematiques: string[]) => void;
  // Thématiques autorisations
  availableThematiquesAP?: string[];
  selectedThematiquesAP?: string[];
  onThematiquesAPChange?: (thematiques: string[]) => void;
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
    autorisations?: LayerStats;
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
  availableThematiquesAP = [],
  selectedThematiquesAP = [],
  onThematiquesAPChange,
  showChoropleth,
  onChoroplethChange,
  choroplethMetric,
  onChoroplethMetricChange,
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

  const subventionsActive = activeLayers.includes('subventions');
  const autorisationsActive = activeLayers.includes('autorisations');

  /**
   * Toggle une thématique AP
   */
  const toggleThematiqueAP = (thematique: string) => {
    if (!onThematiquesAPChange) return;
    if (selectedThematiquesAP.includes(thematique)) {
      onThematiquesAPChange(selectedThematiquesAP.filter(t => t !== thematique));
    } else {
      onThematiquesAPChange([...selectedThematiquesAP, thematique]);
    }
  };

  const toggleAllThematiquesAP = () => {
    if (!onThematiquesAPChange) return;
    if (selectedThematiquesAP.length === availableThematiquesAP.length) {
      onThematiquesAPChange([]);
    } else {
      onThematiquesAPChange([...availableThematiquesAP]);
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
                  const layerStats = layer.id === 'subventions' 
                    ? stats?.subventions 
                    : layer.id === 'logements' 
                      ? stats?.logements 
                      : stats?.autorisations;
                  
                  return (
                    <div key={layer.id}>
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
                              ) : layer.id === 'autorisations' && layerStats.geolocated !== undefined ? (
                                <>{layerStats.geolocated} / {layerStats.count} localisés</>
                              ) : (
                                <>{layerStats.count.toLocaleString('fr-FR')} programmes</>
                              )}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Thématiques nested sous Subventions */}
                      {layer.id === 'subventions' && isActive && availableThematiques.length > 0 && (
                        <div className="ml-4 mt-2 pl-3 border-l-2 border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-400">Par thématique</span>
                            <button
                              onClick={toggleAllThematiques}
                              className="text-xs text-purple-400 hover:text-purple-300"
                            >
                              {selectedThematiques.length === availableThematiques.length ? 'Aucun' : 'Tous'}
                            </button>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                            {availableThematiques.map((thematique) => {
                              const info = THEMATIQUE_LABELS[thematique as ThematiqueSubvention];
                              const isSelected = selectedThematiques.includes(thematique);
                              
                              return (
                                <button
                                  key={thematique}
                                  onClick={() => toggleThematique(thematique)}
                                  className={`
                                    w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left
                                    ${isSelected ? 'bg-purple-500/20 text-slate-200' : 'text-slate-400 hover:bg-slate-700/30'}
                                  `}
                                >
                                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[8px] ${
                                    isSelected ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-500'
                                  }`}>
                                    {isSelected && '✓'}
                                  </span>
                                  <span>{info?.icon || '📋'}</span>
                                  <span className="truncate">{info?.label || thematique}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Thématiques nested sous Autorisations */}
                      {layer.id === 'autorisations' && isActive && availableThematiquesAP.length > 0 && onThematiquesAPChange && (
                        <div className="ml-4 mt-2 pl-3 border-l-2 border-amber-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-400">Par thématique</span>
                            <button
                              onClick={toggleAllThematiquesAP}
                              className="text-xs text-amber-400 hover:text-amber-300"
                            >
                              {selectedThematiquesAP.length === availableThematiquesAP.length ? 'Aucun' : 'Tous'}
                            </button>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                            {availableThematiquesAP.map((thematique) => {
                              const info = THEMATIQUE_LABELS[thematique as ThematiqueSubvention];
                              const isSelected = selectedThematiquesAP.includes(thematique);
                              
                              return (
                                <button
                                  key={thematique}
                                  onClick={() => toggleThematiqueAP(thematique)}
                                  className={`
                                    w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left
                                    ${isSelected ? 'bg-amber-500/20 text-slate-200' : 'text-slate-400 hover:bg-slate-700/30'}
                                  `}
                                >
                                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[8px] ${
                                    isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-500'
                                  }`}>
                                    {isSelected && '✓'}
                                  </span>
                                  <span>{info?.icon || '📋'}</span>
                                  <span className="truncate">{info?.label || thematique}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats rapides */}
          {stats && !showChoropleth && (
            <div className="pt-3 border-t border-slate-700/50">
              <div className="text-xs text-slate-500 space-y-1">
                {subventionsActive && stats.subventions && (
                  <p>
                    💰 Total:{' '}
                    <span className="text-purple-400 font-medium">
                      {(stats.subventions.total / 1_000_000).toFixed(1).replace('.', ',')} M€
                    </span>
                  </p>
                )}
                {activeLayers.includes('logements') && stats.logements && (
                  <p>
                    🏠 Logements:{' '}
                    <span className="text-emerald-400 font-medium">
                      {stats.logements.total.toLocaleString('fr-FR')}
                    </span>
                  </p>
                )}
                {autorisationsActive && stats.autorisations && (
                  <p>
                    📋 Invest.:{' '}
                    <span className="text-amber-400 font-medium">
                      {(stats.autorisations.total / 1_000_000).toFixed(1).replace('.', ',')} M€
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
