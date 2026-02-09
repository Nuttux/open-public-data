'use client';

/**
 * PatrimoineTendancesTab — Tab "Tendances" de la page /patrimoine.
 *
 * Contenu : FinancialHealthChart (épargne brute, surplus/déficit) + métriques dette.
 * Données issues de evolution_budget.json (métriques patrimoniales extraites du budget).
 *
 * L'utilisateur choisit une plage d'années (début → fin) via un double sélecteur.
 * Toutes les métriques de dette, la synthèse cumulée et le graphique de santé
 * financière se recalculent dynamiquement en fonction de la période choisie.
 */

import { useState, useEffect, useMemo } from 'react';
import FinancialHealthChart, { type FinancialYearData } from '@/components/FinancialHealthChart';
import DebtRatiosChart, { type DebtRatioYearData } from '@/components/DebtRatiosChart';
import GlossaryTip from '@/components/GlossaryTip';
import YearRangeSelector from '@/components/YearRangeSelector';
import { formatEuroCompact } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionYear {
  year: number;
  totals: {
    emprunts: number;
    remboursement_principal: number;
    interets_dette: number;
    variation_dette_nette: number;
    recettes_propres: number;
    surplus_deficit: number;
  };
  sections: {
    fonctionnement: {
      recettes: number;
      depenses: number;
    };
  };
  epargne_brute: number;
}

