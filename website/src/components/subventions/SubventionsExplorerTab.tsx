'use client';

/**
 * SubventionsExplorerTab — Wrapper Subventions pour le composant partagé ExplorerTab.
 *
 * Pas de vue Carte (pas de données géographiques).
 * Filtres : Recherche, Type organisme, Direction, Montant, Thématique.
 */

import { useState, useMemo } from 'react';
import ExplorerTab from '@/components/shared/ExplorerTab';
import ExportBar from '@/components/shared/ExportBar';
import SubventionsTable, { type Beneficiaire } from '@/components/SubventionsTable';
import { type SubventionFilters, DEFAULT_FILTERS } from '@/components/SubventionsFilters';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import type { CsvColumn } from '@/lib/export';
import { useT } from '@/lib/localeContext';

const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
  { key: 'annee', label: 'Année' },
  { key: 'beneficiaire', label: 'Bénéficiaire' },
  { key: 'nature_juridique', label: 'Nature juridique' },
  { key: 'direction', label: 'Direction' },
  { key: 'thematique', label: 'Thématique' },
  { key: 'montant_total', label: 'Montant total (€)' },
  { key: 'nb_subventions', label: 'Nb subventions' },
  { key: 'objet_principal', label: 'Objet principal' },
  { key: 'siret', label: 'SIRET' },
];

// ─── Constants ───────────────────────────────────────────────────────────────

