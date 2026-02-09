'use client';

/**
 * Page /investissements — Projets d'investissement de la Ville de Paris.
 *
 * Architecture par entité avec 3 tabs :
 * - Annuel (défaut) : Stats + top projets par montant
 * - Carte : Carte Leaflet des projets géolocalisés
 * - Explorer : Table filtrable complète (thématiques, arrondissement, recherche)
 *
 * Sources : /public/data/map/investissements_complet_{year}.json
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import { loadAutorisationsIndex, loadAutorisationsForYear } from '@/lib/api/staticData';
import type { AutorisationProgramme } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';

// ─── Dynamic import (Leaflet needs window) ───────────────────────────────────

const InvestissementsMap = dynamic(
  () => import('@/components/map/InvestissementsMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[500px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

// ─── Tab definitions ─────────────────────────────────────────────────────────

const INVEST_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '📋' },
  { id: 'carte', label: 'Carte', icon: '🗺️' },
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
];

const VALID_TAB_IDS = INVEST_TABS.map(t => t.id);

const THEMATIQUES = [
  'education', 'sport', 'culture', 'environnement', 'mobilite',
  'logement', 'social', 'democratie', 'urbanisme', 'autre',
] as const;

interface BudgetInvestYear {
  year: number;
  sections: { investissement: { depenses: number } };
}

// ─── Inner component ─────────────────────────────────────────────────────────

function InvestissementsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [availableYears, setAvailableYears] = useState<number[]>([2024, 2023, 2022]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [selectedThematiques, setSelectedThematiques] = useState<string[]>([]);
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreciseOnly, setShowPreciseOnly] = useState(false);
  const [projets, setProjets] = useState<AutorisationProgramme[]>([]);
  const [budgetInvestByYear, setBudgetInvestByYear] = useState<Record<number, number>>({});
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load index
  useEffect(() => {
    async function loadIndex() {
      try {
        const [index, evoRes] = await Promise.all([
          loadAutorisationsIndex(),
          fetch('/data/evolution_budget.json'),
        ]);
        setAvailableYears(index.availableYears);
        if (index.availableYears.length > 0) setSelectedYear(index.availableYears[0]);
        if (evoRes.ok) {
          const evoData = await evoRes.json();
          const map: Record<number, number> = {};
          evoData.years?.forEach((y: BudgetInvestYear) => { map[y.year] = y.sections?.investissement?.depenses || 0; });
          setBudgetInvestByYear(map);
        }
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
    async function loadData() {
      setIsLoadingData(true);
      setError(null);
      try {
        setProjets(await loadAutorisationsForYear(selectedYear));
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setProjets([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadData();
  }, [selectedYear]);

  const filteredProjets = useMemo(() => {
    let filtered = projets;
    if (searchTerm) { const s = searchTerm.toLowerCase(); filtered = filtered.filter(p => p.apTexte.toLowerCase().includes(s) || p.missionTexte?.toLowerCase().includes(s)); }
    if (selectedThematiques.length > 0) filtered = filtered.filter(p => selectedThematiques.includes(p.thematique));
    if (selectedArrondissement !== null) filtered = filtered.filter(p => p.arrondissement === selectedArrondissement);
    if (showPreciseOnly) filtered = filtered.filter(p => p.latitude && p.longitude);
    return filtered;
  }, [projets, searchTerm, selectedThematiques, selectedArrondissement, showPreciseOnly]);

  const sortedProjets = useMemo(() => [...filteredProjets].sort((a, b) => b.montant - a.montant), [filteredProjets]);

  const stats = useMemo(() => {
    const total = projets.length;
    const totalMontant = projets.reduce((s, p) => s + p.montant, 0);
    const filtered = filteredProjets.length;
    const filteredMontant = filteredProjets.reduce((s, p) => s + p.montant, 0);
    const withPreciseGeo = projets.filter(p => p.latitude && p.longitude).length;
    const withArrondissement = projets.filter(p => p.arrondissement).length;
    return { total, totalMontant, filtered, filteredMontant, withPreciseGeo, withArrondissement, preciseRate: total > 0 ? ((withPreciseGeo / total) * 100).toFixed(0) : '0' };
  }, [projets, filteredProjets]);

  const toggleThematique = (t: string) => setSelectedThematiques(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  if (isLoadingIndex) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      </div>
    );
  }

  // ── Shared filters sidebar (used by Carte and Explorer tabs) ──

  const FiltersSidebar = (
    <div className="space-y-4">
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Rechercher</label>
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Nom du projet..." className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500" />
      </div>
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Arrondissement</label>
        <select value={selectedArrondissement ?? ''} onChange={e => setSelectedArrondissement(e.target.value ? Number(e.target.value) : null)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500">
          <option value="">Tous</option>
          <option value="0">Paris Centre (1-4)</option>
          {Array.from({ length: 16 }, (_, i) => i + 5).map(arr => <option key={arr} value={arr}>{arr}ème</option>)}
        </select>
      </div>
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <label className="block text-sm font-medium text-slate-300 mb-3">Thématiques</label>
        <div className="space-y-2">
          {THEMATIQUES.map(t => {
            const label = THEMATIQUE_LABELS[t as ThematiqueSubvention];
            const isSelected = selectedThematiques.includes(t);
            const count = projets.filter(p => p.thematique === t).length;
            return (
              <button key={t} onClick={() => toggleThematique(t)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${isSelected ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'}`}>
                <span className="flex items-center gap-2"><span>{label?.icon || '📋'}</span><span>{label?.label || t}</span></span>
                <span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        {selectedThematiques.length > 0 && <button onClick={() => setSelectedThematiques([])} className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300">Réinitialiser</button>}
      </div>
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={showPreciseOnly} onChange={e => setShowPreciseOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500" />
          <span className="text-sm text-slate-300">Géoloc précise uniquement</span>
        </label>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title="Investissements"
            description="Projets d'équipements publics : écoles, piscines, voiries, parcs..."
            actions={<YearSelector years={availableYears} selectedYear={selectedYear} onYearChange={setSelectedYear} />}
          />
          <div className="mt-5">
            <TabBar tabs={INVEST_TABS} activeTab={activeTab} onChange={setActiveTab} />
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
          <div>
            {/* Coverage info */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-sm text-blue-300">
              <strong>Couverture :</strong> Projets localisables représentant{' '}
              <strong>{budgetInvestByYear[selectedYear] && stats.totalMontant > 0 ? `~${((stats.totalMontant / budgetInvestByYear[selectedYear]) * 100).toFixed(0)}%` : '~10-15%'}</strong>{' '}
              du budget d&apos;investissement ({budgetInvestByYear[selectedYear] ? formatEuroCompact(budgetInvestByYear[selectedYear]) : '~2 Md€'}).
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total {selectedYear}</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalMontant)}</p>
                <p className="text-xs text-slate-500 mt-1">{formatNumber(stats.total)} projets</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Géoloc précise</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.preciseRate}%</p>
                <p className="text-xs text-slate-500 mt-1">{formatNumber(stats.withPreciseGeo)} projets</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Localisables</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{stats.total > 0 ? ((stats.withArrondissement / stats.total) * 100).toFixed(0) : 0}%</p>
                <p className="text-xs text-slate-500 mt-1">Avec arrondissement</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Budget invest. total</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{budgetInvestByYear[selectedYear] ? formatEuroCompact(budgetInvestByYear[selectedYear]) : '—'}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedYear}</p>
              </div>
            </div>

            {/* Top projets (compact list) */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-slate-100">Top projets par montant</h3>
              </div>
              {isLoadingData ? (
                <div className="h-64 flex items-center justify-center"><div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-700">
                      <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projet</th>
                      <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Chapitre</th>
                      <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Montant</th>
                      <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Arr.</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {sortedProjets.slice(0, 30).map((p, i) => {
                        const label = THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention];
                        return (
                          <tr key={p.id} className="hover:bg-slate-700/30 transition-colors">
                            <td className="px-2 md:px-4 py-3"><div className="flex items-start gap-2"><span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span><div className="min-w-0"><p className="text-xs md:text-sm text-slate-200 line-clamp-2">{p.apTexte}</p><p className="text-[10px] md:text-xs text-slate-500 mt-1">{label?.icon || '📋'} {label?.label || p.thematique}</p></div></div></td>
                            <td className="hidden md:table-cell px-4 py-3"><p className="text-xs text-slate-400 line-clamp-2">{p.missionTexte}</p></td>
                            <td className="px-2 md:px-4 py-3 text-right"><p className="text-xs md:text-sm font-semibold text-amber-400 whitespace-nowrap">{formatEuroCompact(p.montant)}</p></td>
                            <td className="hidden md:table-cell px-4 py-3 text-center">{p.arrondissement ? <span className="text-sm text-slate-300">{p.arrondissement === 0 ? 'Centre' : p.arrondissement}</span> : <span className="text-slate-500">-</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {sortedProjets.length > 30 && (
                <div className="px-4 py-3 border-t border-slate-700 text-center">
                  <button onClick={() => setActiveTab('explorer')} className="text-sm text-amber-400 hover:text-amber-300 transition-colors">
                    Voir les {formatNumber(sortedProjets.length)} projets →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab Carte ── */}
        {activeTab === 'carte' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">{FiltersSidebar}</div>
            <div className="lg:col-span-3">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden h-[600px]">
                <InvestissementsMap projets={filteredProjets} isLoading={isLoadingData} />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab Explorer ── */}
        {activeTab === 'explorer' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">{FiltersSidebar}</div>
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">{formatNumber(stats.filtered)} projets ({formatEuroCompact(stats.filteredMontant)})</h3>
              </div>
              {isLoadingData ? (
                <div className="h-64 flex items-center justify-center"><div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-slate-700">
                        <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projet</th>
                        <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Chapitre</th>
                        <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Montant</th>
                        <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Arr.</th>
                        <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Géo</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {sortedProjets.slice(0, 100).map((p, i) => {
                          const isPrecise = p.latitude && p.longitude;
                          const label = THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention];
                          return (
                            <tr key={p.id} className="hover:bg-slate-700/30 transition-colors">
                              <td className="px-2 md:px-4 py-3"><div className="flex items-start gap-2"><span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span><div className="min-w-0"><p className="text-xs md:text-sm text-slate-200 line-clamp-2">{p.apTexte}</p><p className="text-[10px] md:text-xs text-slate-500 mt-1">{label?.icon || '📋'} {label?.label || p.thematique}</p></div></div></td>
                              <td className="hidden md:table-cell px-4 py-3"><p className="text-xs text-slate-400 line-clamp-2">{p.missionTexte}</p></td>
                              <td className="px-2 md:px-4 py-3 text-right"><p className="text-xs md:text-sm font-semibold text-amber-400 whitespace-nowrap">{formatEuroCompact(p.montant)}</p></td>
                              <td className="hidden md:table-cell px-4 py-3 text-center">{p.arrondissement ? <span className="text-sm text-slate-300">{p.arrondissement === 0 ? 'Centre' : p.arrondissement}</span> : <span className="text-slate-500">-</span>}</td>
                              <td className="hidden md:table-cell px-4 py-3 text-center">{isPrecise ? <span className="text-emerald-400" title={p.adresse || ''}>📍</span> : p.arrondissement ? <span className="text-orange-400" title="Centroïde">📌</span> : <span className="text-slate-500">-</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {sortedProjets.length > 100 && <div className="px-4 py-3 border-t border-slate-700 text-center"><p className="text-sm text-slate-500">100 premiers sur {formatNumber(sortedProjets.length)}</p></div>}
                  {sortedProjets.length === 0 && <div className="px-4 py-12 text-center"><p className="text-slate-400">Aucun projet ne correspond aux filtres</p></div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>Données : Comptes Administratifs — Annexe &ldquo;Investissements Localisés&rdquo; (PDF) + OpenData Paris</p>
            <p>Années disponibles : {availableYears.join(', ')}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function InvestissementsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <InvestissementsPageInner />
    </Suspense>
  );
}
