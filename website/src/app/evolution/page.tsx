'use client';

/**
 * Page Évolution - Analyse temporelle du budget
 * 
 * Features:
 * - Graphique d'évolution Recettes/Dépenses sur plusieurs années
 * - Graphique santé financière (épargne brute, surplus/déficit)
 * - Cartes KPI avec variations Year-over-Year
 * - Sélecteur d'année pour focus
 * 
 * Sources:
 * - evolution_budget.json (agrégé depuis mart_evolution_budget)
 * 
 * Concepts budgétaires:
 * - Solde comptable = Recettes - Dépenses (équilibre technique, ~0)
 * - Surplus/Déficit = Recettes propres (hors emprunts) - Dépenses (santé réelle)
 * - Épargne brute = Recettes fonct. - Dépenses fonct. (capacité autofinancement)
 */

import { useState, useEffect, useMemo } from 'react';
import EvolutionChart, { type YearlyBudget } from '@/components/EvolutionChart';
import FinancialHealthChart, { type FinancialYearData } from '@/components/FinancialHealthChart';
import VariationRankChart, { type VariationsData } from '@/components/VariationRankChart';
import YoyCards from '@/components/YoyCards';
import GlossaryTip from '@/components/GlossaryTip';
import DataQualityBanner from '@/components/DataQualityBanner';
import { formatEuroCompact } from '@/lib/formatters';

/**
 * Structure des données evolution_budget.json
 */
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
      // Métriques dette
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

