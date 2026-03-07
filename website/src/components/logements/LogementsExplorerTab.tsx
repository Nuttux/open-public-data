'use client';

/**
 * LogementsExplorerTab — Wrapper Logements pour le composant partagé ExplorerTab.
 *
 * Filtres : Recherche, Bailleur, Arrondissement, Année.
 * Vues : Liste (100 premiers) + Carte (points) + Arrondissements (choroplèthe).
 */

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ExplorerTab from '@/components/shared/ExplorerTab';
import ExportBar from '@/components/shared/ExportBar';
import type { LogementSocial, ArrondissementStats } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';
import type { CsvColumn } from '@/lib/export';
import { useTrack } from '@/lib/analyticsContext';
import { useT } from '@/lib/localeContext';

function getCsvColumns(t: (k: string) => string): CsvColumn<Record<string, unknown>>[] {
  return [
    { key: 'annee', label: t('logements.csv.year') },
    { key: 'adresse', label: t('logements.csv.address') },
    { key: 'codePostal', label: t('logements.csv.postal_code') },
    { key: 'arrondissement', label: t('logements.csv.arrondissement') },
    { key: 'bailleur', label: t('logements.csv.landlord') },
    { key: 'nbLogements', label: t('logements.csv.nb_housing') },
    { key: 'nbPLAI', label: 'PLAI' },
    { key: 'nbPLUS', label: 'PLUS' },
    { key: 'nbPLS', label: 'PLS' },
    { key: 'modeRealisation', label: t('logements.csv.mode') },
    { key: 'natureProgramme', label: t('logements.csv.nature') },
  ];
}

// ─── Dynamic import (Leaflet needs window) ───────────────────────────────────

const LogementsSociauxMap = dynamic(
  () => import('@/components/map/LogementsSociauxMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[550px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  },
);

// ─── Types ───────────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  bailleur: string | null;
  arrondissement: number | null;
  annee: number | null;
}

const DEFAULT_FILTERS: Filters = {
  search: '', bailleur: null, arrondissement: null, annee: null,
};

