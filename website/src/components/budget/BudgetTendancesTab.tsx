'use client';

/**
 * BudgetTendancesTab — Tab "Tendances" de la page /budget.
 *
 * Contenu : EvolutionChart, YoyCards, FinancialHealthChart, VariationRankChart.
 * Migré depuis l'ancien /evolution/page.tsx.
 *
 * Affiche l'analyse temporelle multi-années du budget de Paris.
 */

import { useState, useEffect, useMemo } from 'react';
import EvolutionChart, { type YearlyBudget } from '@/components/EvolutionChart';
import FinancialHealthChart, { type FinancialYearData } from '@/components/FinancialHealthChart';
import VariationRankChart, { type VariationsData } from '@/components/VariationRankChart';
import YoyCards from '@/components/YoyCards';
import GlossaryTip from '@/components/GlossaryTip';
import DataQualityBanner from '@/components/DataQualityBanner';
import { formatEuroCompact } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionBudgetData {
  generated_at: string;
  definitions: Record<string, string>;
  years: Array<{
    year: number;
    totals: {
      recettes: number;
      depenses: number;
      solde_comptable: number;
      recettes_propres: number;
      surplus_deficit: number;
      emprunts: number;
      remboursement_principal: number;
      interets_dette: number;
      variation_dette_nette: number;
    };
    epargne_brute: number;
    sections: {
      fonctionnement: { recettes: number; depenses: number };
      investissement: { recettes: number; depenses: number };
    };
    variations?: {
      recettes_pct?: number | null;
      depenses_pct?: number | null;
    };
  }>;
  variations_6ans?: VariationsData;
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function BudgetTendancesTab() {
  const [budgetData, setBudgetData] = useState<YearlyBudget[]>([]);
  const [financialData, setFinancialData] = useState<FinancialYearData[]>([]);
  const [rawData, setRawData] = useState<EvolutionBudgetData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvolutionData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/data/evolution_budget.json');
        if (!response.ok) throw new Error('Fichier evolution_budget.json non trouvé');

        const data: EvolutionBudgetData = await response.json();
        setRawData(data);

        // Recettes propres (hors emprunts) pour refléter la santé financière réelle
        const chartData: YearlyBudget[] = data.years.map(y => ({
          year: y.year,
          recettes: y.totals.recettes_propres,
          depenses: y.totals.depenses,
          solde: y.totals.surplus_deficit,
        }));
        setBudgetData(chartData);

        const healthData: FinancialYearData[] = data.years.map(y => ({
          year: y.year,
          epargne_brute: y.epargne_brute,
          surplus_deficit: y.totals.surplus_deficit,
          recettes_propres: y.totals.recettes_propres,
          emprunts: y.totals.emprunts,
        }));
        setFinancialData(healthData);

        if (data.years.length > 0) {
          setSelectedYear(Math.max(...data.years.map(y => y.year)));
        }
      } catch (err) {
        console.error('Erreur chargement données évolution:', err);
        setError('Impossible de charger les données budgétaires.');
      } finally {
        setIsLoading(false);
      }
    }
    loadEvolutionData();
  }, []);

  const currentYearData = useMemo(() => budgetData.find(d => d.year === selectedYear), [budgetData, selectedYear]);
  const previousYearData = useMemo(() => budgetData.find(d => d.year === selectedYear - 1), [budgetData, selectedYear]);
  const currentFinancialData = useMemo(() => rawData?.years.find(y => y.year === selectedYear), [rawData, selectedYear]);

  const globalStats = useMemo(() => {
    if (budgetData.length === 0) return null;
    const years = budgetData.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const avgRecettes = budgetData.reduce((s, d) => s + d.recettes, 0) / budgetData.length;
    const avgDepenses = budgetData.reduce((s, d) => s + d.depenses, 0) / budgetData.length;
    const avgEpargneBrute = financialData.reduce((s, d) => s + d.epargne_brute, 0) / financialData.length;
    const first = budgetData.find(d => d.year === minYear);
    const last = budgetData.find(d => d.year === maxYear);
    let cagr = 0;
    if (first && last && last.depenses > 0 && first.depenses > 0) {
      const n = maxYear - minYear;
      if (n > 0) cagr = (Math.pow(last.depenses / first.depenses, 1 / n) - 1) * 100;
    }
    return { minYear, maxYear, nbYears: budgetData.length, avgRecettes, avgDepenses, avgEpargneBrute, cagr };
  }, [budgetData, financialData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (error || budgetData.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg mb-2">❌ {error || 'Aucune donnée disponible'}</p>
          <p className="text-slate-400 text-sm">
            Vérifiez que evolution_budget.json est présent dans /public/data/
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Year focus selector */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-400">
          Analyse temporelle {globalStats?.minYear}–{globalStats?.maxYear}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Année focus :</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors"
          >
            {budgetData.sort((a, b) => b.year - a.year).map(d => (
              <option key={d.year} value={d.year}>{d.year}</option>
            ))}
          </select>
        </div>
      </div>

      <DataQualityBanner dataset="budget" year={selectedYear} />

      {/* KPI Cards YoY */}
      {currentYearData && (
        <div className="mb-6">
          <YoyCards currentYear={currentYearData} previousYear={previousYearData} />
        </div>
      )}

      {/* Métriques santé financière */}
      {currentFinancialData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Épargne brute <GlossaryTip term="epargne_brute" /></p>
            </div>
            <p className={`text-2xl font-bold ${currentFinancialData.epargne_brute >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {currentFinancialData.epargne_brute >= 0 ? '+' : ''}{formatEuroCompact(currentFinancialData.epargne_brute)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Capacité d&apos;autofinancement</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚖️</span>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Solde comptable <GlossaryTip term="solde_comptable" /></p>
            </div>
            <p className={`text-2xl font-bold ${currentFinancialData.totals.solde_comptable >= 0 ? 'text-slate-300' : 'text-slate-400'}`}>
              {currentFinancialData.totals.solde_comptable >= 0 ? '+' : ''}{formatEuroCompact(currentFinancialData.totals.solde_comptable)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Équilibre technique</p>
          </div>
        </div>
      )}

      {/* Métriques dette */}
      {currentFinancialData && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-amber-500/30 p-4 mb-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <span>🏦</span>
            Gestion de la dette {selectedYear}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Emprunts <GlossaryTip term="emprunts" /></p>
              <p className="text-lg md:text-xl font-bold text-amber-400 mt-1">+{formatEuroCompact(currentFinancialData.totals.emprunts)}</p>
              <p className="text-[10px] md:text-xs text-slate-500 mt-1">Nouveaux</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Remb. capital <GlossaryTip term="remboursement_principal" /></p>
              <p className="text-lg md:text-xl font-bold text-emerald-400 mt-1">-{formatEuroCompact(currentFinancialData.totals.remboursement_principal)}</p>
              <p className="text-[10px] md:text-xs text-slate-500 mt-1">Principal</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Intérêts <GlossaryTip term="interets_dette" /></p>
              <p className="text-lg md:text-xl font-bold text-red-400 mt-1">-{formatEuroCompact(currentFinancialData.totals.interets_dette)}</p>
              <p className="text-[10px] md:text-xs text-slate-500 mt-1">Coût dette</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Δ Dette nette <GlossaryTip term="variation_dette_nette" /></p>
              <p className={`text-lg md:text-xl font-bold mt-1 ${currentFinancialData.totals.variation_dette_nette > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {currentFinancialData.totals.variation_dette_nette > 0 ? '+' : ''}{formatEuroCompact(currentFinancialData.totals.variation_dette_nette)}
              </p>
              <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                {currentFinancialData.totals.variation_dette_nette > 0 ? 'Dette ↑' : 'Dette ↓'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Graphique évolution Recettes/Dépenses */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <span>📈</span>
          Évolution Recettes et Dépenses
        </h2>
        <EvolutionChart data={budgetData} selectedYear={selectedYear} onYearClick={setSelectedYear} height={400} />
      </div>

      {/* Graphique santé financière */}
      {financialData.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
            <span>💹</span>
            Santé Financière
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Épargne brute (capacité d&apos;autofinancement) et Surplus/Déficit financier (hors emprunts)
          </p>
          <FinancialHealthChart data={financialData} selectedYear={selectedYear} onYearClick={setSelectedYear} height={350} />
          <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
            <div>
              <span className="inline-block w-3 h-3 rounded bg-green-500 mr-2 align-middle" />
              <strong className="text-slate-300">Épargne brute</strong> = Recettes fonctionnement − Dépenses fonctionnement.
            </div>
            <div>
              <span className="inline-block w-3 h-3 rounded bg-orange-500 mr-2 align-middle" />
              <strong className="text-slate-300">Surplus/Déficit</strong> = Recettes propres − Dépenses (emprunts exclus).
            </div>
          </div>
        </div>
      )}

      {/* Variation par poste sur 6 ans */}
      {rawData?.variations_6ans && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <VariationRankChart data={rawData.variations_6ans} maxItems={8} />
        </div>
      )}

      {/* Stats globales */}
      {globalStats && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span>📋</span>
            Statistiques sur la période
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Période</p>
              <p className="text-lg md:text-xl font-bold text-slate-100">{globalStats.minYear}–{globalStats.maxYear}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">{globalStats.nbYears} années</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Moy. Recettes</p>
              <p className="text-lg md:text-xl font-bold text-emerald-400">{formatEuroCompact(globalStats.avgRecettes)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">par an</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Moy. Dépenses</p>
              <p className="text-lg md:text-xl font-bold text-purple-400">{formatEuroCompact(globalStats.avgDepenses)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">par an</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Moy. Épargne brute</p>
              <p className={`text-lg md:text-xl font-bold ${globalStats.avgEpargneBrute >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatEuroCompact(globalStats.avgEpargneBrute)}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">par an</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Croissance Dépenses</p>
              <p className={`text-lg md:text-xl font-bold ${globalStats.cagr > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {globalStats.cagr > 0 ? '+' : ''}{globalStats.cagr.toFixed(1)}%
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">TCAM (annuel)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
