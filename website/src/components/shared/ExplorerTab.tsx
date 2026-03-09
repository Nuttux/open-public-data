'use client';

/**
 * ExplorerTab — Composant partagé pour les onglets "Explorer".
 *
 * Utilisé par Subventions, Investissements et Logements.
 *
 * Pattern :
 *   1. Toolbar : résumé items + toggle Liste/Carte/Arrondissements
 *   2. Mobile : filtres collapsibles
 *   3. Desktop : sidebar filtres + contenu principal
 *
 * Le contenu (table, carte) et les filtres sont fournis par les wrappers.
 */

import { useState, type ReactNode } from 'react';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import { useT } from '@/lib/localeContext';

// ─── Theme ───────────────────────────────────────────────────────────────────

type ThemeColor = 'purple' | 'amber' | 'emerald' | 'teal';

const THEME = {
  purple: {
    spinner: 'border-purple-500',
    activeBtn: 'bg-purple-500/20 text-purple-300 shadow-sm',
    filterOpen: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    filterActive: 'bg-purple-500/5 text-purple-300/80 border-purple-500/20 hover:border-purple-500/40',
  },
  amber: {
    spinner: 'border-amber-500',
    activeBtn: 'bg-amber-500/20 text-amber-300 shadow-sm',
    filterOpen: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    filterActive: 'bg-amber-500/5 text-amber-300/80 border-amber-500/20 hover:border-amber-500/40',
  },
  emerald: {
    spinner: 'border-emerald-500',
    activeBtn: 'bg-emerald-500/20 text-emerald-300 shadow-sm',
    filterOpen: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    filterActive: 'bg-emerald-500/5 text-emerald-300/80 border-emerald-500/20 hover:border-emerald-500/40',
  },
  teal: {
    spinner: 'border-teal-500',
    activeBtn: 'bg-teal-500/20 text-teal-300 shadow-sm',
    filterOpen: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    filterActive: 'bg-teal-500/5 text-teal-300/80 border-teal-500/20 hover:border-teal-500/40',
  },
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'liste' | 'carte' | 'arrondissements';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ExplorerTabProps {
  /** Summary line, e.g. "123 projets (4.5 M€)" */
  summaryTitle: ReactNode;
  theme: ThemeColor;

  /** Render function for filter panel — receives layout mode */
  filterPanel: (layout: 'sidebar' | 'inline') => ReactNode;
  activeFilterCount: number;
  /** Label for the mobile filter button, e.g. "les projets" */
  filterLabel: string;

  /** List/table content */
  listView: ReactNode;
  /** If provided, shows a Liste/Carte toggle */
  mapView?: ReactNode;
  /** Choropleth by arrondissement — if provided, adds a 3rd "Arrondissements" toggle */
  arrondissementView?: ReactNode;
  /** Default view (default: 'liste') */
  defaultView?: ViewMode;
  /** Optional export bar rendered below the toolbar */
  exportBar?: ReactNode;

  isLoading: boolean;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const ListIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const MapIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

const ArrIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

const FilterIcon = ({ open }: { open: boolean }) => (
  <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExplorerTab({
  summaryTitle, theme,
  filterPanel, activeFilterCount, filterLabel,
  listView, mapView, arrondissementView, defaultView = 'liste',
  exportBar,
  isLoading,
}: ExplorerTabProps) {
  const isMobile = useIsMobile(BREAKPOINTS.lg);
  const tr = useT();
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const t = THEME[theme];

  const hasMap = !!mapView;
  const hasArr = !!arrondissementView;
  const hasToggle = hasMap || hasArr;

  // ── Content ──
  const ContentView = isLoading ? (
    <div className="h-64 flex items-center justify-center">
      <div className={`w-8 h-8 border-3 ${t.spinner} border-t-transparent rounded-full animate-spin`} />
    </div>
  ) : viewMode === 'arrondissements' && hasArr
    ? arrondissementView
    : viewMode === 'carte' && hasMap
      ? mapView
      : listView;

  return (
    <div>
      {/* Toolbar : summary + view toggle */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-slate-100">{summaryTitle}</h3>

        {hasToggle && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">{tr('ui.visualization')}</span>
            <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
              <button
                onClick={() => setViewMode('liste')}
                className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 sm:gap-1.5 ${
                  viewMode === 'liste' ? t.activeBtn : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <ListIcon /> {tr('ui.list')}
              </button>
              {hasMap && (
                <button
                  onClick={() => setViewMode('carte')}
                  className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 sm:gap-1.5 ${
                    viewMode === 'carte' ? t.activeBtn : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  <MapIcon /> {tr('ui.map')}
                </button>
              )}
              {hasArr && (
                <button
                  onClick={() => setViewMode('arrondissements')}
                  className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 sm:gap-1.5 ${
                    viewMode === 'arrondissements' ? t.activeBtn : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  <ArrIcon /> <span className="hidden sm:inline">{tr('ui.arrondissements')}</span><span className="sm:hidden">{tr('ui.arr_short')}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {exportBar && <div className="mb-4">{exportBar}</div>}

      {/* ── Mobile : collapsible filters + content ── */}
      {isMobile && (
        <>
          <button
            onClick={() => setMobileFiltersOpen(prev => !prev)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all border mb-4 ${
              mobileFiltersOpen
                ? t.filterOpen
                : activeFilterCount > 0
                  ? t.filterActive
                  : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <FilterIcon open={mobileFiltersOpen} />
              <span>
                {activeFilterCount > 0
                  ? tr('ui.filters_active').replace('{count}', String(activeFilterCount))
                  : tr('ui.filter_label').replace('{label}', filterLabel)}
              </span>
            </div>
            <ChevronIcon open={mobileFiltersOpen} />
          </button>
          {mobileFiltersOpen && (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 mb-4">
              {filterPanel('inline')}
            </div>
          )}
          {ContentView}
        </>
      )}

      {/* ── Desktop : sidebar filters + content ── */}
      {!isMobile && (
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-1">{filterPanel('sidebar')}</div>
          <div className="col-span-3">{ContentView}</div>
        </div>
      )}
    </div>
  );
}