export default function EvolutionPage() {
  const [budgetData, setBudgetData] = useState<YearlyBudget[]>([]);
  const [financialData, setFinancialData] = useState<FinancialYearData[]>([]);
  const [rawData, setRawData] = useState<EvolutionBudgetData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charger les données depuis evolution_budget.json
   */
  useEffect(() => {
    async function loadEvolutionData() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/data/evolution_budget.json');
        if (!response.ok) {
          throw new Error('Fichier evolution_budget.json non trouvé');
        }
        
        const data: EvolutionBudgetData = await response.json();
        setRawData(data);

        // Transformer pour EvolutionChart et YoyCards
        // On utilise recettes_propres (hors emprunts) pour refléter la santé financière réelle
        const chartData: YearlyBudget[] = data.years.map(y => ({
          year: y.year,
          recettes: y.totals.recettes_propres,  // Recettes PROPRES (hors emprunts)
          depenses: y.totals.depenses,
          // Surplus/déficit = recettes propres - dépenses
          solde: y.totals.surplus_deficit,
        }));
        setBudgetData(chartData);

        // Transformer pour FinancialHealthChart (Épargne brute, Surplus/Déficit)
        const healthData: FinancialYearData[] = data.years.map(y => ({
          year: y.year,
          epargne_brute: y.epargne_brute,
          surplus_deficit: y.totals.surplus_deficit,
          recettes_propres: y.totals.recettes_propres,
          emprunts: y.totals.emprunts,
        }));
        setFinancialData(healthData);

        // Sélectionner l'année la plus récente
        if (data.years.length > 0) {
          const maxYear = Math.max(...data.years.map(y => y.year));
          setSelectedYear(maxYear);
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

  // Données de l'année sélectionnée
  const currentYearData = useMemo(() => {
    return budgetData.find(d => d.year === selectedYear);
  }, [budgetData, selectedYear]);

  // Données de l'année précédente (pour YoY)
  const previousYearData = useMemo(() => {
    return budgetData.find(d => d.year === selectedYear - 1);
  }, [budgetData, selectedYear]);

  // Données financières de l'année sélectionnée
  const currentFinancialData = useMemo(() => {
    return rawData?.years.find(y => y.year === selectedYear);
  }, [rawData, selectedYear]);

  // Calcul des stats globales
  const globalStats = useMemo(() => {
    if (budgetData.length === 0) return null;

    const years = budgetData.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const avgRecettes = budgetData.reduce((sum, d) => sum + d.recettes, 0) / budgetData.length;
    const avgDepenses = budgetData.reduce((sum, d) => sum + d.depenses, 0) / budgetData.length;
    const avgEpargneBrute = financialData.reduce((sum, d) => sum + d.epargne_brute, 0) / financialData.length;

    // CAGR (Compound Annual Growth Rate) des dépenses
    const firstYear = budgetData.find(d => d.year === minYear);
    const lastYear = budgetData.find(d => d.year === maxYear);
    let cagr = 0;
    if (firstYear && lastYear && lastYear.depenses > 0 && firstYear.depenses > 0) {
      const nbYears = maxYear - minYear;
      if (nbYears > 0) {
        cagr = (Math.pow(lastYear.depenses / firstYear.depenses, 1 / nbYears) - 1) * 100;
      }
    }

    return {
      minYear,
      maxYear,
      nbYears: budgetData.length,
      avgRecettes,
      avgDepenses,
      avgEpargneBrute,
      cagr,
    };
  }, [budgetData, financialData]);

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
          <p className="text-red-400 text-lg mb-2">{error || 'Aucune donnée disponible'}</p>
          <p className="text-slate-400 text-sm">
            Vérifiez que les fichiers budget_sankey_*.json sont présents dans /public/data/
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header — non-sticky sur mobile (la bottom nav suffit), sticky sur desktop */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur md:sticky md:top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-3">
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

        {/* Métriques santé financière de l'année (complémentaires aux YoyCards) */}
        {currentFinancialData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Épargne brute - capacité d'autofinancement */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Épargne brute <GlossaryTip term="epargne_brute" /></p>
              </div>
              <p className={`text-2xl font-bold ${currentFinancialData.epargne_brute >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {currentFinancialData.epargne_brute >= 0 ? '+' : ''}{formatEuroCompact(currentFinancialData.epargne_brute)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Capacité d&apos;autofinancement</p>
            </div>
            
            {/* Solde comptable - équilibre technique */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
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
              Gestion de la dette {selectedYear}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {/* Emprunts nouveaux */}
              <div>
                <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Emprunts <GlossaryTip term="emprunts" /></p>
                <p className="text-lg md:text-xl font-bold text-amber-400 mt-1">
                  +{formatEuroCompact(currentFinancialData.totals.emprunts)}
                </p>
                <p className="text-[10px] md:text-xs text-slate-500 mt-1">Nouveaux</p>
              </div>
              
              {/* Remboursement principal */}
              <div>
                <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Remb. capital <GlossaryTip term="remboursement_principal" /></p>
                <p className="text-lg md:text-xl font-bold text-emerald-400 mt-1">
                  -{formatEuroCompact(currentFinancialData.totals.remboursement_principal)}
                </p>
                <p className="text-[10px] md:text-xs text-slate-500 mt-1">Principal</p>
              </div>
              
              {/* Intérêts */}
              <div>
                <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Intérêts <GlossaryTip term="interets_dette" /></p>
                <p className="text-lg md:text-xl font-bold text-red-400 mt-1">
                  -{formatEuroCompact(currentFinancialData.totals.interets_dette)}
                </p>
                <p className="text-[10px] md:text-xs text-slate-500 mt-1">Coût dette</p>
              </div>
              
              {/* Variation dette nette */}
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

        {/* Graphique d'évolution Recettes/Dépenses */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            Évolution Recettes et Dépenses
          </h2>
          <EvolutionChart 
            data={budgetData} 
            selectedYear={selectedYear}
            onYearClick={setSelectedYear}
            height={400}
          />
        </div>

        {/* Graphique santé financière */}
        {financialData.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
              Santé Financière
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Épargne brute (capacité d&apos;autofinancement) et Surplus/Déficit financier (hors emprunts)
            </p>
            <FinancialHealthChart 
              data={financialData} 
              selectedYear={selectedYear}
              onYearClick={setSelectedYear}
              height={350}
            />
            
            {/* Légende explicative */}
            <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
              <div>
                <span className="inline-block w-3 h-3 rounded bg-green-500 mr-2 align-middle"></span>
                <strong className="text-slate-300">Épargne brute</strong> = Recettes fonctionnement − Dépenses fonctionnement. 
                Mesure la capacité à générer des ressources pour investir.
              </div>
              <div>
                <span className="inline-block w-3 h-3 rounded bg-orange-500 mr-2 align-middle"></span>
                <strong className="text-slate-300">Surplus/Déficit</strong> = Recettes propres − Dépenses (emprunts exclus). 
                Mesure la santé financière réelle.
              </div>
            </div>
          </div>
        )}

        {/* Graphique variation par poste sur 6 ans */}
        {rawData?.variations_6ans && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
            <VariationRankChart 
              data={rawData.variations_6ans}
              maxItems={8}
            />
          </div>
        )}

        {/* Stats globales */}
        {globalStats && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              Statistiques sur la période
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              <div>
                <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Période</p>
                <p className="text-lg md:text-xl font-bold text-slate-100">
                  {globalStats.minYear}-{globalStats.maxYear}
                </p>
                <p className="text-[10px] md:text-xs text-slate-400 mt-1">
                  {globalStats.nbYears} années
                </p>
              </div>
              
              <div>
                <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Moy. Recettes</p>
                <p className="text-lg md:text-xl font-bold text-emerald-400">
                  {formatEuroCompact(globalStats.avgRecettes)}
                </p>
                <p className="text-[10px] md:text-xs text-slate-400 mt-1">par an</p>
              </div>
              
              <div>
                <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Moy. Dépenses</p>
                <p className="text-lg md:text-xl font-bold text-rose-400">
                  {formatEuroCompact(globalStats.avgDepenses)}
                </p>
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
