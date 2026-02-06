'use client';

/**
 * Page /subventions — Bénéficiaires de subventions de la Ville de Paris.
 *
 * Architecture par entité avec 2 tabs :
 * - Annuel (défaut) : Treemap thématique + KPIs + table filtrable bénéficiaires
 * - Tendances : Évolution des montants et nb bénéficiaires par année
 *
 * Sources : /public/data/subventions/{index,treemap,beneficiaires}.json
 */

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import DataQualityBanner from '@/components/DataQualityBanner';
import SubventionsTreemap, { type TreemapData } from '@/components/SubventionsTreemap';
import SubventionsFilters, { type SubventionFilters, DEFAULT_FILTERS } from '@/components/SubventionsFilters';
import SubventionsTable, { type Beneficiaire } from '@/components/SubventionsTable';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubventionsIndex {
  generated_at: string;
  source: string;
  available_years: number[];
  totals_by_year: Record<string, { montant_total: number; nb_subventions: number }>;
  filters: {
    thematiques: string[];
    natures_juridiques: string[];
    directions: string[];
  };
}

interface TreemapResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_thematiques: number;
  data: TreemapData['data'];
}

interface BeneficiairesResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_beneficiaires: number;
  data: Beneficiaire[];
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const SUBVENTIONS_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '🎨' },
  { id: 'tendances', label: 'Tendances', icon: '📈' },
];

const VALID_TAB_IDS = SUBVENTIONS_TABS.map(t => t.id);

// ─── Nature → type mapping ───────────────────────────────────────────────────

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

// ─── Tendances Tab ───────────────────────────────────────────────────────────

