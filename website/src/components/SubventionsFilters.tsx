'use client';

/**
 * SubventionsFilters - Panneau de filtres pour les subventions
 * 
 * Permet de filtrer par:
 * - Type d'organisme (association, public, entreprise, etc.)
 * - Direction (DAC, DASES, DJS, etc.)
 * - Montant minimum
 * - Recherche textuelle
 */

import { useState, useCallback, useMemo } from 'react';
import { useTrack } from '@/lib/analyticsContext';
import { useT, useTCategory } from '@/lib/localeContext';

/**
 * État des filtres
 */
export interface SubventionFilters {
  /** Recherche textuelle sur le nom du bénéficiaire */
  search: string;
  /** Types d'organismes sélectionnés */
  typesOrganisme: string[];
  /** Directions sélectionnées */
  directions: string[];
  /** Thématique sélectionnée (depuis treemap) */
  thematique: string | null;
  /** Montant minimum */
  montantMin: number;
  /** Montant maximum (0 = pas de max) */
  montantMax: number;
}

/**
 * Filtres par défaut
 */
export const DEFAULT_FILTERS: SubventionFilters = {
  search: '',
  typesOrganisme: [],
  directions: [],
  thematique: null,
  montantMin: 0,
  montantMax: 0,
};

/**
 * Plages de montants prédéfinies (min, max, label)
 * max = 0 signifie "pas de limite"
 */
export const MONTANT_RANGES = [
  { min: 0, max: 0, labelKey: 'subventions.all_amounts' },
  { min: 0, max: 100000, labelKey: 'subventions.amount_lt_100k' },
  { min: 100000, max: 1000000, labelKey: 'subventions.amount_100k_1m' },
  { min: 1000000, max: 10000000, labelKey: 'subventions.amount_1m_10m' },
  { min: 10000000, max: 100000000, labelKey: 'subventions.amount_10m_100m' },
  { min: 100000000, max: 0, labelKey: 'subventions.amount_gt_100m' },
];

/**
 * Mapping nature juridique → type organisme simplifié
 */
export const NATURE_TO_TYPE: Record<string, string> = {
  'Associations': 'association',
  'Etablissements publics': 'public',
  'Etablissements de droit public': 'public',
  'Autres personnes de droit public': 'public',
  'Etat': 'public',
  'Communes': 'public',
  'Département': 'public',
  'Régions': 'public',
  'Entreprises': 'entreprise',
  'Autres personnes de droit privé': 'prive_autre',
  'Personnes physiques': 'personne_physique',
  'Autres': 'autre',
};

/**
 * Labels pour les types d'organismes
 */
export const TYPE_ORGANISME_KEYS: Record<string, string> = {
  'association': 'subventions.org.associations',
  'public': 'subventions.org.public',
  'entreprise': 'subventions.org.companies',
  'personne_physique': 'subventions.org.individuals',
  'prive_autre': 'subventions.org.other_private',
  'autre': 'subventions.org.other',
};

interface SubventionsFiltersProps {
  /** Filtres actuels */
  filters: SubventionFilters;
  /** Callback de modification des filtres */
  onFiltersChange: (filters: SubventionFilters) => void;
  /** Directions disponibles */
  availableDirections: string[];
  /** Statistiques pour affichage */
  stats?: {
    total: number;
    filtered: number;
    montantTotal: number;
    montantFiltered: number;
  };
}

export default function SubventionsFilters({
  filters,
  onFiltersChange,
  availableDirections,
  stats,
}: SubventionsFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const track = useTrack();
  const t = useT();
  const tCat = useTCategory();

  /**
   * Mise à jour d'un filtre
   */
  const updateFilter = useCallback(<K extends keyof SubventionFilters>(
    key: K,
    value: SubventionFilters[K]
  ) => {
    track('filter_change', { filter: key, value: typeof value === 'string' ? value : JSON.stringify(value) });
    onFiltersChange({ ...filters, [key]: value });
  }, [filters, onFiltersChange, track]);

  /**
   * Toggle un type d'organisme
   */
  const toggleTypeOrganisme = useCallback((type: string) => {
    const current = filters.typesOrganisme;
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    updateFilter('typesOrganisme', updated);
  }, [filters.typesOrganisme, updateFilter]);

  // Note: toggleDirection removed - using dropdown instead of multi-select

  /**
   * Reset tous les filtres
   */
  const resetFilters = useCallback(() => {
    track('filter_reset', { context: 'subventions' });
    onFiltersChange(DEFAULT_FILTERS);
  }, [onFiltersChange, track]);

  /**
   * Nombre de filtres actifs
   */
  // Compter les filtres actifs (plage de montant compte si min ou max sont modifiés)
  const activeFiltersCount = [
    filters.search ? 1 : 0,
    filters.typesOrganisme.length > 0 ? 1 : 0,
    filters.directions.length > 0 ? 1 : 0,
    filters.thematique ? 1 : 0,
    (filters.montantMin > 0 || filters.montantMax > 0) ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-100">{t('common.filters')}</span>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/20 text-purple-300">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <span className="text-slate-300">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Recherche */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('subventions.search')}
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder={t('subventions.search_placeholder')}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Types d'organismes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              {t('subventions.org_type')}
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_ORGANISME_KEYS).map(([type, labelKey]) => (
                <button
                  key={type}
                  onClick={() => toggleTypeOrganisme(type)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                    ${filters.typesOrganisme.includes(type)
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                      : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-slate-700/50'
                    }
                  `}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Directions */}
          {availableDirections.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t('subventions.direction')}
              </label>
              <select
                value={filters.directions.length === 1 ? filters.directions[0] : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  updateFilter('directions', value ? [value] : []);
                }}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="">{t('subventions.all_directions')}</option>
                {availableDirections.map(dir => (
                  <option key={dir} value={dir}>{dir}</option>
                ))}
              </select>
            </div>
          )}

          {/* Plage de montant */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('subventions.amount_range')}
            </label>
            <select
              value={`${filters.montantMin}-${filters.montantMax}`}
              onChange={(e) => {
                const [min, max] = e.target.value.split('-').map(Number);
                onFiltersChange({ ...filters, montantMin: min, montantMax: max });
              }}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-colors"
            >
              {MONTANT_RANGES.map((range) => (
                <option 
                  key={`${range.min}-${range.max}`} 
                  value={`${range.min}-${range.max}`}
                >
                  {t(range.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Thématique (si sélectionnée depuis treemap) */}
          {filters.thematique && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t('subventions.thematique')}
              </label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-purple-500/20 border border-purple-500/50 text-purple-300">
                  {tCat(filters.thematique)}
                </span>
                <button
                  onClick={() => updateFilter('thematique', null)}
                  className="text-slate-300 hover:text-slate-100"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 border-t border-slate-700/50">
            <button
              onClick={resetFilters}
              disabled={activeFiltersCount === 0}
              className="w-full px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.reset_filters')}
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="pt-2 border-t border-slate-700/50 text-xs text-slate-400 space-y-0.5">
              <p className="font-medium text-slate-400">
                {stats.filtered.toLocaleString('fr-FR')} {t('common.displayed')}
              </p>
              <p>
                {t('common.of')} {t('chart.top')} {stats.total.toLocaleString('fr-FR')} {t('subventions.top_beneficiaries')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
