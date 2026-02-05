'use client';

/**
 * Page Évolution - Analyse temporelle du budget
 * 
 * Features:
 * - Graphique d'évolution Recettes/Dépenses sur plusieurs années
 * - Cartes KPI avec variations Year-over-Year
 * - Sélecteur d'année pour focus
 * 
 * Sources:
 * - Fichiers budget_sankey_{year}.json (totaux)
 */

import { useState, useEffect, useMemo } from 'react';
import EvolutionChart, { type YearlyBudget } from '@/components/EvolutionChart';
import YoyCards from '@/components/YoyCards';
import DataQualityBanner from '@/components/DataQualityBanner';
import { formatEuroCompact } from '@/lib/formatters';

/**
 * Structure des données budget sankey
 */
interface BudgetSankeyData {
  year: number;
  totals: {
    recettes: number;
    depenses: number;
    solde: number;
  };
}

/**
 * Années disponibles pour le budget
 */
const AVAILABLE_YEARS = [2024, 2023, 2022, 2021, 2020, 2019];

export default function EvolutionPage() {
  const [budgetData, setBudgetData] = useState<YearlyBudget[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charger les données de tous les fichiers budget_sankey
   */
  useEffect(() => {
    async function loadAllBudgetData() {
      setIsLoading(true);
      setError(null);

      try {
        const results = await Promise.all(
          AVAILABLE_YEARS.map(async (year) => {
            try {
              const response = await fetch(`/data/budget_sankey_${year}.json`);
              if (!response.ok) return null;
              const data: BudgetSankeyData = await response.json();
              return {
                year: data.year,
                recettes: data.totals.recettes,
                depenses: data.totals.depenses,
                solde: data.totals.solde,
              };
            } catch {
              console.warn(`Données budget ${year} non disponibles`);
              return null;
            }
          })
        );

        // Filtrer les années sans données
        const validData = results.filter((d): d is YearlyBudget => d !== null);
        setBudgetData(validData);

        // Sélectionner l'année la plus récente avec données
        if (validData.length > 0) {
          const maxYear = Math.max(...validData.map(d => d.year));
          setSelectedYear(maxYear);
        }
      } catch (err) {
        console.error('Erreur chargement données budget:', err);
        setError('Impossible de charger les données budgétaires.');
      } finally {
        setIsLoading(false);
      }
    }

    loadAllBudgetData();
  }, []);

  // Données de l'année sélectionnée
  const currentYearData = useMemo(() => {
    return budgetData.find(d => d.year === selectedYear);
  }, [budgetData, selectedYear]);

  // Données de l'année précédente (pour YoY)
  const previousYearData = useMemo(() => {
    return budgetData.find(d => d.year === selectedYear - 1);
  }, [budgetData, selectedYear]);

  // Calcul des stats globales
  const globalStats = useMemo(() => {
    if (budgetData.length === 0) return null;

    const years = budgetData.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const avgRecettes = budgetData.reduce((sum, d) => sum + d.recettes, 0) / budgetData.length;
    const avgDepenses = budgetData.reduce((sum, d) => sum + d.depenses, 0) / budgetData.length;

    // CAGR (Compound Annual Growth Rate) des dépenses
    const firstYear = budgetData.find(d => d.year === minYear);
    const lastYear = budgetData.find(d => d.year === maxYear);
    let cagr = 0;
    if (firstYear && lastYear && lastYear.depenses > 0 && firstYear.depenses > 0) {
      const years = maxYear - minYear;
      if (years > 0) {
        cagr = (Math.pow(lastYear.depenses / firstYear.depenses, 1 / years) - 1) * 100;
      }
    }

    return {
      minYear,
      maxYear,
      nbYears: budgetData.length,
      avgRecettes,
      avgDepenses,
      cagr,
    };
  }, [budgetData]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (error || budgetData.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg mb-2">❌ {error || 'Aucune donnée disponible'}</p>
          <p className="text-slate-400 text-sm">
            Vérifiez que les fichiers budget_sankey_*.json sont présents dans /public/data/
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <span>📈</span>
                Évolution du Budget
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Analyse temporelle {globalStats?.minYear}-{globalStats?.maxYear}
              </p>
            </div>

            {/* Sélecteur d'année */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Année focus :</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors"
              >
                {budgetData
                  .sort((a, b) => b.year - a.year)
                  .map((d) => (
                    <option key={d.year} value={d.year}>
                      {d.year}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <DataQualityBanner dataset="budget" year={selectedYear} />

        {/* Cartes KPI */}
        {currentYearData && (
          <div className="mb-6">
            <YoyCards currentYear={currentYearData} previousYear={previousYearData} />
          </div>
        )}

        {/* Graphique d'évolution */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span>📊</span>
            Recettes et Dépenses
          </h2>
          <EvolutionChart 
            data={budgetData} 
            selectedYear={selectedYear}
            onYearClick={setSelectedYear}
            height={400}
          />
        </div>

        {/* Stats globales */}
        {globalStats && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span>📋</span>
              Statistiques sur la période
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Période</p>
                <p className="text-xl font-bold text-slate-100">
                  {globalStats.minYear}-{globalStats.maxYear}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {globalStats.nbYears} années
                </p>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Moyenne Recettes</p>
                <p className="text-xl font-bold text-emerald-400">
                  {formatEuroCompact(globalStats.avgRecettes)}
                </p>
                <p className="text-xs text-slate-400 mt-1">par an</p>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Moyenne Dépenses</p>
                <p className="text-xl font-bold text-purple-400">
                  {formatEuroCompact(globalStats.avgDepenses)}
                </p>
                <p className="text-xs text-slate-400 mt-1">par an</p>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Croissance Dépenses</p>
                <p className={`text-xl font-bold ${globalStats.cagr > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {globalStats.cagr > 0 ? '+' : ''}{globalStats.cagr.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-400 mt-1">TCAM (annuel)</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer avec sources */}
        <footer className="mt-8 pt-6 border-t border-slate-700/50">
          <div className="text-center text-xs text-slate-500">
            <p>
              Données: OpenData Paris - Budget Mairie Centrale (Compte administratif)
            </p>
            <p className="mt-1">
              Source des flux: Dépenses et recettes réelles (hors opérations pour ordre)
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