/** Données bilan par année (chargées depuis bilan_sankey_{year}.json) */
interface BilanYearTotals {
  dettes_financieres: number;
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function PatrimoineTendancesTab() {
  const [financialData, setFinancialData] = useState<FinancialYearData[]>([]);
  const [rawYears, setRawYears] = useState<EvolutionYear[]>([]);
  const [bilanByYear, setBilanByYear] = useState<Record<number, BilanYearTotals>>({});
  const [startYear, setStartYear] = useState<number>(2019);
  const [endYear, setEndYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        // 1. Charger les données d'évolution budgétaire
        const res = await fetch('/data/evolution_budget.json');
        if (!res.ok) throw new Error('evolution_budget.json non trouvé');
        const data = await res.json();

        const years: EvolutionYear[] = data.years || [];
        setRawYears(years);

        const healthData: FinancialYearData[] = years.map(y => ({
          year: y.year,
          epargne_brute: y.epargne_brute,
          surplus_deficit: y.totals.surplus_deficit,
          recettes_propres: y.totals.recettes_propres,
          emprunts: y.totals.emprunts,
        }));
        setFinancialData(healthData);

        // 2. Charger les données bilan par année (pour dettes financières)
        const allYears = years.map(y => y.year);
        const bilanResults = await Promise.all(
          allYears.map(async (yr) => {
            try {
              const bilanRes = await fetch(`/data/bilan_sankey_${yr}.json`);
              if (!bilanRes.ok) return null;
              const bilanData = await bilanRes.json();
              return { year: yr, dettes_financieres: bilanData.totals?.dettes_financieres || 0 };
            } catch {
              return null;
            }
          })
        );
        const bilanMap: Record<number, BilanYearTotals> = {};
        for (const r of bilanResults) {
          if (r) bilanMap[r.year] = { dettes_financieres: r.dettes_financieres };
        }
        setBilanByYear(bilanMap);

        // 3. Initialiser la plage sur min/max des données
        if (allYears.length > 0) {
          setStartYear(Math.min(...allYears));
          setEndYear(Math.max(...allYears));
        }
      } catch (err) {
        console.error('Error loading patrimoine tendances:', err);
        setError('Impossible de charger les données financières.');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  /** Toutes les années disponibles */
  const availableYears = useMemo(
    () => rawYears.map(y => y.year).sort((a, b) => a - b),
    [rawYears],
  );

  /** Données de l'année de fin (affichée dans les métriques dette) */
  const endYearRaw = useMemo(
    () => rawYears.find(y => y.year === endYear),
    [rawYears, endYear],
  );

  /** Données de l'année de début (pour comparaison dans les métriques dette) */
  const startYearRaw = useMemo(
    () => rawYears.find(y => y.year === startYear),
    [rawYears, startYear],
  );

  /** Graphique filtré sur la plage sélectionnée */
  const filteredFinancialData = useMemo(
    () => financialData.filter(d => d.year >= startYear && d.year <= endYear),
    [financialData, startYear, endYear],
  );

  /** Données pour le graphique des ratios de dette (filtrées sur la plage) */
  const filteredDebtRatiosData: DebtRatioYearData[] = useMemo(() => {
    return rawYears
      .filter(y => y.year >= startYear && y.year <= endYear && bilanByYear[y.year])
      .map(y => ({
        year: y.year,
        dettes_financieres: bilanByYear[y.year].dettes_financieres,
        epargne_brute: y.epargne_brute,
        recettes_fonctionnement: y.sections.fonctionnement.recettes,
      }));
  }, [rawYears, bilanByYear, startYear, endYear]);

  /** Synthèse cumulée de la dette sur la plage sélectionnée */
  const debtSummary = useMemo(() => {
    const yearsInRange = rawYears.filter(y => y.year >= startYear && y.year <= endYear);
    if (yearsInRange.length === 0) return null;

    const totalNewDebt = yearsInRange.reduce((s, y) => s + y.totals.emprunts, 0);
    const totalRepaid = yearsInRange.reduce((s, y) => s + y.totals.remboursement_principal, 0);
    const totalInterest = yearsInRange.reduce((s, y) => s + y.totals.interets_dette, 0);
    const avgEpargneBrute = yearsInRange.reduce((s, y) => s + y.epargne_brute, 0) / yearsInRange.length;
    return { totalNewDebt, totalRepaid, totalInterest, avgEpargneBrute };
  }, [rawYears, startYear, endYear]);

  /**
   * Calcule la variation (%) entre startYear et endYear pour une métrique dette.
   * Retourne null si pas de données.
   */
  const debtVariation = useMemo(() => {
    if (!startYearRaw || !endYearRaw) return null;

    const calc = (end: number, start: number) => {
      if (start === 0) return null;
      return Math.round(((end - start) / Math.abs(start)) * 1000) / 10;
    };

    return {
      emprunts: calc(endYearRaw.totals.emprunts, startYearRaw.totals.emprunts),
      remb: calc(endYearRaw.totals.remboursement_principal, startYearRaw.totals.remboursement_principal),
      interets: calc(endYearRaw.totals.interets_dette, startYearRaw.totals.interets_dette),
      detteNette: calc(endYearRaw.totals.variation_dette_nette, startYearRaw.totals.variation_dette_nette),
    };
  }, [startYearRaw, endYearRaw]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error || rawYears.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error || 'Aucune donnée disponible'}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Year range selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <p className="text-sm text-slate-400">
          Évolution patrimoniale {availableYears[0]}–{availableYears[availableYears.length - 1]}
        </p>
        <YearRangeSelector
          availableYears={availableYears}
          startYear={startYear}
          endYear={endYear}
          onStartYearChange={setStartYear}
          onEndYearChange={setEndYear}
        />
      </div>

      {/* Métriques dette de l'année de fin + variation vs année de début */}
      {endYearRaw && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-amber-500/30 p-4 mb-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            Gestion de la dette {endYear}
            {startYearRaw && (
              <span className="text-xs font-normal text-slate-500 ml-2">vs {startYear}</span>
            )}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            {/* Emprunts */}
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">
                Emprunts <GlossaryTip term="emprunts" />
              </p>
              <p className="text-lg md:text-xl font-bold text-amber-400 mt-1">
                +{formatEuroCompact(endYearRaw.totals.emprunts)}
              </p>
              {debtVariation?.emprunts != null && (
                <p className={`text-[10px] mt-0.5 ${debtVariation.emprunts > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {debtVariation.emprunts > 0 ? '↑' : '↓'} {debtVariation.emprunts > 0 ? '+' : ''}{debtVariation.emprunts}%
                </p>
              )}
            </div>
            {/* Remboursement capital */}
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">
                Remb. capital <GlossaryTip term="remboursement_principal" />
              </p>
              <p className="text-lg md:text-xl font-bold text-emerald-400 mt-1">
                -{formatEuroCompact(endYearRaw.totals.remboursement_principal)}
              </p>
              {debtVariation?.remb != null && (
                <p className={`text-[10px] mt-0.5 ${debtVariation.remb > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {debtVariation.remb > 0 ? '↑' : '↓'} {debtVariation.remb > 0 ? '+' : ''}{debtVariation.remb}%
                </p>
              )}
            </div>
            {/* Intérêts */}
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">
                Intérêts <GlossaryTip term="interets_dette" />
              </p>
              <p className="text-lg md:text-xl font-bold text-red-400 mt-1">
                -{formatEuroCompact(endYearRaw.totals.interets_dette)}
              </p>
              {debtVariation?.interets != null && (
                <p className={`text-[10px] mt-0.5 ${debtVariation.interets > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {debtVariation.interets > 0 ? '↑' : '↓'} {debtVariation.interets > 0 ? '+' : ''}{debtVariation.interets}%
                </p>
              )}
            </div>
            {/* Variation dette nette */}
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">
                Δ Dette nette <GlossaryTip term="variation_dette_nette" />
              </p>
              <p className={`text-lg md:text-xl font-bold mt-1 ${endYearRaw.totals.variation_dette_nette > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {endYearRaw.totals.variation_dette_nette > 0 ? '+' : ''}{formatEuroCompact(endYearRaw.totals.variation_dette_nette)}
              </p>
              {debtVariation?.detteNette != null && (
                <p className={`text-[10px] mt-0.5 ${debtVariation.detteNette > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {debtVariation.detteNette > 0 ? '↑' : '↓'} {debtVariation.detteNette > 0 ? '+' : ''}{debtVariation.detteNette}%
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Graphique santé financière (plage filtrée) */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
          Santé Financière
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Épargne brute (capacité d&apos;autofinancement) et Surplus/Déficit (hors emprunts)
        </p>
        <FinancialHealthChart data={filteredFinancialData} height={350} />
        <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
          <div>
            <span className="inline-block w-3 h-3 rounded bg-green-500 mr-2 align-middle" />
            <strong className="text-slate-300">Épargne brute</strong> = Recettes fonctionnement − Dépenses fonctionnement.
          </div>
          <div>
            <span className="inline-block w-3 h-3 rounded bg-orange-500 mr-2 align-middle" />
            <strong className="text-slate-300">Surplus/Déficit</strong> = Recettes propres − Dépenses totales (emprunts exclus).
          </div>
        </div>
      </div>

      {/* Ratios de soutenabilité de la dette */}
      {filteredDebtRatiosData.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
            <span>📐</span>
            Soutenabilité de la dette
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Deux ratios clés : durée de désendettement (barres) et taux d&apos;autofinancement (courbe)
          </p>
          <DebtRatiosChart data={filteredDebtRatiosData} height={350} />
          <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
            <div>
              <strong className="text-slate-300">Durée de désendettement</strong> = Dettes financières ÷ Épargne brute.
              <br />Seuils : <span className="text-emerald-400">≤ 7 ans</span> (sain),{' '}
              <span className="text-amber-400">7–12 ans</span> (vigilance),{' '}
              <span className="text-red-400">&gt; 12 ans</span> (critique).
            </div>
            <div>
              <strong className="text-slate-300">Taux d&apos;autofinancement</strong> = Épargne brute ÷ Recettes de fonctionnement.
              <br />Seuils : <span className="text-emerald-400">≥ 15%</span> (confortable),{' '}
              <span className="text-amber-400">8–15%</span> (correct),{' '}
              <span className="text-red-400">&lt; 8%</span> (fragile).
            </div>
          </div>
        </div>
      )}

      {/* Stats cumulées dette (sur la plage sélectionnée) */}
      {debtSummary && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            Synthèse {startYear}–{endYear}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Total emprunté</p>
              <p className="text-lg md:text-xl font-bold text-amber-400">{formatEuroCompact(debtSummary.totalNewDebt)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Cumulé</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Total remboursé</p>
              <p className="text-lg md:text-xl font-bold text-emerald-400">{formatEuroCompact(debtSummary.totalRepaid)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Capital</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Total intérêts</p>
              <p className="text-lg md:text-xl font-bold text-red-400">{formatEuroCompact(debtSummary.totalInterest)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">Coût cumulé</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Épargne brute moy.</p>
              <p className={`text-lg md:text-xl font-bold ${debtSummary.avgEpargneBrute >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatEuroCompact(debtSummary.avgEpargneBrute)}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">par an</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
