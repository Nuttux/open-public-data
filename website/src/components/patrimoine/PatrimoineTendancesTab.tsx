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
import DebtStockChart, { type DebtStockYearData } from '@/components/DebtStockChart';
import ExportBar from '@/components/shared/ExportBar';
import GlossaryTip from '@/components/GlossaryTip';
import YearRangeSelector from '@/components/YearRangeSelector';
import { formatEuroCompact } from '@/lib/formatters';
import { MISC_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionYear {
  year: number;
  /** "execute" pour budget exécuté (réel), "vote" pour budget voté (prévisionnel) */
  type_budget?: 'execute' | 'vote';
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
  const t = useT();
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

        // Toutes les années (exécuté + voté) ont des métriques patrimoine complètes
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
        setError(t('patrimoine.tendances.error_load'));
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

  /** Années avec budget voté (prévisionnel) — annotées d'un astérisque */
  const votedYears = useMemo(
    () => new Set(rawYears.filter(y => y.type_budget === 'vote').map(y => y.year)),
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

  /**
   * Données pour le graphique des ratios de dette (filtrées sur la plage).
   * Pour les années sans bilan réel (budgets votés), on estime l'encours de dette
   * en partant du dernier bilan connu + emprunts − remboursements cumulés.
   */
  const filteredDebtRatiosData: DebtRatioYearData[] = useMemo(() => {
    // Trier toutes les années chronologiquement pour le calcul cumulatif
    const sorted = [...rawYears].sort((a, b) => a.year - b.year);

    // Trouver la dernière année avec un bilan réel (ancre de l'estimation)
    const lastBilanYear = sorted
      .filter(y => bilanByYear[y.year])
      .at(-1);
    const anchorDebt = lastBilanYear ? bilanByYear[lastBilanYear.year].dettes_financieres : 0;
    const anchorYear = lastBilanYear?.year ?? Infinity;

    // Construire un map year → dettes_financieres (réel ou estimé)
    const detteMap: Record<number, { value: number; estimated: boolean }> = {};
    let runningDebt = anchorDebt;

    for (const y of sorted) {
      if (bilanByYear[y.year]) {
        // Bilan réel disponible → utiliser la valeur officielle
        detteMap[y.year] = { value: bilanByYear[y.year].dettes_financieres, estimated: false };
        runningDebt = bilanByYear[y.year].dettes_financieres;
      } else if (y.year > anchorYear) {
        // Pas de bilan → estimer : dette(N) = dette(N-1) + emprunts(N) − remb(N)
        runningDebt = runningDebt + y.totals.emprunts - y.totals.remboursement_principal;
        detteMap[y.year] = { value: runningDebt, estimated: true };
      }
    }

    return sorted
      .filter(y => y.year >= startYear && y.year <= endYear && detteMap[y.year])
      .map(y => ({
        year: y.year,
        dettes_financieres: detteMap[y.year].value,
        epargne_brute: y.epargne_brute,
        recettes_fonctionnement: y.sections.fonctionnement.recettes,
        estimated: detteMap[y.year].estimated,
      }));
  }, [rawYears, bilanByYear, startYear, endYear]);

  /** Données pour le graphique d'encours de dette (stock) */
  const debtStockData: DebtStockYearData[] = useMemo(() => {
    return filteredDebtRatiosData.map(d => {
      const evo = rawYears.find(y => y.year === d.year);
      return {
        year: d.year,
        dettes_financieres: d.dettes_financieres,
        estimated: d.estimated,
        emprunts: evo?.totals.emprunts,
        remboursement_principal: evo?.totals.remboursement_principal,
      };
    });
  }, [filteredDebtRatiosData, rawYears]);

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

  // ── CSV export data ──
  const csvRows = useMemo(() => {
    return rawYears
      .filter(y => y.year >= startYear && y.year <= endYear)
      .sort((a, b) => a.year - b.year)
      .map(y => ({
        year: y.year,
        epargne_brute: y.epargne_brute,
        emprunts: y.totals.emprunts,
        remboursement_principal: y.totals.remboursement_principal,
        interets_dette: y.totals.interets_dette,
        variation_dette_nette: y.totals.variation_dette_nette,
        dettes_financieres: bilanByYear[y.year]?.dettes_financieres ?? '',
      })) as unknown as Record<string, unknown>[];
  }, [rawYears, startYear, endYear, bilanByYear]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-300">{t('patrimoine.tendances.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || rawYears.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error || t('patrimoine.tendances.no_data')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Year range selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <p className="text-sm text-slate-300">
          {t('patrimoine.tendances.evolution')} {availableYears[0]}–{availableYears[availableYears.length - 1]}
        </p>
        <YearRangeSelector
          availableYears={availableYears}
          votedYears={votedYears}
          startYear={startYear}
          endYear={endYear}
          onStartYearChange={setStartYear}
          onEndYearChange={setEndYear}
        />
      </div>

      <ExportBar
        csvData={csvRows}
        csvColumns={[
          { key: 'year', label: t('patrimoine.tendances.csv.year') },
          { key: 'epargne_brute', label: t('patrimoine.tendances.csv.epargne') },
          { key: 'emprunts', label: t('patrimoine.tendances.csv.emprunts') },
          { key: 'remboursement_principal', label: t('patrimoine.tendances.csv.remb') },
          { key: 'interets_dette', label: t('patrimoine.tendances.csv.interets') },
          { key: 'variation_dette_nette', label: t('patrimoine.tendances.csv.delta_dette') },
          { key: 'dettes_financieres', label: t('patrimoine.tendances.csv.encours') },
        ]}
        filename={`patrimoine_tendances_${startYear}-${endYear}`}
      />

      {/* Métriques dette de l'année de fin + variation vs année de début */}
      {endYearRaw && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-amber-500/30 p-4 mb-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            {t('patrimoine.tendances.dette_title')} {endYear}
            {votedYears.has(endYear) && (
              <span className="text-[9px] sm:text-[10px] font-normal text-slate-300 border border-slate-600 rounded px-1 py-0.5">
                {t('patrimoine.tendances.voted')}
              </span>
            )}
            {startYearRaw && (
              <span className="text-xs font-normal text-slate-400 ml-2">vs {startYear}</span>
            )}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            {/* Emprunts */}
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.emprunts')} <GlossaryTip term="emprunts" />
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
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.remb_capital')} <GlossaryTip term="remboursement_principal" />
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
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.interets')} <GlossaryTip term="interets_dette" />
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
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.delta_dette')} <GlossaryTip term="variation_dette_nette" />
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
          {t('patrimoine.tendances.sante_title')}
        </h2>
        <p className="text-sm text-slate-300 mb-4">
          {t('patrimoine.tendances.sante_desc')}
        </p>
        <FinancialHealthChart data={filteredFinancialData} height={350} />

        {/* Métriques de contexte : ratios en % des recettes */}
        {endYearRaw && (
          <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.surplus_deficit')} {endYear}
              </p>
              <p className={`text-lg md:text-xl font-bold mt-1 ${endYearRaw.totals.surplus_deficit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {endYearRaw.totals.surplus_deficit >= 0 ? '+' : ''}{formatEuroCompact(endYearRaw.totals.surplus_deficit)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {endYearRaw.totals.recettes_propres > 0
                  ? `${((endYearRaw.totals.surplus_deficit / endYearRaw.totals.recettes_propres) * 100).toFixed(1)}${t('patrimoine.tendances.pct_recettes_propres')}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.interets_dette')} {endYear}
              </p>
              <p className="text-lg md:text-xl font-bold text-red-400 mt-1">
                {formatEuroCompact(endYearRaw.totals.interets_dette)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {endYearRaw.sections.fonctionnement.recettes > 0
                  ? `${((endYearRaw.totals.interets_dette / endYearRaw.sections.fonctionnement.recettes) * 100).toFixed(1)}${t('patrimoine.tendances.pct_recettes_fonct')}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.epargne_brute')} {endYear}
              </p>
              <p className={`text-lg md:text-xl font-bold mt-1 ${endYearRaw.epargne_brute >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatEuroCompact(endYearRaw.epargne_brute)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {endYearRaw.sections.fonctionnement.recettes > 0
                  ? `${((endYearRaw.epargne_brute / endYearRaw.sections.fonctionnement.recettes) * 100).toFixed(1)}${t('patrimoine.tendances.pct_recettes_fonct')}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">
                {t('patrimoine.tendances.recettes_propres')} {endYear}
              </p>
              <p className="text-lg md:text-xl font-bold text-slate-100 mt-1">
                {formatEuroCompact(endYearRaw.totals.recettes_propres)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {t('patrimoine.tendances.base_ref')}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
          <div>
            <span className="inline-block w-3 h-3 rounded bg-green-500 mr-2 align-middle" />
            <strong className="text-slate-300">{t('patrimoine.tendances.legend_epargne')}</strong> {t('patrimoine.tendances.legend_epargne_desc')}
          </div>
          <div>
            <span className="inline-block w-3 h-3 rounded bg-orange-500 mr-2 align-middle" />
            <strong className="text-slate-300">{t('patrimoine.tendances.legend_surplus')}</strong> {t('patrimoine.tendances.legend_surplus_desc')}
          </div>
        </div>
      </div>

      {/* Encours total de dette (stock) */}
      {debtStockData.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
            <span className="text-lg">{MISC_ICONS.debtStock}</span>
            {t('patrimoine.tendances.encours_title')}
          </h2>
          <p className="text-sm text-slate-300 mb-4">
            {t('patrimoine.tendances.encours_desc')}
          </p>
          <DebtStockChart data={debtStockData} height={320} />
        </div>
      )}

      {/* Ratios de soutenabilité de la dette */}
      {filteredDebtRatiosData.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
            <span className="text-lg">{MISC_ICONS.debtRatios}</span>
            {t('patrimoine.tendances.soutenabilite_title')}
          </h2>
          <p className="text-sm text-slate-300 mb-4">
            {t('patrimoine.tendances.soutenabilite_desc')}
          </p>
          <DebtRatiosChart data={filteredDebtRatiosData} height={350} />
          <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
            <div>
              <strong className="text-slate-300">{t('patrimoine.tendances.duree_desendettement')}</strong> {t('patrimoine.tendances.duree_formula')}
              <br />{t('patrimoine.tendances.seuils')} <span className="text-emerald-400">{t('patrimoine.tendances.seuil_sain')}</span> {t('patrimoine.tendances.seuil_sain_label')},{' '}
              <span className="text-amber-400">{t('patrimoine.tendances.seuil_vigilance')}</span> {t('patrimoine.tendances.seuil_vigilance_label')},{' '}
              <span className="text-red-400">{t('patrimoine.tendances.seuil_critique')}</span> {t('patrimoine.tendances.seuil_critique_label')}.
            </div>
            <div>
              <strong className="text-slate-300">{t('patrimoine.tendances.taux_autofinancement')}</strong> {t('patrimoine.tendances.taux_formula')}
              <br />{t('patrimoine.tendances.seuils')} <span className="text-emerald-400">{t('patrimoine.tendances.taux_confortable')}</span> {t('patrimoine.tendances.taux_confortable_label')},{' '}
              <span className="text-amber-400">{t('patrimoine.tendances.taux_correct')}</span> {t('patrimoine.tendances.taux_correct_label')},{' '}
              <span className="text-red-400">{t('patrimoine.tendances.taux_fragile')}</span> {t('patrimoine.tendances.taux_fragile_label')}.
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            {t('patrimoine.tendances.grille_analyse')}
          </p>
        </div>
      )}

      {/* Stats cumulées dette (sur la plage sélectionnée) */}
      {debtSummary && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            {t('patrimoine.tendances.synthese')} {startYear}–{endYear}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">{t('patrimoine.tendances.total_emprunte')}</p>
              <p className="text-lg md:text-xl font-bold text-amber-400">{formatEuroCompact(debtSummary.totalNewDebt)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('patrimoine.tendances.cumule')}</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">{t('patrimoine.tendances.total_rembourse')}</p>
              <p className="text-lg md:text-xl font-bold text-emerald-400">{formatEuroCompact(debtSummary.totalRepaid)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('patrimoine.tendances.capital')}</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">{t('patrimoine.tendances.total_interets')}</p>
              <p className="text-lg md:text-xl font-bold text-red-400">{formatEuroCompact(debtSummary.totalInterest)}</p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('patrimoine.tendances.cout_cumule')}</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wide">{t('patrimoine.tendances.epargne_moy')}</p>
              <p className={`text-lg md:text-xl font-bold ${debtSummary.avgEpargneBrute >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatEuroCompact(debtSummary.avgEpargneBrute)}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('patrimoine.tendances.par_an')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
