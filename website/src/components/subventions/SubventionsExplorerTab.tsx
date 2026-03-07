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

// ─── Constants ───────────────────────────────────────────────────────────────

const NATURE_TO_TYPE: Record<string, string> = {
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

const TYPE_LABEL_KEYS: Record<string, string> = {
  'association': 'subventions.explorer.type.associations',
  'public': 'subventions.explorer.type.public',
  'entreprise': 'subventions.explorer.type.entreprises',
  'personne_physique': 'subventions.explorer.type.personnes_physiques',
  'prive_autre': 'subventions.explorer.type.autres_prives',
  'autre': 'subventions.explorer.type.autres',
};

const MONTANT_RANGE_DEFS = [
  { min: 0, max: 0, key: 'subventions.explorer.all_amounts' },
  { min: 0, max: 100000, key: 'subventions.explorer.lt_100k' },
  { min: 100000, max: 1000000, key: 'subventions.explorer.100k_1m' },
  { min: 1000000, max: 10000000, key: 'subventions.explorer.1m_10m' },
  { min: 10000000, max: 100000000, key: 'subventions.explorer.10m_100m' },
  { min: 100000000, max: 0, key: 'subventions.explorer.gt_100m' },
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
  const t = useT();
  const isVertical = layout === 'sidebar';

  const thematiques = useMemo(() => {
    const set = new Set(beneficiaires.map(b => b.thematique));
    return Array.from(set).sort();
  }, [beneficiaires]);

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('subventions.explorer.search_label')}</label>
        <input
          type="text" value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder={t('subventions.explorer.placeholder')}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
        />
      </div>

      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-2">{t('subventions.explorer.type_organisme')}</label>
        <div className={isVertical ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
          {Object.entries(TYPE_LABEL_KEYS).map(([type, labelKey]) => {
            const isSelected = filters.typesOrganisme.includes(type);
            return (
              <button key={type}
                onClick={() => {
                  const updated = isSelected ? filters.typesOrganisme.filter(tp => tp !== type) : [...filters.typesOrganisme, type];
                  onFiltersChange({ ...filters, typesOrganisme: updated });
                }}
                className={`${isVertical ? 'w-full flex items-center justify-between px-3 py-2' : 'px-2 py-1'} rounded-md text-${isVertical ? 'sm' : '[11px]'} font-medium transition-all ${isSelected ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'}`}
              ><span>{t(labelKey)}</span></button>
            );
          })}
        </div>
      </div>

      <div className={isVertical ? 'space-y-4' : ''}>
        {availableDirections.length > 0 && (
          <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('subventions.explorer.direction')}</label>
            <select value={filters.directions.length === 1 ? filters.directions[0] : ''}
              onChange={e => onFiltersChange({ ...filters, directions: e.target.value ? [e.target.value] : [] })}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="">{t('subventions.explorer.all_directions')}</option>
              {availableDirections.map(dir => <option key={dir} value={dir}>{dir}</option>)}
            </select>
          </div>
        )}

        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('subventions.explorer.montant')}</label>
          <select value={`${filters.montantMin}-${filters.montantMax}`}
            onChange={e => { const [min, max] = e.target.value.split('-').map(Number); onFiltersChange({ ...filters, montantMin: min, montantMax: max }); }}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
          >
            {MONTANT_RANGE_DEFS.map(r => <option key={`${r.min}-${r.max}`} value={`${r.min}-${r.max}`}>{t(r.key)}</option>)}
          </select>
        </div>

        {isVertical && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <label className="block text-xs font-medium text-slate-400 mb-2">{t('subventions.explorer.thematique')}</label>
            <select value={filters.thematique || ''}
              onChange={e => onFiltersChange({ ...filters, thematique: e.target.value || null })}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="">{t('subventions.explorer.all_thematiques')}</option>
              {thematiques.map(th => <option key={th} value={th}>{th}</option>)}
            </select>
          </div>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {t('subventions.explorer.reset_filters')} ({activeFilterCount})
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
  const t = useT();
  const [filters, setFilters] = useState<SubventionFilters>(DEFAULT_FILTERS);

  const csvColumns: CsvColumn<Record<string, unknown>>[] = useMemo(() => [
    { key: 'annee', label: t('csv.year') },
    { key: 'beneficiaire', label: t('csv.beneficiaire') },
    { key: 'nature_juridique', label: t('csv.nature_juridique') },
    { key: 'direction', label: t('csv.direction') },
    { key: 'thematique', label: t('csv.thematique') },
    { key: 'montant_total', label: t('csv.montant_total') },
    { key: 'nb_subventions', label: t('csv.nb_subventions') },
    { key: 'objet_principal', label: t('csv.objet_principal') },
    { key: 'siret', label: t('csv.siret') },
  ], [t]);

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
      filterLabel={t('subventions.explorer.filter_label')}
      summaryTitle={
        <>
          {formatNumber(filteredBenefs.length)} {t('subventions.explorer.beneficiaires')}
          <span className="text-sm font-normal text-slate-400 ml-2">({formatEuroCompact(filteredMontant)})</span>
        </>
      }
      filterPanel={(layout) => <FilterPanel {...filterProps} layout={layout} />}
      exportBar={
        <ExportBar
          csvData={filteredBenefs as unknown as Record<string, unknown>[]}
          csvColumns={csvColumns}
          filename="subventions_filtrees"
        />
      }
      listView={
        <SubventionsTable data={beneficiaires} filters={filters} isLoading={false} pageSize={50} />
      }
    />
  );
}
