'use client';

/**
 * LogementsExplorerTab — Onglet "Explorer" de /logements.
 *
 * Layout responsive :
 *   - Desktop : filtres en sidebar gauche (toujours ouverts) + contenu à droite
 *   - Mobile : filtres collapsibles au-dessus du contenu
 *
 * Toggle entre vue Liste (table programmes) et vue Carte (Leaflet map).
 * Les filtres sont partagés entre les deux vues.
 *
 * Sources : données chargées par le parent et transmises en props.
 */

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { LogementSocial, ArrondissementStats } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

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

type ViewMode = 'liste' | 'carte';

interface LogementsExplorerTabProps {
  /** All logements (filtered by arrondissement if applicable) */
  logements: LogementSocial[];
  /** Arrondissement stats for choropleth */
  arrondissementStats: ArrondissementStats[];
  /** All arrondissement codes available */
  allArrondissements: number[];
  /** Chargement en cours */
  isLoading: boolean;
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  bailleur: string | null;
  arrondissement: number | null;
  annee: number | null;
  showChoropleth: boolean;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  bailleur: null,
  arrondissement: null,
  annee: null,
  showChoropleth: false,
};

function FilterPanel({
  filters,
  onFiltersChange,
  logements,
  activeFilterCount,
  onReset,
  layout,
}: {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  logements: LogementSocial[];
  activeFilterCount: number;
  onReset: () => void;
  layout: 'sidebar' | 'inline';
}) {
  const isVertical = layout === 'sidebar';

  /** Available bailleurs */
  const bailleurs = useMemo(() => {
    const map: Record<string, number> = {};
    logements.forEach(l => { map[l.bailleur] = (map[l.bailleur] || 0) + l.nbLogements; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([nom]) => nom);
  }, [logements]);

  /** Available arrondissements */
  const arrondissements = useMemo(
    () => [...new Set(logements.map(l => l.arrondissement))].sort((a, b) => a - b),
    [logements],
  );

  /** Available years */
  const years = useMemo(
    () => [...new Set(logements.map(l => l.annee))].sort((a, b) => b - a),
    [logements],
  );

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      {/* Recherche */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Rechercher</label>
        <input
          type="text"
          value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Adresse, bailleur..."
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Bailleur */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Bailleur</label>
        <select
          value={filters.bailleur || ''}
          onChange={e => onFiltersChange({ ...filters, bailleur: e.target.value || null })}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
        >
          <option value="">Tous les bailleurs</option>
          {bailleurs.slice(0, 30).map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Arrondissement + Année */}
      <div className={isVertical ? 'space-y-4' : ''}>
        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Arrondissement</label>
          <select
            value={filters.arrondissement ?? ''}
            onChange={e => onFiltersChange({ ...filters, arrondissement: e.target.value ? Number(e.target.value) : null })}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Tous</option>
            {arrondissements.map(a => (
              <option key={a} value={a}>{a === 0 ? 'Paris Centre' : `${a}e`}</option>
            ))}
          </select>
        </div>

        <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : 'mt-3'}>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Année</label>
          <select
            value={filters.annee ?? ''}
            onChange={e => onFiltersChange({ ...filters, annee: e.target.value ? Number(e.target.value) : null })}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Toutes les années</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Choropleth toggle (map only) */}
        {isVertical && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showChoropleth}
                onChange={e => onFiltersChange({ ...filters, showChoropleth: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-300">Vue par habitant (choroplèthe)</span>
            </label>
          </div>
        )}
      </div>

      {/* Reset */}
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

export default function LogementsExplorerTab({
  logements,
  arrondissementStats,
  allArrondissements: _allArrondissements,
  isLoading,
}: LogementsExplorerTabProps) {
  const isMobile = useIsMobile(BREAKPOINTS.lg);

  const [viewMode, setViewMode] = useState<ViewMode>('carte');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  /** Filter logements */
  const filteredLogements = useMemo(() => {
    let result = logements;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(l =>
        l.adresse.toLowerCase().includes(s) ||
        l.bailleur.toLowerCase().includes(s),
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

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const filterProps = {
    filters,
    onFiltersChange: setFilters,
    logements,
    activeFilterCount,
    onReset: resetFilters,
  };

  // ── Content ──
  const ContentView = isLoading ? (
    <div className="h-64 flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ) : viewMode === 'liste' ? (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Adresse</th>
              <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Bailleur</th>
              <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Logements</th>
              <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-blue-400 uppercase">PLAI</th>
              <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-cyan-400 uppercase">PLUS</th>
              <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-violet-400 uppercase">PLS</th>
              <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Année</th>
              <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Arr.</th>
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
                  {l.arrondissement === 0 ? 'Centre' : `${l.arrondissement}e`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredLogements.length > 100 && (
        <div className="px-4 py-3 border-t border-slate-700 text-center">
          <p className="text-sm text-slate-500">100 premiers sur {formatNumber(filteredLogements.length)}</p>
        </div>
      )}
      {filteredLogements.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="text-slate-400">Aucun programme ne correspond aux filtres</p>
        </div>
      )}
    </div>
  ) : (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden" style={{ height: 600 }}>
      <LogementsSociauxMap
        logements={filteredLogements}
        arrondissementStats={arrondissementStats}
        showChoropleth={filters.showChoropleth}
        isLoading={isLoading}
        selectedBailleur={filters.bailleur}
      />
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-slate-100">
          {formatNumber(filteredLogements.length)} programmes
          <span className="text-sm font-normal text-slate-400 ml-2">
            ({formatNumber(totalLogements)} logements)
          </span>
        </h3>

        {/* Toggle Liste / Carte */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 hidden sm:inline">Visualisation :</span>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={() => setViewMode('liste')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'liste'
                  ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Liste
            </button>
            <button
              onClick={() => setViewMode('carte')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'carte'
                  ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Carte
            </button>
          </div>
        </div>
      </div>

      {/* Mobile : collapsible filters */}
      {isMobile && (
        <>
          <button
            onClick={() => setMobileFiltersOpen(prev => !prev)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all border mb-4 ${
              mobileFiltersOpen
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : activeFilterCount > 0
                  ? 'bg-emerald-500/5 text-emerald-300/80 border-emerald-500/20 hover:border-emerald-500/40'
                  : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 transition-transform ${mobileFiltersOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>
                {activeFilterCount > 0
                  ? `Filtres (${activeFilterCount} actif${activeFilterCount > 1 ? 's' : ''})`
                  : 'Filtrer les programmes'}
              </span>
            </div>
            <svg className={`w-4 h-4 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mobileFiltersOpen && (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 mb-4">
              <FilterPanel {...filterProps} layout="inline" />
            </div>
          )}
          {ContentView}
        </>
      )}

      {/* Desktop : sidebar + content */}
      {!isMobile && (
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-1">
            <FilterPanel {...filterProps} layout="sidebar" />
          </div>
          <div className="col-span-3">
            {ContentView}
          </div>
        </div>
      )}
    </div>
  );
}
