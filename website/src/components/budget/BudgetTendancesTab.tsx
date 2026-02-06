'use client';

/**
 * BudgetTendancesTab — Tab "Tendances" de la page /budget.
 *
 * Contenu : EvolutionChart (recettes vs dépenses), YoyCards, VariationRankChart.
 * Focalisé sur l'évolution budgétaire pure (pas de dette/patrimoine).
 *
 * Les métriques dette/santé financière sont dans PatrimoineTendancesTab.
 */

import { useState, useEffect, useMemo } from 'react';
import EvolutionChart, { type YearlyBudget } from '@/components/EvolutionChart';
import VariationRankChart, { type VariationsData } from '@/components/VariationRankChart';
import YoyCards from '@/components/YoyCards';
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

  const globalStats = useMemo(() => {
    if (budgetData.length === 0) return null;
    const years = budgetData.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const avgRecettes = budgetData.reduce((s, d) => s + d.recettes, 0) / budgetData.length;
    const avgDepenses = budgetData.reduce((s, d) => s + d.depenses, 0) / budgetData.length;
    const first = budgetData.find(d => d.year === minYear);
    const last = budgetData.find(d => d.year === maxYear);
    let cagr = 0;
    if (first && last && last.depenses > 0 && first.depenses > 0) {
      const n = maxYear - minYear;
      if (n > 0) cagr = (Math.pow(last.depenses / first.depenses, 1 / n) - 1) * 100;
    }
    return { minYear, maxYear, nbYears: budgetData.length, avgRecettes, avgDepenses, cagr };
  }, [budgetData]);

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

      {/* Graphique évolution Recettes/Dépenses */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <span>📈</span>
          Évolution Recettes et Dépenses
        </h2>
        <EvolutionChart data={budgetData} selectedYear={selectedYear} onYearClick={setSelectedYear} height={400} />
      </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
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
