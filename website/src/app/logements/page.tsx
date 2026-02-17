'use client';

/**
 * Page /logements — Logements sociaux financés à Paris.
 *
 * Architecture à 3 onglets :
 *   - Annuel (défaut) : Treemap + KPIs + classement programmes (via shared AnnuelTab)
 *   - Tendances : Évolution multi-années (stacked bar PLAI/PLUS/PLS + variation arrondissements)
 *   - Explorer : Liste + Carte avec filtres collapsibles et toggle vue
 *
 * Sources : /public/data/map/logements_sociaux.json, arrondissements_stats.json
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import type { LogementSocial, ArrondissementStats } from '@/lib/types/map';
import { loadLogementsSociaux, loadArrondissementsStats } from '@/lib/api/staticData';
import { formatNumber } from '@/lib/formatters';
import { DATA_SOURCES } from '@/lib/constants/arrondissements';
import LogementsAnnuelTab from '@/components/logements/LogementsAnnuelTab';
import LogementsTendancesTab from '@/components/logements/LogementsTendancesTab';
import LogementsExplorerTab from '@/components/logements/LogementsExplorerTab';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const LOGEMENTS_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '📊' },
  { id: 'tendances', label: 'Tendances', icon: '📈' },
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
];

const VALID_TAB_IDS = LOGEMENTS_TABS.map(t => t.id);

// ─── Inner component ─────────────────────────────────────────────────────────

function LogementsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [allLogements, setAllLogements] = useState<LogementSocial[]>([]);
  const [arrondissementsStats, setArrondissementsStats] = useState<ArrondissementStats[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load data ──
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [log, arr] = await Promise.all([loadLogementsSociaux(), loadArrondissementsStats()]);
        setAllLogements(log);
        setArrondissementsStats(arr);
        // Set most recent year as default
        const years = [...new Set(log.map(l => l.annee))].sort((a, b) => b - a);
        if (years.length > 0) setSelectedYear(years[0]);
      } catch (err) {
        console.error('Error:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  /** Available years (descending) */
  const availableYears = useMemo(
    () => [...new Set(allLogements.map(l => l.annee))].sort((a, b) => b - a),
    [allLogements],
  );

  /** Logements filtrés par année */
  const filteredLogements = useMemo(
    () => allLogements.filter(l => l.annee === selectedYear),
    [allLogements, selectedYear],
  );

  /** All arrondissement codes */
  const arrondissements = useMemo(
    () => [...new Set(allLogements.map(l => l.arrondissement))].sort((a, b) => a - b),
    [allLogements],
  );

  /** Stats summary for header */
  const totalLogements = useMemo(
    () => filteredLogements.reduce((s, l) => s + l.nbLogements, 0),
    [filteredLogements],
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title="Logements Sociaux"
            description={`${formatNumber(totalLogements)} logements financés en ${selectedYear}`}
            actions={
              activeTab !== 'tendances' ? (
                <YearSelector
                  years={availableYears}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                />
              ) : undefined
            }
          />
          <div className="mt-5">
            <TabBar tabs={LOGEMENTS_TABS} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2"><span>⚠</span>{error}</p>
          </div>
        )}

        {/* ── Tab Annuel ── */}
        {activeTab === 'annuel' && (
          <LogementsAnnuelTab
            logements={filteredLogements}
            selectedYear={selectedYear}
            isLoading={false}
            onNavigateExplorer={() => setActiveTab('explorer')}
          />
        )}

        {/* ── Tab Tendances ── */}
        {activeTab === 'tendances' && (
          <LogementsTendancesTab allLogements={allLogements} />
        )}

        {/* ── Tab Explorer ── */}
        {activeTab === 'explorer' && (
          <LogementsExplorerTab
            logements={filteredLogements}
            arrondissementStats={arrondissementsStats}
            allArrondissements={arrondissements}
            isLoading={isLoading}
          />
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">Sources des données</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <a href={DATA_SOURCES.logementsSociaux.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.logementsSociaux.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.logementsSociaux.description}</p>
                </div>
              </a>
              <a href={DATA_SOURCES.population.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.population.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.population.description}</p>
                </div>
              </a>
              <a href={DATA_SOURCES.arrondissements.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.arrondissements.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.arrondissements.description}</p>
                </div>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function LogementsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LogementsPageInner />
    </Suspense>
  );
}
