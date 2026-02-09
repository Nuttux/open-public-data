'use client';

/**
 * BudgetTendancesTab — Tab "Tendances" de la page /budget.
 *
 * Contenu : YoyCards, EvolutionChart, VariationRankChart.
 * Focalisé sur l'évolution budgétaire pure (pas de dette/patrimoine).
 *
 * L'utilisateur choisit une plage d'années (début → fin) via un double sélecteur.
 * Toutes les métriques, cartes KPI et graphiques se recalculent dynamiquement
 * en fonction de la période choisie.
 *
 * Les métriques dette/santé financière sont dans PatrimoineTendancesTab.
 */

import { useState, useEffect, useMemo } from 'react';
import EvolutionChart, { type YearlyBudget } from '@/components/EvolutionChart';
import VariationRankChart, { type VariationsData, type VariationItem } from '@/components/VariationRankChart';
import YoyCards from '@/components/YoyCards';
import YearRangeSelector from '@/components/YearRangeSelector';
import DataQualityBanner from '@/components/DataQualityBanner';


// ─── Types ───────────────────────────────────────────────────────────────────

/** Breakdowns per year for dynamic variation computation */
interface BreakdownsParAnnee {
  depenses_par_thematique: Record<string, Record<string, number>>;
  recettes_par_source: Record<string, Record<string, number>>;
}

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
  breakdowns_par_annee?: BreakdownsParAnnee;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute dynamic VariationsData between two years from per-year breakdowns.
 *
 * Falls back to the pre-computed variations_6ans if breakdowns are unavailable
 * or don't contain the requested years.
 */
function computeDynamicVariations(
  breakdowns: BreakdownsParAnnee | undefined,
  startYear: number,
  endYear: number,
  fallback?: VariationsData,
): VariationsData | null {
  if (!breakdowns) return fallback ?? null;

  const startKey = String(startYear);
  const endKey = String(endYear);

  // ── Dépenses par thématique ──
  const depenses: VariationItem[] = [];
  for (const [label, annees] of Object.entries(breakdowns.depenses_par_thematique)) {
    const montantDebut = annees[startKey];
    const montantFin = annees[endKey];
    if (montantDebut == null || montantFin == null) continue;

    const variationEuros = montantFin - montantDebut;
    const variationPct = montantDebut !== 0
      ? Math.round(((montantFin / montantDebut) - 1) * 1000) / 10
      : 0;

    depenses.push({
      label,
      montant_debut: montantDebut,
      montant_fin: montantFin,
      variation_euros: variationEuros,
      variation_pct: variationPct,
    });
  }

  // ── Recettes par source ──
  const recettes: VariationItem[] = [];
  for (const [label, annees] of Object.entries(breakdowns.recettes_par_source)) {
    const montantDebut = annees[startKey];
    const montantFin = annees[endKey];
    if (montantDebut == null || montantFin == null) continue;

    const variationEuros = montantFin - montantDebut;
    const variationPct = montantDebut !== 0
      ? Math.round(((montantFin / montantDebut) - 1) * 1000) / 10
      : 0;

    recettes.push({
      label,
      montant_debut: montantDebut,
      montant_fin: montantFin,
      variation_euros: variationEuros,
      variation_pct: variationPct,
    });
  }

  // If we found no data for the requested range, fall back
  if (depenses.length === 0 && recettes.length === 0) {
    return fallback ?? null;
  }

  // Sort by absolute variation (biggest first)
  depenses.sort((a, b) => Math.abs(b.variation_euros) - Math.abs(a.variation_euros));
  recettes.sort((a, b) => Math.abs(b.variation_euros) - Math.abs(a.variation_euros));

  return {
    periode: { debut: startYear, fin: endYear },
    depenses,
    recettes,
    classifications: {
      depenses: 'par thématique (destination des dépenses)',
      recettes: 'par source (origine des recettes)',
    },
  };
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function BudgetTendancesTab() {
  const [budgetData, setBudgetData] = useState<YearlyBudget[]>([]);
  const [rawData, setRawData] = useState<EvolutionBudgetData | null>(null);
  const [startYear, setStartYear] = useState<number>(2019);
  const [endYear, setEndYear] = useState<number>(2024);
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

        // Initialiser la plage sur min/max des données
        if (data.years.length > 0) {
          const years = data.years.map(y => y.year);
          setStartYear(Math.min(...years));
          setEndYear(Math.max(...years));
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

  /** Toutes les années disponibles (pour le sélecteur) */
  const availableYears = useMemo(() => {
    return budgetData.map(d => d.year).sort((a, b) => a - b);
  }, [budgetData]);

  /** Données de l'année de fin (affichée en gros dans les KPI) */
  const endYearData = useMemo(
    () => budgetData.find(d => d.year === endYear),
    [budgetData, endYear],
  );

  /** Données de l'année de début (pour calcul de la variation) */
  const startYearData = useMemo(
    () => budgetData.find(d => d.year === startYear),
    [budgetData, startYear],
  );

  /** Données filtrées pour le graphique d'évolution (uniquement la plage sélectionnée) */
  const filteredBudgetData = useMemo(
    () => budgetData.filter(d => d.year >= startYear && d.year <= endYear),
    [budgetData, startYear, endYear],
  );

  /** Variations dynamiques calculées à partir de la plage sélectionnée */
  const dynamicVariations = useMemo(
    () => computeDynamicVariations(
      rawData?.breakdowns_par_annee,
      startYear,
      endYear,
      rawData?.variations_6ans,
    ),
    [rawData, startYear, endYear],
  );

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
          <p className="text-red-400 text-lg mb-2">{error || 'Aucune donnée disponible'}</p>
          <p className="text-slate-400 text-sm">
            Vérifiez que evolution_budget.json est présent dans /public/data/
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Year range selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <p className="text-sm text-slate-400">
          Analyse temporelle {availableYears[0]}–{availableYears[availableYears.length - 1]}
        </p>
        <YearRangeSelector
          availableYears={availableYears}
          startYear={startYear}
          endYear={endYear}
          onStartYearChange={setStartYear}
          onEndYearChange={setEndYear}
        />
      </div>

      <DataQualityBanner dataset="budget" year={endYear} />

      {/* KPI Cards — comparaison startYear → endYear */}
      {endYearData && (
        <div className="mb-6">
          <YoyCards currentYear={endYearData} previousYear={startYearData} />
        </div>
      )}

      {/* Graphique évolution Recettes/Dépenses (plage filtrée) */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          Évolution Recettes et Dépenses
        </h2>
        <EvolutionChart data={filteredBudgetData} height={400} />
      </div>

      {/* Variation par poste — dynamique selon la plage */}
      {dynamicVariations && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <VariationRankChart data={dynamicVariations} maxItems={8} />
        </div>
      )}
    </div>
  );
}
