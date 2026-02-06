'use client';

/**
 * Page /logements — Logements sociaux financés à Paris.
 *
 * Architecture par entité avec 2 tabs :
 * - Annuel (défaut) : Stats + classement des bailleurs
 * - Carte : Carte choroplèthe / markers des logements
 *
 * Remplace l'ancien /carte.
 *
 * Sources : /public/data/map/logements_sociaux.json, arrondissements_stats.json
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import type { LogementSocial, ArrondissementStats } from '@/lib/types/map';
import { loadLogementsSociaux, loadArrondissementsStats } from '@/lib/api/staticData';
import { formatNumber } from '@/lib/formatters';
import { DATA_SOURCES } from '@/lib/constants/arrondissements';

// ─── Dynamic import ──────────────────────────────────────────────────────────

const LogementsSociauxMap = dynamic(
  () => import('@/components/map/LogementsSociauxMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

// ─── Tab definitions ─────────────────────────────────────────────────────────

const LOGEMENTS_TABS: Tab[] = [
  { id: 'annuel', label: 'Bailleurs', icon: '🏢' },
  { id: 'carte', label: 'Carte', icon: '🗺️' },
];

const VALID_TAB_IDS = LOGEMENTS_TABS.map(t => t.id);

interface BailleurStats {
  nom: string;
  nbProjets: number;
  nbLogements: number;
  nbPLAI: number;
  nbPLUS: number;
  nbPLS: number;
  arrondissements: number[];
}

// ─── Inner component ─────────────────────────────────────────────────────────

function LogementsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [logements, setLogements] = useState<LogementSocial[]>([]);
  const [arrondissementsStats, setArrondissementsStats] = useState<ArrondissementStats[]>([]);
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [selectedBailleur, setSelectedBailleur] = useState<string | null>(null);
  const [showChoropleth, setShowChoropleth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const filteredLogements = useMemo(() => selectedArrondissement === null ? logements : logements.filter(l => l.arrondissement === selectedArrondissement), [logements, selectedArrondissement]);
  const mapLogements = useMemo(() => { let f = filteredLogements; if (selectedBailleur) f = f.filter(l => l.bailleur === selectedBailleur); return f; }, [filteredLogements, selectedBailleur]);

  const topBailleurs = useMemo(() => {
    const b: Record<string, BailleurStats> = {};
    filteredLogements.forEach(l => {
      const nom = l.bailleur || '(non renseigné)';
      if (!b[nom]) b[nom] = { nom, nbProjets: 0, nbLogements: 0, nbPLAI: 0, nbPLUS: 0, nbPLS: 0, arrondissements: [] };
      b[nom].nbProjets++;
      b[nom].nbLogements += l.nbLogements;
      b[nom].nbPLAI += l.nbPLAI || 0;
      b[nom].nbPLUS += l.nbPLUS || 0;
      b[nom].nbPLS += l.nbPLS || 0;
      if (!b[nom].arrondissements.includes(l.arrondissement)) b[nom].arrondissements.push(l.arrondissement);
    });
    return Object.values(b).sort((a, b) => b.nbLogements - a.nbLogements);
  }, [filteredLogements]);

  const stats = useMemo(() => {
    const total = filteredLogements.length;
    const totalLog = filteredLogements.reduce((s, l) => s + l.nbLogements, 0);
    const totalPLAI = filteredLogements.reduce((s, l) => s + (l.nbPLAI || 0), 0);
    const totalPLUS = filteredLogements.reduce((s, l) => s + (l.nbPLUS || 0), 0);
    const totalPLS = filteredLogements.reduce((s, l) => s + (l.nbPLS || 0), 0);
    return { projets: total, logements: totalLog, PLAI: totalPLAI, PLUS: totalPLUS, PLS: totalPLS, bailleurs: topBailleurs.length };
  }, [filteredLogements, topBailleurs]);

  const arrondissements = useMemo(() => [...new Set(logements.map(l => l.arrondissement))].sort((a, b) => a - b), [logements]);

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
            icon="🏘️"
            title="Logements Sociaux"
            description={`${formatNumber(stats.logements)} logements financés par ${stats.bailleurs} bailleurs`}
            actions={
              <select
                value={selectedArrondissement ?? ''}
                onChange={e => { setSelectedArrondissement(e.target.value ? Number(e.target.value) : null); setSelectedBailleur(null); }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Tous les arrondissements</option>
                {arrondissements.map(a => <option key={a} value={a}>{a === 0 ? 'Paris Centre' : `${a}ème`}</option>)}
              </select>
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
            <p className="text-red-400 flex items-center gap-2"><span>⚠️</span>{error}</p>
          </div>
        )}

        {/* Stats — shared between tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Total Logements</p>
            <p className="text-xl md:text-2xl font-bold text-emerald-400 mt-1">{stats.logements >= 1000 ? `${(stats.logements / 1000).toFixed(0)}k` : formatNumber(stats.logements)}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Programmes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-100 mt-1">{formatNumber(stats.projets)}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLAI (très social)</p>
            <p className="text-xl md:text-2xl font-bold text-blue-400 mt-1">{stats.PLAI >= 1000 ? `${(stats.PLAI / 1000).toFixed(0)}k` : formatNumber(stats.PLAI)}</p>
            <p className="text-[10px] md:text-xs text-slate-500">{stats.logements > 0 ? ((stats.PLAI / stats.logements) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLUS (social)</p>
            <p className="text-xl md:text-2xl font-bold text-cyan-400 mt-1">{stats.PLUS >= 1000 ? `${(stats.PLUS / 1000).toFixed(0)}k` : formatNumber(stats.PLUS)}</p>
            <p className="text-[10px] md:text-xs text-slate-500">{stats.logements > 0 ? ((stats.PLUS / stats.logements) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4 col-span-2 sm:col-span-1">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLS (intermédiaire)</p>
            <p className="text-xl md:text-2xl font-bold text-violet-400 mt-1">{stats.PLS >= 1000 ? `${(stats.PLS / 1000).toFixed(0)}k` : formatNumber(stats.PLS)}</p>
            <p className="text-[10px] md:text-xs text-slate-500">{stats.logements > 0 ? ((stats.PLS / stats.logements) * 100).toFixed(0) : 0}%</p>
          </div>
        </div>

        {/* ── Tab Annuel: Bailleurs ── */}
        {activeTab === 'annuel' && (
          <>
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  🏢 Classement des Bailleurs
                  {selectedArrondissement !== null && <span className="text-sm font-normal text-slate-400">({selectedArrondissement === 0 ? 'Paris Centre' : `${selectedArrondissement}ème`})</span>}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase w-6 md:w-8">#</th>
                    <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Bailleur</th>
                    <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Logements</th>
                    <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projets</th>
                    <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-blue-400 uppercase">PLAI</th>
                    <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-cyan-400 uppercase">PLUS</th>
                    <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-violet-400 uppercase">PLS</th>
                    <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Part</th>
                    <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Action</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {topBailleurs.slice(0, 20).map((b, i) => {
                      const pct = (b.nbLogements / stats.logements) * 100;
                      const isSel = selectedBailleur === b.nom;
                      return (
                        <tr key={b.nom} className={`hover:bg-slate-700/30 transition-colors ${isSel ? 'bg-emerald-900/20' : ''}`}>
                          <td className="px-2 md:px-4 py-3 text-slate-500 text-sm">{i + 1}</td>
                          <td className="px-2 md:px-4 py-3"><p className={`text-xs md:text-sm font-medium ${isSel ? 'text-emerald-400' : 'text-slate-200'}`}>{b.nom}</p><p className="text-[10px] md:text-xs text-slate-500">{b.arrondissements.length} arr.</p></td>
                          <td className="px-2 md:px-4 py-3 text-right"><p className="text-xs md:text-sm font-semibold text-emerald-400">{formatNumber(b.nbLogements)}</p></td>
                          <td className="px-2 md:px-4 py-3 text-right text-xs md:text-sm text-slate-300">{formatNumber(b.nbProjets)}</td>
                          <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-blue-400">{formatNumber(b.nbPLAI)}</td>
                          <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-cyan-400">{formatNumber(b.nbPLUS)}</td>
                          <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-violet-400">{formatNumber(b.nbPLS)}</td>
                          <td className="hidden md:table-cell px-4 py-3"><div className="flex items-center justify-center gap-2"><div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(pct * 2, 100)}%` }} /></div><span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span></div></td>
                          <td className="hidden md:table-cell px-4 py-3 text-center"><button onClick={() => { setSelectedBailleur(isSel ? null : b.nom); setActiveTab('carte'); }} className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline">Voir sur carte →</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {topBailleurs.length > 20 && <div className="px-4 py-3 border-t border-slate-700 text-center"><p className="text-sm text-slate-500">+ {topBailleurs.length - 20} autres bailleurs</p></div>}
            </div>

            {/* Légende types */}
            <div className="mt-6 bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
              <h3 className="text-sm font-medium text-slate-300 mb-3">📊 Types de logements sociaux</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="flex items-start gap-2"><div className="w-3 h-3 rounded-full bg-blue-400 mt-0.5" /><div><p className="text-slate-300 font-medium">PLAI - Très social</p><p className="text-slate-500">Revenus &lt; 60% du plafond HLM.</p></div></div>
                <div className="flex items-start gap-2"><div className="w-3 h-3 rounded-full bg-cyan-400 mt-0.5" /><div><p className="text-slate-300 font-medium">PLUS - Social standard</p><p className="text-slate-500">Revenus &lt; 100% du plafond HLM.</p></div></div>
                <div className="flex items-start gap-2"><div className="w-3 h-3 rounded-full bg-violet-400 mt-0.5" /><div><p className="text-slate-300 font-medium">PLS - Intermédiaire</p><p className="text-slate-500">Revenus 100-130% du plafond HLM.</p></div></div>
              </div>
            </div>
          </>
        )}

        {/* ── Tab Carte ── */}
        {activeTab === 'carte' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectedBailleur && (
                  <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-emerald-400">🏢 {selectedBailleur}</span>
                    <button onClick={() => setSelectedBailleur(null)} className="text-emerald-400 hover:text-emerald-300">✕</button>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showChoropleth} onChange={e => setShowChoropleth(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500" />
                <span className="text-sm text-slate-300">Vue par habitant</span>
              </label>
            </div>
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden h-[600px]">
              <LogementsSociauxMap logements={mapLogements} arrondissementStats={arrondissementsStats} showChoropleth={showChoropleth} isLoading={isLoading} selectedBailleur={selectedBailleur} />
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2"><span>📚</span>Sources des données</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <a href={DATA_SOURCES.logementsSociaux.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                <span className="text-emerald-400">🏠</span><div><p className="text-slate-300 font-medium">{DATA_SOURCES.logementsSociaux.nom}</p><p className="text-slate-500">{DATA_SOURCES.logementsSociaux.description}</p></div>
              </a>
              <a href={DATA_SOURCES.population.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                <span className="text-cyan-400">👥</span><div><p className="text-slate-300 font-medium">{DATA_SOURCES.population.nom}</p><p className="text-slate-500">{DATA_SOURCES.population.description}</p></div>
              </a>
              <a href={DATA_SOURCES.arrondissements.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                <span className="text-slate-400">🗺️</span><div><p className="text-slate-300 font-medium">{DATA_SOURCES.arrondissements.nom}</p><p className="text-slate-500">{DATA_SOURCES.arrondissements.description}</p></div>
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LogementsPageInner />
    </Suspense>
  );
}
