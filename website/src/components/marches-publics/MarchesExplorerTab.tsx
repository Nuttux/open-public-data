'use client';

/**
 * MarchesExplorerTab — Wrapper Marchés publics pour le composant partagé ExplorerTab.
 *
 * Pas de vue Carte (pas de données géographiques).
 * Filtres : Recherche, Nature, Catégorie, Montant.
 */

import { useState, useMemo } from 'react';
import ExplorerTab from '@/components/shared/ExplorerTab';
import MarchesTable, { type MarchePublic } from '@/components/MarchesTable';
import { type MarchesFilters, DEFAULT_MARCHES_FILTERS, MONTANT_RANGES, NATURE_LABELS } from '@/components/MarchesFilters';
import ExportBar from '@/components/shared/ExportBar';
import type { CsvColumn } from '@/lib/export';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';

const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
  { key: 'numero_marche', label: 'N° marché' },
  { key: 'objet', label: 'Objet' },
  { key: 'nature', label: 'Nature' },
  { key: 'categorie_libelle', label: 'Catégorie' },
  { key: 'fournisseur_nom', label: 'Fournisseur' },
  { key: 'fournisseur_siret', label: 'SIRET fournisseur' },
  { key: 'montant_max', label: 'Enveloppe max (€)' },
  { key: 'date_notification', label: 'Date notification' },
  { key: 'duree_jours', label: 'Durée (jours)' },
  { key: 'is_multiattributaire', label: 'Multi-attributaire', format: (v) => v ? 'Oui' : 'Non' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarchesExplorerTabProps {
  marches: MarchePublic[];
  availableCategories: string[];
  isLoading: boolean;
}

const NATURE_KEYS: Record<string, string> = { 'SERVICES': 'marches_filters.services', 'TRAVAUX': 'marches_filters.works', 'FOURNITURE': 'marches_filters.supplies' };
const MARCHES_RANGE_KEYS = ['marches_filters.all_envelopes', 'filters.range.lt_100k', 'filters.range.100k_1m', 'filters.range.1m_10m', 'filters.range.10m_100m', 'filters.range.gt_100m'];

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onFiltersChange, availableCategories, activeFilterCount, onReset, layout,
}: {
  filters: MarchesFilters; onFiltersChange: (f: MarchesFilters) => void;
  availableCategories: string[];
  activeFilterCount: number; onReset: () => void; layout: 'sidebar' | 'inline';
}) {
  const isVertical = layout === 'sidebar';
  const t = useT();

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : ''}>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('marches.search')}</label>
        <input
          type="text" value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder={t('marches.search_placeholder')}
          className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
      </div>

      <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : ''}>
        <label className="block text-xs font-medium text-slate-500 mb-2">{t('marches.nature')}</label>
        <div className={isVertical ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
          {Object.entries(NATURE_LABELS).map(([nature, label]) => {
            const isSelected = filters.natures.includes(nature);
            return (
              <button key={nature}
                onClick={() => {
                  const updated = isSelected ? filters.natures.filter(n => n !== nature) : [...filters.natures, nature];
                  onFiltersChange({ ...filters, natures: updated });
                }}
                className={`${isVertical ? 'w-full flex items-center justify-between px-3 py-2' : 'px-2 py-1'} rounded-md text-${isVertical ? 'sm' : '[11px]'} font-medium transition-all ${isSelected ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'bg-slate-5030 text-slate-500 hover:bg-slate-800/30 border border-transparent'}`}
              ><span>{t(NATURE_KEYS[nature]) || label}</span></button>
            );
          })}
        </div>
      </div>

      <div className={isVertical ? 'space-y-4' : ''}>
        {availableCategories.length > 0 && (
          <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : ''}>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('marches.purchase_category')}</label>
            <select value={filters.categories.length === 1 ? filters.categories[0] : ''}
              onChange={e => onFiltersChange({ ...filters, categories: e.target.value ? [e.target.value] : [] })}
              className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            >
              <option value="">{t('marches.all_categories')}</option>
              {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        )}

        <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('marches.amount')}</label>
          <select value={`${filters.montantMin}-${filters.montantMax}`}
            onChange={e => { const [min, max] = e.target.value.split('-').map(Number); onFiltersChange({ ...filters, montantMin: min, montantMax: max }); }}
            className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          >
            {MONTANT_RANGES.map((r, i) => <option key={`${r.min}-${r.max}`} value={`${r.min}-${r.max}`}>{t(MARCHES_RANGE_KEYS[i])}</option>)}
          </select>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {t('marches.reset_filters')} ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarchesExplorerTab({
  marches, availableCategories, isLoading,
}: MarchesExplorerTabProps) {
  const [filters, setFilters] = useState<MarchesFilters>(DEFAULT_MARCHES_FILTERS);
  const t = useT();

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.search) c++;
    if (filters.natures.length > 0) c++;
    if (filters.categories.length > 0) c++;
    if (filters.montantMin > 0 || filters.montantMax > 0) c++;
    return c;
  }, [filters]);

  const filteredMarches = useMemo(() => {
    let result = marches;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(m =>
        m.objet.toLowerCase().includes(s) ||
        m.fournisseur_nom.toLowerCase().includes(s) ||
        (m.fournisseur_siret && m.fournisseur_siret.includes(s)) ||
        (m.numero_marche && m.numero_marche.includes(s))
      );
    }
    if (filters.natures.length > 0) result = result.filter(m => filters.natures.includes(m.nature));
    if (filters.categories.length > 0) result = result.filter(m => filters.categories.includes(m.categorie_libelle));
    if (filters.montantMin > 0) result = result.filter(m => m.montant_max >= filters.montantMin);
    if (filters.montantMax > 0) result = result.filter(m => m.montant_max <= filters.montantMax);
    return result;
  }, [marches, filters]);

  const filteredEnveloppe = useMemo(() => filteredMarches.reduce((s, m) => s + m.montant_max, 0), [filteredMarches]);
  const resetFilters = () => setFilters(DEFAULT_MARCHES_FILTERS);

  const filterProps = {
    filters, onFiltersChange: setFilters, availableCategories,
    activeFilterCount, onReset: resetFilters,
  };

  return (
    <>
      <div className="bg-teal-900/30 border border-teal-500/30 rounded-lg p-3 mb-6">
        <p className="text-xs text-teal-300/80" dangerouslySetInnerHTML={{ __html: t('marches.ceiling_notice') }} />
      </div>
      <ExplorerTab
      theme="teal"
      isLoading={isLoading}
      activeFilterCount={activeFilterCount}
      filterLabel={t('marches.filter_label')}
      summaryTitle={
        <>
          {formatNumber(filteredMarches.length)} {t('marches.item_label')}
          <span className="text-sm font-normal text-slate-500 ml-2">({formatEuroCompact(filteredEnveloppe)})</span>
        </>
      }
      filterPanel={(layout) => <FilterPanel {...filterProps} layout={layout} />}
      exportBar={
        <ExportBar
          csvData={filteredMarches as unknown as Record<string, unknown>[]}
          csvColumns={CSV_COLUMNS}
          filename="marches_filtres"
        />
      }
      listView={
        <MarchesTable data={marches} filters={filters} isLoading={false} pageSize={50} />
      }
    />
    </>
  );
}
