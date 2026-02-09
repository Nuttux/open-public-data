'use client';

/**
 * Page /logements — Logements sociaux financés à Paris.
 *
 * Architecture à 3 onglets :
 *   - Annuel (défaut) : Stats + classement bailleurs/arrondissements + légende types
 *   - Tendances : Évolution multi-années (stacked bar PLAI/PLUS/PLS + variation arrondissements)
 *   - Explorer : Liste + Carte avec filtres collapsibles et toggle vue
 *
 * Sources : /public/data/map/logements_sociaux.json, arrondissements_stats.json
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import type { LogementSocial, ArrondissementStats } from '@/lib/types/map';
import { loadLogementsSociaux, loadArrondissementsStats } from '@/lib/api/staticData';
import { formatNumber } from '@/lib/formatters';
import { DATA_SOURCES } from '@/lib/constants/arrondissements';
import LogementsAnnuelTab from '@/components/logements/LogementsAnnuelTab';
import LogementsTendancesTab from '@/components/logements/LogementsTendancesTab';
import LogementsExplorerTab from '@/components/logements/LogementsExplorerTab';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const LOGEMENTS_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '🏢' },
  { id: 'tendances', label: 'Tendances', icon: '📈' },
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
];

const VALID_TAB_IDS = LOGEMENTS_TABS.map(t => t.id);

// ─── Inner component ─────────────────────────────────────────────────────────

function LogementsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [logements, setLogements] = useState<LogementSocial[]>([]);
  const [arrondissementsStats, setArrondissementsStats] = useState<ArrondissementStats[]>([]);
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load data ──
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [log, arr] = await Promise.all([loadLogementsSociaux(), loadArrondissementsStats()]);
        setLogements(log);
        setArrondissementsStats(arr);
      } catch (err) {
        console.error('Error:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  /** Logements filtrés par arrondissement (pour Annuel tab) */
  const filteredLogements = useMemo(
    () => selectedArrondissement === null ? logements : logements.filter(l => l.arrondissement === selectedArrondissement),
    [logements, selectedArrondissement],
  );

  /** Stats globaux */
  const stats = useMemo(() => {
    const totalLog = filteredLogements.reduce((s, l) => s + l.nbLogements, 0);
    const totalPLAI = filteredLogements.reduce((s, l) => s + (l.nbPLAI || 0), 0);
    const totalPLUS = filteredLogements.reduce((s, l) => s + (l.nbPLUS || 0), 0);
    const totalPLS = filteredLogements.reduce((s, l) => s + (l.nbPLS || 0), 0);
    const bailleurs = new Set(filteredLogements.map(l => l.bailleur)).size;
    return { projets: filteredLogements.length, logements: totalLog, PLAI: totalPLAI, PLUS: totalPLUS, PLS: totalPLS, bailleurs };
  }, [filteredLogements]);

  /** All arrondissement codes */
  const arrondissements = useMemo(
    () => [...new Set(logements.map(l => l.arrondissement))].sort((a, b) => a - b),
    [logements],
  );

  /** Navigate to Explorer with bailleur selected */
  const handleViewBailleurOnMap = (bailleur: string) => {
    // The Explorer tab handles its own bailleur filter
    void bailleur;
    setActiveTab('explorer');
  };

  // ── Loading ──
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
            description={`${formatNumber(stats.logements)} logements financés par ${stats.bailleurs} bailleurs`}
            actions={
              activeTab === 'annuel' ? (
                <select
                  value={selectedArrondissement ?? ''}
                  onChange={e => setSelectedArrondissement(e.target.value ? Number(e.target.value) : null)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Tous les arrondissements</option>
                  {arrondissements.map(a => (
                    <option key={a} value={a}>{a === 0 ? 'Paris Centre' : `${a}ème`}</option>
                  ))}
                </select>
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
            selectedArrondissement={selectedArrondissement}
            stats={stats}
            onViewBailleurOnMap={handleViewBailleurOnMap}
          />
        )}

        {/* ── Tab Tendances ── */}
        {activeTab === 'tendances' && (
          <LogementsTendancesTab allLogements={logements} />
        )}

        {/* ── Tab Explorer ── */}
        {activeTab === 'explorer' && (
          <LogementsExplorerTab
            logements={logements}
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
