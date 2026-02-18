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

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onFiltersChange, availableCategories, activeFilterCount, onReset, layout,
}: {
  filters: MarchesFilters; onFiltersChange: (f: MarchesFilters) => void;
  availableCategories: string[];
  activeFilterCount: number; onReset: () => void; layout: 'sidebar' | 'inline';
}) {
  const isVertical = layout === 'sidebar';

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : ''}>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Rechercher</label>
        <input
          type="text" value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Objet, fournisseur, n° marché..."
          className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
      </div>

      <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : ''}>
        <label className="block text-xs font-medium text-slate-500 mb-2">Nature</label>
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
              ><span>{label}</span></button>
            );
          })}
        </div>
      </div>

      <div className={isVertical ? 'space-y-4' : ''}>
        {availableCategories.length > 0 && (
          <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : ''}>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Catégorie d&apos;achat</label>
            <select value={filters.categories.length === 1 ? filters.categories[0] : ''}
              onChange={e => onFiltersChange({ ...filters, categories: e.target.value ? [e.target.value] : [] })}
              className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            >
              <option value="">Toutes les catégories</option>
              {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        )}

        <div className={isVertical ? 'bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Enveloppe</label>
          <select value={`${filters.montantMin}-${filters.montantMax}`}
            onChange={e => { const [min, max] = e.target.value.split('-').map(Number); onFiltersChange({ ...filters, montantMin: min, montantMax: max }); }}
            className="w-full bg-slate-800/30 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          >
            {MONTANT_RANGES.map(r => <option key={`${r.min}-${r.max}`} value={`${r.min}-${r.max}`}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Réinitialiser les filtres ({activeFilterCount})
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
    <ExplorerTab
      theme="teal"
      isLoading={isLoading}
      activeFilterCount={activeFilterCount}
      filterLabel="les marchés"
      summaryTitle={
        <>
          {formatNumber(filteredMarches.length)} marchés
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
  );
}