interface LogementsExplorerTabProps {
  logements: LogementSocial[];
  arrondissementStats: ArrondissementStats[];
  allArrondissements: number[];
  isLoading: boolean;
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onFiltersChange, logements, activeFilterCount, onReset, layout,
}: {
  filters: Filters; onFiltersChange: (f: Filters) => void;
  logements: LogementSocial[];
  activeFilterCount: number; onReset: () => void; layout: 'sidebar' | 'inline';
}) {
  const t = useT();
  const isVertical = layout === 'sidebar';

  const bailleurs = useMemo(() => {
    const map: Record<string, number> = {};
    logements.forEach(l => { map[l.bailleur] = (map[l.bailleur] || 0) + l.nbLogements; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([nom]) => nom);
  }, [logements]);

  const arrondissements = useMemo(
    () => [...new Set(logements.map(l => l.arrondissement))].sort((a, b) => a - b),
    [logements],
  );

  const years = useMemo(
    () => [...new Set(logements.map(l => l.annee))].sort((a, b) => b - a),
    [logements],
  );

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('logements.explorer_search')}</label>
        <input
          type="text" value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder={t('logements.explorer_search_placeholder')}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('logements.explorer_bailleur')}</label>
        <select
          value={filters.bailleur || ''}
          onChange={e => onFiltersChange({ ...filters, bailleur: e.target.value || null })}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
        >
          <option value="">{t('logements.explorer_all_bailleurs')}</option>
          {bailleurs.slice(0, 30).map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className={isVertical ? 'space-y-4' : ''}>
        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('logements.explorer_arrondissement')}</label>
          <select
            value={filters.arrondissement ?? ''}
            onChange={e => onFiltersChange({ ...filters, arrondissement: e.target.value ? Number(e.target.value) : null })}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            <option value="">{t('logements.explorer_all_arr')}</option>
            {arrondissements.map(a => (
              <option key={a} value={a}>{a === 0 ? t('map.popup.paris_centre') : `${a}e`}</option>
            ))}
          </select>
        </div>

        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('logements.explorer_annee')}</label>
          <select
            value={filters.annee ?? ''}
            onChange={e => onFiltersChange({ ...filters, annee: e.target.value ? Number(e.target.value) : null })}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            <option value="">{t('logements.explorer_all_years')}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {t('logements.explorer_reset_filters')} ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LogementsExplorerTab({
  logements, arrondissementStats, allArrondissements: _allArrondissements, isLoading,
}: LogementsExplorerTabProps) {
  const t = useT();
  const track = useTrack();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    if (newFilters.arrondissement !== filters.arrondissement) {
      track('filter_change', { filter: 'arrondissement', value: newFilters.arrondissement });
    } else if (newFilters.bailleur !== filters.bailleur) {
      track('filter_change', { filter: 'bailleur', value: newFilters.bailleur });
    } else if (newFilters.annee !== filters.annee) {
      track('filter_change', { filter: 'annee', value: newFilters.annee });
    } else if (newFilters.search !== filters.search && newFilters.search.length >= 3) {
      track('filter_change', { filter: 'search', value: newFilters.search });
    }
    setFilters(newFilters);
  }, [filters, track]);

  const filteredLogements = useMemo(() => {
    let result = logements;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(l =>
        l.adresse.toLowerCase().includes(s) || l.bailleur.toLowerCase().includes(s),
      );
    }
    if (filters.bailleur) result = result.filter(l => l.bailleur === filters.bailleur);
    if (filters.arrondissement !== null) result = result.filter(l => l.arrondissement === filters.arrondissement);
    if (filters.annee !== null) result = result.filter(l => l.annee === filters.annee);
    return result;
  }, [logements, filters]);

  const totalLogements = useMemo(
    () => filteredLogements.reduce((s, l) => s + l.nbLogements, 0),
    [filteredLogements],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.bailleur) count++;
    if (filters.arrondissement !== null) count++;
    if (filters.annee !== null) count++;
    return count;
  }, [filters]);

  const resetFilters = useCallback(() => {
    track('filter_reset', { context: 'logements' });
    setFilters(DEFAULT_FILTERS);
  }, [track]);

  const filterProps = {
    filters, onFiltersChange: handleFiltersChange, logements, activeFilterCount, onReset: resetFilters,
  };

  return (
    <ExplorerTab
      theme="emerald"
      isLoading={isLoading}
      activeFilterCount={activeFilterCount}
      filterLabel={t('logements.explorer_filter_label')}
      defaultView="carte"
      summaryTitle={
        <>
          {formatNumber(filteredLogements.length)} {t('logements.explorer_programmes')}
          <span className="text-sm font-normal text-slate-400 ml-2">
            ({formatNumber(totalLogements)} {t('logements.format_value_suffix').trim()})
          </span>
        </>
      }
      filterPanel={(layout) => <FilterPanel {...filterProps} layout={layout} />}
      exportBar={
        <ExportBar
          csvData={filteredLogements as unknown as Record<string, unknown>[]}
          csvColumns={getCsvColumns(t)}
          filename="logements_filtres"
        />
      }
      listView={
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('logements.explorer_th_adresse')}</th>
                  <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('logements.explorer_th_bailleur')}</th>
                  <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('logements.explorer_th_logements')}</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-blue-400 uppercase">PLAI</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-cyan-400 uppercase">PLUS</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-violet-400 uppercase">PLS</th>
                  <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('logements.explorer_th_annee')}</th>
                  <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('logements.explorer_th_arr')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {[...filteredLogements].sort((a, b) => b.nbLogements - a.nbLogements).slice(0, 100).map((l, i) => (
                  <tr key={`${l.id}-${i}`} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-2 md:px-4 py-3">
                      <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{l.adresse}</p>
                      <p className="text-[10px] md:text-xs text-slate-500 md:hidden">{l.bailleur}</p>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <p className="text-xs text-slate-300">{l.bailleur}</p>
                      <p className="text-[10px] text-slate-500">{l.natureProgramme}</p>
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right">
                      <p className="text-xs md:text-sm font-semibold text-emerald-400">{formatNumber(l.nbLogements)}</p>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-blue-400">{l.nbPLAI || 0}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-cyan-400">{l.nbPLUS || 0}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-violet-400">{l.nbPLS || 0}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-center text-sm text-slate-400">{l.annee}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-center text-sm text-slate-400">
                      {l.arrondissement === 0 ? t('logements.explorer_centre') : `${l.arrondissement}e`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLogements.length > 100 && (
            <div className="px-4 py-3 border-t border-slate-700 text-center">
              <p className="text-sm text-slate-500">{t('logements.explorer_first_of').replace('{total}', formatNumber(filteredLogements.length))}</p>
            </div>
          )}
          {filteredLogements.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-slate-400">{t('logements.explorer_no_match')}</p>
            </div>
          )}
        </div>
      }
      mapView={
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden" style={{ height: 600 }}>
          <LogementsSociauxMap
            logements={filteredLogements}
            arrondissementStats={arrondissementStats}
            isLoading={isLoading}
            selectedBailleur={filters.bailleur}
          />
        </div>
      }
      arrondissementView={
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden" style={{ height: 600 }}>
          <LogementsSociauxMap
            logements={filteredLogements}
            arrondissementStats={arrondissementStats}
            showChoropleth
            isLoading={isLoading}
            selectedBailleur={filters.bailleur}
          />
        </div>
      }
    />
  );
}
