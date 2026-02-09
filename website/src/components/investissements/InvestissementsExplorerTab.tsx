'use client';

/**
 * InvestissementsExplorerTab — Onglet "Explorer" de /investissements (Travaux).
 *
 * Layout responsive :
 *   - Desktop : filtres en sidebar gauche (toujours ouverts) + contenu à droite
 *   - Mobile : filtres collapsibles au-dessus du contenu
 *
 * Toggle entre vue Liste et vue Carte.
 * Les filtres sont partagés entre les deux vues.
 */

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { AutorisationProgramme } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

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

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'liste' | 'carte';

const THEMATIQUES = [
  'education', 'sport', 'culture', 'environnement', 'mobilite',
  'logement', 'social', 'democratie', 'urbanisme', 'autre',
] as const;

interface InvestissementsExplorerTabProps {
  /** Tous les projets de l'année (non filtrés) */
  projets: AutorisationProgramme[];
  /** Chargement en cours */
  isLoading: boolean;
}

// ─── Filter panel (shared between desktop sidebar and mobile collapsible) ────

function FilterPanel({
  searchTerm,
  onSearchChange,
  selectedArrondissement,
  onArrondissementChange,
  selectedThematiques,
  onToggleThematique,
  projets,
  activeFilterCount,
  onReset,
  layout,
}: {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  selectedArrondissement: number | null;
  onArrondissementChange: (v: number | null) => void;
  selectedThematiques: string[];
  onToggleThematique: (t: string) => void;
  projets: AutorisationProgramme[];
  activeFilterCount: number;
  onReset: () => void;
  /** "sidebar" = vertical stack, "inline" = horizontal grid */
  layout: 'sidebar' | 'inline';
}) {
  const isVertical = layout === 'sidebar';

  return (
    <div className={isVertical ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      {/* Recherche */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Rechercher</label>
        <input
          type="text"
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Nom du projet..."
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Arrondissement */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Arrondissement</label>
        <select
          value={selectedArrondissement ?? ''}
          onChange={e => onArrondissementChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
        >
          <option value="">Tous</option>
          <option value="0">Paris Centre (1-4)</option>
          {Array.from({ length: 16 }, (_, i) => i + 5).map(arr => (
            <option key={arr} value={arr}>{arr}e</option>
          ))}
        </select>
      </div>

      {/* Thématiques */}
      <div className={isVertical ? 'bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4' : ''}>
        <label className="block text-xs font-medium text-slate-400 mb-2">Thématiques</label>
        <div className={isVertical ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
          {THEMATIQUES.map(t => {
            const label = THEMATIQUE_LABELS[t as ThematiqueSubvention];
            const isSelected = selectedThematiques.includes(t);
            const count = projets.filter(p => p.thematique === t).length;
            return (
              <button
                key={t}
                onClick={() => onToggleThematique(t)}
                className={`${isVertical ? 'w-full flex items-center justify-between px-3 py-2' : 'px-2 py-1'} rounded-md text-${isVertical ? 'sm' : '[11px]'} font-medium transition-all ${
                  isSelected
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>{label?.icon || '📋'}</span>
                  <span>{label?.label || t}</span>
                </span>
                {isVertical && <span className="text-xs opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset */}
      {activeFilterCount > 0 && (
        <div className={isVertical ? '' : 'sm:col-span-3 flex justify-end pt-2 border-t border-slate-700/50'}>
          <button
            onClick={onReset}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Réinitialiser les filtres ({activeFilterCount})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvestissementsExplorerTab({
  projets,
  isLoading,
}: InvestissementsExplorerTabProps) {
  const isMobile = useIsMobile(BREAKPOINTS.lg);

  // ── State ──
  const [viewMode, setViewMode] = useState<ViewMode>('liste');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [selectedThematiques, setSelectedThematiques] = useState<string[]>([]);

  // ── Filtering ──
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

  const toggleThematique = (t: string) =>
    setSelectedThematiques(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedArrondissement(null);
    setSelectedThematiques([]);
  };

  // ── Shared filter props ──
  const filterProps = {
    searchTerm,
    onSearchChange: setSearchTerm,
    selectedArrondissement,
    onArrondissementChange: setSelectedArrondissement,
    selectedThematiques,
    onToggleThematique: toggleThematique,
    projets,
    activeFilterCount,
    onReset: resetFilters,
  };

  // ── Content (table or map) ──
  const ContentView = isLoading ? (
    <div className="h-64 flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ) : viewMode === 'liste' ? (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projet</th>
              <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Chapitre</th>
              <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Montant</th>
              <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Arr.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {sortedProjets.slice(0, 100).map((p, i) => {
              const label = THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention];
              return (
                <tr key={p.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-2 md:px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span>
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
                          {p.arrondissement === 0 ? 'Centre' : `${p.arrondissement}e`}
                        </span>
                      : <span className="text-slate-500">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sortedProjets.length > 100 && (
        <div className="px-4 py-3 border-t border-slate-700 text-center">
          <p className="text-sm text-slate-500">100 premiers sur {formatNumber(sortedProjets.length)}</p>
        </div>
      )}
      {sortedProjets.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="text-slate-400">Aucun projet ne correspond aux filtres</p>
        </div>
      )}
    </div>
  ) : (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden" style={{ height: 550 }}>
      <InvestissementsMap projets={filteredProjets} isLoading={false} />
    </div>
  );

  // ── Render ──

  return (
    <div>
      {/* Toolbar : résumé + toggle visualisation */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-slate-100">
          {formatNumber(filteredProjets.length)} projets
          <span className="text-sm font-normal text-slate-400 ml-2">
            ({formatEuroCompact(filteredMontant)})
          </span>
        </h3>

        {/* Toggle Visualisation */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 hidden sm:inline">Visualisation :</span>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={() => setViewMode('liste')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'liste'
                  ? 'bg-amber-500/20 text-amber-300 shadow-sm'
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
                  ? 'bg-amber-500/20 text-amber-300 shadow-sm'
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

      {/* ── Mobile : bouton toggle filtres + panneau collapsible ── */}
      {isMobile && (
        <>
          <button
            onClick={() => setMobileFiltersOpen(prev => !prev)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all border mb-4 ${
              mobileFiltersOpen
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : activeFilterCount > 0
                  ? 'bg-amber-500/5 text-amber-300/80 border-amber-500/20 hover:border-amber-500/40'
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
                  : 'Filtrer les projets'}
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

      {/* ── Desktop : sidebar filtres (toujours ouverte) + contenu ── */}
      {!isMobile && (
        <div className="grid grid-cols-4 gap-6">
          {/* Sidebar filtres */}
          <div className="col-span-1">
            <FilterPanel {...filterProps} layout="sidebar" />
          </div>
          {/* Contenu */}
          <div className="col-span-3">
            {ContentView}
          </div>
        </div>
      )}
    </div>
  );
}