// Maps normalized nature_juridique values to simplified type categories.
// The pipeline normalizes variants (e.g. "Etablissements de droit public"
// → "Etablissements publics") at export time, so no duplicates needed here.
const NATURE_TO_TYPE: Record<string, string> = {
  'Associations': 'association',
  'Etablissements publics': 'public',
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

const TYPE_LABELS: Record<string, string> = {
  'association': 'Associations',
  'public': 'Établissements publics',
  'entreprise': 'Entreprises',
  'personne_physique': 'Personnes physiques',
  'prive_autre': 'Autres privés',
  'autre': 'Autres',
};

const SUB_RANGE_KEYS = ['filters.range.all', 'filters.range.lt_100k', 'filters.range.100k_1m', 'filters.range.1m_10m', 'filters.range.10m_100m', 'filters.range.gt_100m'];

const MONTANT_RANGES = [
  { min: 0, max: 0, label: 'Tous les montants' },
  { min: 0, max: 100000, label: 'Moins de 100 k€' },
  { min: 100000, max: 1000000, label: '100 k€ à 1 M€' },
  { min: 1000000, max: 10000000, label: '1 M€ à 10 M€' },
  { min: 10000000, max: 100000000, label: '10 M€ à 100 M€' },
  { min: 100000000, max: 0, label: 'Plus de 100 M€' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubventionsExplorerTabProps {
  beneficiaires: Beneficiaire[];
  availableDirections: string[];
  isLoading: boolean;
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onFiltersChange, availableDirections, beneficiaires, activeFilterCount, onReset, layout,
}: {
  filters: SubventionFilters; onFiltersChange: (f: SubventionFilters) => void;
  availableDirections: string[]; beneficiaires: Beneficiaire[];
  activeFilterCount: number; onReset: () => void; layout: 'sidebar' | 'inline';
}) {
  const isVertical = layout === 'sidebar';
  const t = useT();

  const thematiques = useMemo(() => {
    const set = new Set(beneficiaires.map(b => b.thematique));
    return Array.from(set).sort();
  }, [beneficiaires]);

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('subv_explorer.search')}</label>
        <input
          type="text" value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder={t('subv_explorer.search_placeholder')}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
        />
      </div>

      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-2">{t('subv_explorer.org_type')}</label>
        <div className={isVertical ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const isSelected = filters.typesOrganisme.includes(type);
            return (
              <button key={type}
                onClick={() => {
                  const updated = isSelected ? filters.typesOrganisme.filter(t => t !== type) : [...filters.typesOrganisme, type];
                  onFiltersChange({ ...filters, typesOrganisme: updated });
                }}
                className={`${isVertical ? 'w-full flex items-center justify-between px-3 py-2' : 'px-2 py-1'} rounded-md text-${isVertical ? 'sm' : '[11px]'} font-medium transition-all ${isSelected ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'}`}
              ><span>{t('filters.type.' + type)}</span></button>
            );
          })}
        </div>
      </div>

      <div className={isVertical ? 'space-y-4' : ''}>
        {availableDirections.length > 0 && (
          <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('subv_explorer.direction')}</label>
            <select value={filters.directions.length === 1 ? filters.directions[0] : ''}
              onChange={e => onFiltersChange({ ...filters, directions: e.target.value ? [e.target.value] : [] })}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="">{t('subv_explorer.all_directions')}</option>
              {availableDirections.map(dir => <option key={dir} value={dir}>{dir}</option>)}
            </select>
          </div>
        )}

        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('subv_explorer.amount')}</label>
          <select value={`${filters.montantMin}-${filters.montantMax}`}
            onChange={e => { const [min, max] = e.target.value.split('-').map(Number); onFiltersChange({ ...filters, montantMin: min, montantMax: max }); }}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
          >
            {MONTANT_RANGES.map((r, i) => <option key={`${r.min}-${r.max}`} value={`${r.min}-${r.max}`}>{t(SUB_RANGE_KEYS[i])}</option>)}
          </select>
        </div>

        {isVertical && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <label className="block text-xs font-medium text-slate-400 mb-2">{t('subv_explorer.thematique')}</label>
            <select value={filters.thematique || ''}
              onChange={e => onFiltersChange({ ...filters, thematique: e.target.value || null })}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="">{t('subv_explorer.all_thematiques')}</option>
              {thematiques.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {t('subv_explorer.reset_filters')} ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsExplorerTab({
  beneficiaires, availableDirections, isLoading,
}: SubventionsExplorerTabProps) {
  const [filters, setFilters] = useState<SubventionFilters>(DEFAULT_FILTERS);
  const t = useT();

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.search) c++;
    if (filters.typesOrganisme.length > 0) c++;
    if (filters.directions.length > 0) c++;
    if (filters.thematique) c++;
    if (filters.montantMin > 0 || filters.montantMax > 0) c++;
    return c;
  }, [filters]);

  const filteredBenefs = useMemo(() => {
    let result = beneficiaires;
    if (filters.search) { const s = filters.search.toLowerCase(); result = result.filter(b => b.beneficiaire.toLowerCase().includes(s) || (b.siret && b.siret.includes(s))); }
    if (filters.thematique) result = result.filter(b => b.thematique === filters.thematique);
    if (filters.typesOrganisme.length > 0) { result = result.filter(b => { const type = NATURE_TO_TYPE[b.nature_juridique || ''] || 'autre'; return filters.typesOrganisme.includes(type); }); }
    if (filters.directions.length > 0) result = result.filter(b => b.direction && filters.directions.includes(b.direction));
    if (filters.montantMin > 0) result = result.filter(b => b.montant_total >= filters.montantMin);
    if (filters.montantMax > 0) result = result.filter(b => b.montant_total <= filters.montantMax);
    return result;
  }, [beneficiaires, filters]);

  const filteredMontant = useMemo(() => filteredBenefs.reduce((s, b) => s + b.montant_total, 0), [filteredBenefs]);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const filterProps = {
    filters, onFiltersChange: setFilters, availableDirections, beneficiaires,
    activeFilterCount, onReset: resetFilters,
  };

  return (
    <ExplorerTab
      theme="purple"
      isLoading={isLoading}
      activeFilterCount={activeFilterCount}
      filterLabel={t('subv_explorer.filter_label')}
      summaryTitle={
        <>
          {formatNumber(filteredBenefs.length)} {t('subv_explorer.recipients')}
          <span className="text-sm font-normal text-slate-400 ml-2">({formatEuroCompact(filteredMontant)})</span>
        </>
      }
      filterPanel={(layout) => <FilterPanel {...filterProps} layout={layout} />}
      exportBar={
        <ExportBar
          csvData={filteredBenefs as unknown as Record<string, unknown>[]}
          csvColumns={CSV_COLUMNS}
          filename="subventions_filtrees"
        />
      }
      listView={
        <SubventionsTable data={beneficiaires} filters={filters} isLoading={false} pageSize={50} />
      }
    />
  );
}