/** Simple evolution chart using index data */
function SubventionsTendancesContent({ index }: { index: SubventionsIndex }) {
  const years = index.available_years
    .filter(y => y !== 2020 && y !== 2021)
    .sort((a, b) => a - b);

  const totals = years.map(y => ({
    year: y,
    montant: index.totals_by_year[String(y)]?.montant_total || 0,
    nb: index.totals_by_year[String(y)]?.nb_subventions || 0,
  }));

  const avgMontant = totals.reduce((s, t) => s + t.montant, 0) / totals.length;
  const latestYear = totals[totals.length - 1];
  const firstYear = totals[0];
  const growthPct = firstYear && latestYear && firstYear.montant > 0
    ? ((latestYear.montant / firstYear.montant - 1) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <p className="text-sm text-slate-400 mb-6">
        Évolution des subventions — {years[0]}–{years[years.length - 1]}
        <span className="text-xs text-slate-500 ml-2">(hors 2020-2021, données absentes)</span>
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Dernier montant</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{formatEuroCompact(latestYear?.montant || 0)}</p>
          <p className="text-xs text-slate-400 mt-1">{latestYear?.year}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Moyenne</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(avgMontant)}</p>
          <p className="text-xs text-slate-400 mt-1">par an</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Variation totale</p>
          <p className={`text-2xl font-bold mt-1 ${Number(growthPct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {Number(growthPct) >= 0 ? '+' : ''}{growthPct}%
          </p>
          <p className="text-xs text-slate-400 mt-1">{firstYear?.year}→{latestYear?.year}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Nb subventions</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{formatNumber(latestYear?.nb || 0)}</p>
          <p className="text-xs text-slate-400 mt-1">{latestYear?.year}</p>
        </div>
      </div>

      {/* Simple bar chart with CSS */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Montant total par année</h2>
        <div className="space-y-3">
          {totals.map(t => {
            const maxMontant = Math.max(...totals.map(x => x.montant));
            const pct = maxMontant > 0 ? (t.montant / maxMontant) * 100 : 0;
            return (
              <div key={t.year} className="flex items-center gap-3">
                <span className="text-sm text-slate-400 w-12 shrink-0">{t.year}</span>
                <div className="flex-1 bg-slate-700/30 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-purple-500/60 rounded-full flex items-center px-2 transition-all duration-500"
                    style={{ width: `${Math.max(pct, 5)}%` }}
                  >
                    <span className="text-xs text-white font-medium whitespace-nowrap">
                      {formatEuroCompact(t.montant)}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 w-20 text-right shrink-0">
                  {formatNumber(t.nb)} sub.
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Inner component ─────────────────────────────────────────────────────────

function SubventionsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<SubventionsIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [treemapData, setTreemapData] = useState<TreemapData | null>(null);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  const [filters, setFilters] = useState<SubventionFilters>(DEFAULT_FILTERS);
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Toggle between treemap overview and beneficiaires table */
  const [showTable, setShowTable] = useState(false);

  // Load index
  useEffect(() => {
    async function loadIndex() {
      try {
        const res = await fetch('/data/subventions/index.json');
        if (!res.ok) throw new Error("Impossible de charger l'index");
        const data: SubventionsIndex = await res.json();
        setIndex(data);
        if (data.available_years.length > 0) setSelectedYear(data.available_years[0]);
      } catch (err) {
        console.error('Error loading index:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoadingIndex(false);
      }
    }
    loadIndex();
  }, []);

  // Load year data
  useEffect(() => {
    async function loadYearData() {
      if (!index) return;
      setIsLoadingData(true);
      setError(null);
      try {
        const [treemapRes, beneficiairesRes] = await Promise.all([
          fetch(`/data/subventions/treemap_${selectedYear}.json`),
          fetch(`/data/subventions/beneficiaires_${selectedYear}.json`),
        ]);
        if (!treemapRes.ok || !beneficiairesRes.ok) throw new Error(`Données ${selectedYear} non disponibles`);
        const treemap: TreemapResponse = await treemapRes.json();
        const benefs: BeneficiairesResponse = await beneficiairesRes.json();
        setTreemapData({ year: treemap.year, total_montant: treemap.total_montant, nb_thematiques: treemap.nb_thematiques, data: treemap.data });
        setBeneficiaires(benefs.data);
        setFilters(DEFAULT_FILTERS);
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setTreemapData(null);
        setBeneficiaires([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadYearData();
  }, [index, selectedYear]);

  const handleThematiqueClick = useCallback((thematique: string | null) => {
    setFilters(prev => ({ ...prev, thematique }));
    // When clicking a treemap tile, switch to table view to show details
    if (thematique) setShowTable(true);
  }, []);

  const availableDirections = useMemo(() => index?.filters?.directions || [], [index]);

  const stats = useMemo(() => {
    const total = beneficiaires.length;
    const montantTotal = beneficiaires.reduce((sum, b) => sum + b.montant_total, 0);
    let filtered = beneficiaires;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(b => b.beneficiaire.toLowerCase().includes(search) || (b.siret && b.siret.includes(search)));
    }
    if (filters.thematique) filtered = filtered.filter(b => b.thematique === filters.thematique);
    if (filters.typesOrganisme.length > 0) {
      filtered = filtered.filter(b => {
        const type = NATURE_TO_TYPE[b.nature_juridique || ''] || 'autre';
        return filters.typesOrganisme.includes(type);
      });
    }
    if (filters.directions.length > 0) filtered = filtered.filter(b => b.direction && filters.directions.includes(b.direction));
    if (filters.montantMin > 0) filtered = filtered.filter(b => b.montant_total >= filters.montantMin);
    if (filters.montantMax > 0) filtered = filtered.filter(b => b.montant_total <= filters.montantMax);
    const montantFiltered = filtered.reduce((sum, b) => sum + b.montant_total, 0);
    return { total, filtered: filtered.length, montantTotal, montantFiltered };
  }, [beneficiaires, filters]);

  /** Top beneficiary and top thematique */
  const topKpis = useMemo(() => {
    if (beneficiaires.length === 0) return null;
    const sorted = [...beneficiaires].sort((a, b) => b.montant_total - a.montant_total);
    const topBenef = sorted[0];
    // Group by thematique for top thematique
    const themaMap: Record<string, number> = {};
    beneficiaires.forEach(b => {
      themaMap[b.thematique] = (themaMap[b.thematique] || 0) + b.montant_total;
    });
    const topThema = Object.entries(themaMap).sort(([, a], [, b]) => b - a)[0];
    // Median subvention
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)].montant_total : 0;
    return { topBenef, topThema, median };
  }, [beneficiaires]);

  if (isLoadingIndex || !index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement des subventions...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            icon="💰"
            title="Subventions"
            description="Explorer les bénéficiaires de subventions par thématique et filtres"
            actions={activeTab !== 'tendances' ? (
              <YearSelector years={index.available_years} selectedYear={selectedYear} onYearChange={setSelectedYear} />
            ) : undefined}
          />
          <div className="mt-5">
            <TabBar tabs={SUBVENTIONS_TABS} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── Tab Annuel (fusionné avec Explorer) ── */}
        {activeTab === 'annuel' && (
          <div>
            <DataQualityBanner dataset="subventions" year={selectedYear} />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                <p className="text-red-400 flex items-center gap-2"><span>⚠️</span>{error}</p>
              </div>
            )}

            {/* KPI cards - 2 rows */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total {selectedYear}</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(treemapData?.total_montant || 0)}</p>
                <p className="text-xs text-slate-500 mt-1">{formatNumber(index.totals_by_year[String(selectedYear)]?.nb_subventions || 0)} subventions</p>
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
                <p className="text-2xl font-bold text-slate-100 mt-1">{topKpis ? formatEuroCompact(topKpis.median) : '—'}</p>
                <p className="text-xs text-slate-500 mt-1">montant par bénéficiaire</p>
              </div>
            </div>

            {/* View toggle: Treemap / Table */}
            <div className="flex items-center justify-between mb-4">
              <div className="inline-flex rounded-lg bg-slate-800/80 p-0.5 sm:p-1 border border-slate-700/50">
                <button
                  onClick={() => setShowTable(false)}
                  className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
                    ${!showTable ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-slate-400 hover:text-slate-200 active:bg-slate-700/50'}
                  `}
                >
                  <span className="sm:hidden">Carte</span>
                  <span className="hidden sm:inline">Carte thématique</span>
                </button>
                <button
                  onClick={() => setShowTable(true)}
                  className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
                    ${showTable ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-slate-400 hover:text-slate-200 active:bg-slate-700/50'}
                  `}
                >
                  <span className="sm:hidden">Liste</span>
                  <span className="hidden sm:inline">Liste bénéficiaires</span>
                </button>
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
                {isLoadingData ? (
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
                  <SubventionsTable data={beneficiaires} filters={filters} isLoading={isLoadingData} pageSize={50} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Tendances ── */}
        {activeTab === 'tendances' && <SubventionsTendancesContent index={index} />}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>Données : Open Data Paris — Subventions associations votées</p>
            <p>Années avec données complètes : {index.available_years.filter(y => y !== 2020 && y !== 2021).join(', ')}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function SubventionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SubventionsPageInner />
    </Suspense>
  );
}
