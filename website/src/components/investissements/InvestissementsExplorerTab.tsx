'use client';

/**
 * InvestissementsExplorerTab — Wrapper Investissements pour le composant partagé ExplorerTab.
 *
 * Filtres : Recherche, Arrondissement, Thématiques.
 * Vues : Liste paginée (50/page) + Carte Leaflet.
 */

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import ExplorerTab from '@/components/shared/ExplorerTab';
import ExportBar from '@/components/shared/ExportBar';
import type { AutorisationProgramme, ArrondissementStats } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import type { CsvColumn } from '@/lib/export';
import { useT } from '@/lib/localeContext';

// ─── Dynamic import (Leaflet needs window) ───────────────────────────────────

const InvestissementsMap = dynamic(
  () => import('@/components/map/InvestissementsMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[550px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

// ─── Constants ───────────────────────────────────────────────────────────────

const THEMATIQUES = [
  'education', 'sport', 'culture', 'environnement', 'mobilite',
  'logement', 'social', 'democratie', 'urbanisme', 'autre',
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvestissementsExplorerTabProps {
  projets: AutorisationProgramme[];
  arrondissementStats?: ArrondissementStats[];
  isLoading: boolean;
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  searchTerm, onSearchChange,
  selectedArrondissement, onArrondissementChange,
  selectedThematiques, onToggleThematique,
  projets, activeFilterCount, onReset,
  layout,
}: {
  searchTerm: string; onSearchChange: (v: string) => void;
  selectedArrondissement: number | null; onArrondissementChange: (v: number | null) => void;
  selectedThematiques: string[]; onToggleThematique: (t: string) => void;
  projets: AutorisationProgramme[];
  activeFilterCount: number; onReset: () => void;
  layout: 'sidebar' | 'inline';
}) {
  const t = useT();
  const isVertical = layout === 'sidebar';

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('invest.explorer.rechercher')}</label>
        <input
          type="text" value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={t('invest.explorer.placeholder')}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('invest.explorer.arrondissement')}</label>
        <select
          value={selectedArrondissement ?? ''}
          onChange={e => onArrondissementChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
        >
          <option value="">{t('invest.explorer.tous')}</option>
          <option value="0">{t('invest.explorer.paris_centre_1_4')}</option>
          {Array.from({ length: 16 }, (_, i) => i + 5).map(arr => (
            <option key={arr} value={arr}>{arr}e</option>
          ))}
        </select>
      </div>

      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-2">{t('invest.explorer.thematiques')}</label>
        <div className={isVertical ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
          {THEMATIQUES.map(th => {
            const label = THEMATIQUE_LABELS[th as ThematiqueSubvention];
            const isSelected = selectedThematiques.includes(th);
            const count = projets.filter(p => p.thematique === th).length;
            return (
              <button
                key={th}
                onClick={() => onToggleThematique(th)}
                className={`${isVertical ? 'w-full flex items-center justify-between px-3 py-2' : 'px-2 py-1'} rounded-md text-${isVertical ? 'sm' : '[11px]'} font-medium transition-all ${
                  isSelected
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>{label?.icon || '📋'}</span>
                  <span>{label?.label || th}</span>
                </span>
                {isVertical && <span className="text-xs opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {t('invest.explorer.reset_filtres')} ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvestissementsExplorerTab({
  projets, arrondissementStats, isLoading,
}: InvestissementsExplorerTabProps) {
  const t = useT();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [selectedThematiques, setSelectedThematiques] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const csvColumns: CsvColumn<Record<string, unknown>>[] = useMemo(() => [
    { key: 'annee', label: t('invest.csv.annee') },
    { key: 'apTexte', label: t('invest.csv.projet') },
    { key: 'thematique', label: t('invest.csv.thematique') },
    { key: 'directionTexte', label: t('invest.csv.direction') },
    { key: 'montant', label: t('invest.csv.montant') },
    { key: 'arrondissement', label: t('invest.csv.arrondissement') },
    { key: 'adresse', label: t('invest.csv.adresse') },
  ], [t]);
  const PAGE_SIZE = 50;

  const filteredProjets = useMemo(() => {
    let filtered = projets;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.apTexte.toLowerCase().includes(s) || p.missionTexte?.toLowerCase().includes(s),
      );
    }
    if (selectedThematiques.length > 0) {
      filtered = filtered.filter(p => selectedThematiques.includes(p.thematique));
    }
    if (selectedArrondissement !== null) {
      filtered = filtered.filter(p => p.arrondissement === selectedArrondissement);
    }
    return filtered;
  }, [projets, searchTerm, selectedThematiques, selectedArrondissement]);

  const sortedProjets = useMemo(
    () => [...filteredProjets].sort((a, b) => b.montant - a.montant),
    [filteredProjets],
  );

  const filteredMontant = useMemo(
    () => filteredProjets.reduce((s, p) => s + p.montant, 0),
    [filteredProjets],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (selectedArrondissement !== null) count++;
    count += selectedThematiques.length;
    return count;
  }, [searchTerm, selectedArrondissement, selectedThematiques]);

  const toggleThematique = (th: string) => {
    setSelectedThematiques(prev => prev.includes(th) ? prev.filter(x => x !== th) : [...prev, th]);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedArrondissement(null);
    setSelectedThematiques([]);
    setCurrentPage(1);
  };

  // Pagination
  const totalPages = Math.ceil(sortedProjets.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = sortedProjets.slice(startIdx, startIdx + PAGE_SIZE);

  const filterProps = {
    searchTerm,
    onSearchChange: (v: string) => { setSearchTerm(v); setCurrentPage(1); },
    selectedArrondissement,
    onArrondissementChange: (v: number | null) => { setSelectedArrondissement(v); setCurrentPage(1); },
    selectedThematiques,
    onToggleThematique: toggleThematique,
    projets,
    activeFilterCount,
    onReset: resetFilters,
  };

  return (
    <ExplorerTab
      theme="amber"
      isLoading={isLoading}
      activeFilterCount={activeFilterCount}
      filterLabel={t('invest.explorer.filter_label')}
      summaryTitle={
        <>
          {formatNumber(filteredProjets.length)} {t('invest.explorer.projets')}
          <span className="text-sm font-normal text-slate-400 ml-2">
            ({formatEuroCompact(filteredMontant)})
          </span>
        </>
      }
      filterPanel={(layout) => <FilterPanel {...filterProps} layout={layout} />}
      exportBar={
        <ExportBar
          csvData={filteredProjets as unknown as Record<string, unknown>[]}
          csvColumns={csvColumns}
          filename="investissements_filtres"
        />
      }
      listView={
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('invest.col.projet')}</th>
                  <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('invest.col.chapitre')}</th>
                  <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('invest.col.montant')}</th>
                  <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('invest.col.arr')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {pageItems.map((p, i) => {
                  const label = THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention];
                  return (
                    <tr key={p.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-2 md:px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="text-slate-500 text-xs w-5 shrink-0">{startIdx + i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{p.apTexte}</p>
                            <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                              {label?.icon || '📋'} {label?.label || p.thematique}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <p className="text-xs text-slate-400 line-clamp-2">{p.missionTexte}</p>
                      </td>
                      <td className="px-2 md:px-4 py-3 text-right">
                        <p className="text-xs md:text-sm font-semibold text-amber-400 whitespace-nowrap">
                          {formatEuroCompact(p.montant)}
                        </p>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-center">
                        {p.arrondissement !== undefined
                          ? <span className="text-sm text-slate-300">
                              {p.arrondissement === 0 ? t('invest.explorer.centre') : `${p.arrondissement}e`}
                            </span>
                          : <span className="text-slate-500">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="text-sm text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {t('invest.explorer.precedent')}
              </button>
              <span className="text-sm text-slate-500">
                {t('invest.explorer.page')} {currentPage} / {totalPages} · {formatNumber(sortedProjets.length)} {t('invest.explorer.projets')}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="text-sm text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {t('invest.explorer.suivant')}
              </button>
            </div>
          )}
          {sortedProjets.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-slate-400">{t('invest.explorer.aucun_projet')}</p>
            </div>
          )}
        </div>
      }
      mapView={
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden" style={{ height: 550 }}>
          <InvestissementsMap projets={filteredProjets} isLoading={false} />
        </div>
      }
      arrondissementView={arrondissementStats && arrondissementStats.length > 0 ? (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden" style={{ height: 550 }}>
          <InvestissementsMap
            projets={filteredProjets}
            isLoading={false}
            showChoropleth
            arrondissementStats={arrondissementStats}
          />
        </div>
      ) : undefined}
    />
  );
}
