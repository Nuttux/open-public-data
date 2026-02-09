'use client';

/**
 * SubventionsAnnuelTab — Onglet "Annuel" de /subventions.
 *
 * Affiche :
 *   - KPI cards : total montant, nb bénéficiaires, top bénéficiaire, médiane
 *   - Toggle Treemap / Table (carte thématique ↔ liste bénéficiaires)
 *   - Treemap ECharts avec sélection thématique
 *   - Table bénéficiaires avec filtres sidebar (si vue table active)
 *
 * Sources : données chargées par le parent et transmises en props.
 */

import { useState, useMemo, useCallback } from 'react';
import DataQualityBanner from '@/components/DataQualityBanner';
import SubventionsTreemap, { type TreemapData } from '@/components/SubventionsTreemap';
import SubventionsFilters, { type SubventionFilters, DEFAULT_FILTERS } from '@/components/SubventionsFilters';
import SubventionsTable, { type Beneficiaire } from '@/components/SubventionsTable';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mapping nature juridique → type organisme simplifié */
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

interface SubventionsAnnuelTabProps {
  /** Année sélectionnée */
  selectedYear: number;
  /** Données treemap */
  treemapData: TreemapData | null;
  /** Liste des bénéficiaires */
  beneficiaires: Beneficiaire[];
  /** Directions disponibles pour les filtres */
  availableDirections: string[];
  /** Nombre total de subventions (depuis l'index) */
  nbSubventions: number;
  /** Chargement en cours */
  isLoading: boolean;
  /** Erreur éventuelle */
  error: string | null;
  /** Callback pour naviguer vers l'Explorer */
  onNavigateExplorer?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsAnnuelTab({
  selectedYear,
  treemapData,
  beneficiaires,
  availableDirections,
  nbSubventions,
  isLoading,
  error,
  onNavigateExplorer,
}: SubventionsAnnuelTabProps) {
  const [filters, setFilters] = useState<SubventionFilters>(DEFAULT_FILTERS);
  const [showTable, setShowTable] = useState(false);

  /** Clic sur treemap → filtre par thématique et bascule en vue table */
  const handleThematiqueClick = useCallback((thematique: string | null) => {
    setFilters(prev => ({ ...prev, thematique }));
    if (thematique) setShowTable(true);
  }, []);

  /** Stats filtrées pour le sidebar */
  const stats = useMemo(() => {
    const total = beneficiaires.length;
    const montantTotal = beneficiaires.reduce((sum, b) => sum + b.montant_total, 0);
    let filtered = beneficiaires;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(b =>
        b.beneficiaire.toLowerCase().includes(search) ||
        (b.siret && b.siret.includes(search)),
      );
    }
    if (filters.thematique) filtered = filtered.filter(b => b.thematique === filters.thematique);
    if (filters.typesOrganisme.length > 0) {
      filtered = filtered.filter(b => {
        const type = NATURE_TO_TYPE[b.nature_juridique || ''] || 'autre';
        return filters.typesOrganisme.includes(type);
      });
    }
    if (filters.directions.length > 0) {
      filtered = filtered.filter(b => b.direction && filters.directions.includes(b.direction));
    }
    if (filters.montantMin > 0) filtered = filtered.filter(b => b.montant_total >= filters.montantMin);
    if (filters.montantMax > 0) filtered = filtered.filter(b => b.montant_total <= filters.montantMax);
    const montantFiltered = filtered.reduce((sum, b) => sum + b.montant_total, 0);
    return { total, filtered: filtered.length, montantTotal, montantFiltered };
  }, [beneficiaires, filters]);

  /** Top bénéficiaire + médiane */
  const topKpis = useMemo(() => {
    if (beneficiaires.length === 0) return null;
    const sorted = [...beneficiaires].sort((a, b) => b.montant_total - a.montant_total);
    const topBenef = sorted[0];
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)].montant_total : 0;
    return { topBenef, median };
  }, [beneficiaires]);

  return (
    <div>
      <DataQualityBanner dataset="subventions" year={selectedYear} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400 flex items-center gap-2"><span>⚠</span>{error}</p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total {selectedYear}</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {formatEuroCompact(treemapData?.total_montant || 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {formatNumber(nbSubventions)} subventions
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Bénéficiaires</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{formatNumber(stats.total)}</p>
          <p className="text-xs text-slate-500 mt-1">{treemapData?.nb_thematiques || 0} thématiques</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Top bénéficiaire</p>
          <p className="text-lg font-bold text-amber-400 mt-1 truncate" title={topKpis?.topBenef?.beneficiaire}>
            {topKpis?.topBenef ? formatEuroCompact(topKpis.topBenef.montant_total) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate" title={topKpis?.topBenef?.beneficiaire}>
            {topKpis?.topBenef?.beneficiaire?.slice(0, 30) || '—'}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Subvention médiane</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {topKpis ? formatEuroCompact(topKpis.median) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">montant par bénéficiaire</p>
        </div>
      </div>

      {/* View toggle: Treemap / Table — unified affordance style */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 hidden sm:inline">Vue :</span>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={() => setShowTable(false)}
              className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                !showTable
                  ? 'bg-purple-500/20 text-purple-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <span>🎯</span>
              <span className="sm:hidden">Carte</span>
              <span className="hidden sm:inline">Carte thématique</span>
            </button>
            <button
              onClick={() => setShowTable(true)}
              className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                showTable
                  ? 'bg-purple-500/20 text-purple-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="sm:hidden">Liste</span>
              <span className="hidden sm:inline">Liste bénéficiaires</span>
            </button>
          </div>
        </div>
        {showTable && (
          <p className="text-xs text-slate-500 hidden sm:block">
            {formatNumber(stats.filtered)} bénéficiaires · {formatEuroCompact(stats.montantFiltered)}
          </p>
        )}
      </div>

      {/* Treemap view */}
      {!showTable && (
        <>
          {isLoading ? (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 h-[400px] flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : treemapData ? (
            <SubventionsTreemap
              data={treemapData}
              onThematiqueClick={handleThematiqueClick}
              selectedThematique={filters.thematique}
              height={400}
            />
          ) : null}
          <p className="text-xs text-slate-500 mt-2 text-center">
            Cliquez sur une thématique pour voir ses bénéficiaires
          </p>
        </>
      )}

      {/* Table view with sidebar filters */}
      {showTable && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <SubventionsFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableDirections={availableDirections}
              stats={stats}
            />
          </div>
          <div className="lg:col-span-3">
            <SubventionsTable data={beneficiaires} filters={filters} isLoading={isLoading} pageSize={50} />
            {/* Link to Explorer */}
            {onNavigateExplorer && beneficiaires.length > 50 && (
              <div className="mt-3 text-center">
                <button
                  onClick={onNavigateExplorer}
                  className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Explorer tous les bénéficiaires →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
