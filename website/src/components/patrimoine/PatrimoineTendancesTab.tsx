'use client';

/**
 * PatrimoineTendancesTab — Tab "Tendances" de la page /patrimoine.
 *
 * Contenu : FinancialHealthChart (épargne brute, surplus/déficit) + métriques dette.
 * Données issues de evolution_budget.json (métriques patrimoniales extraites du budget).
 */

import { useState, useEffect, useMemo } from 'react';
import FinancialHealthChart, { type FinancialYearData } from '@/components/FinancialHealthChart';
import GlossaryTip from '@/components/GlossaryTip';
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
  epargne_brute: number;
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function PatrimoineTendancesTab() {
  const [financialData, setFinancialData] = useState<FinancialYearData[]>([]);
  const [rawYears, setRawYears] = useState<EvolutionYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
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

        if (years.length > 0) setSelectedYear(Math.max(...years.map(y => y.year)));
      } catch (err) {
        console.error('Error loading patrimoine tendances:', err);
        setError('Impossible de charger les données financières.');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const currentYear = useMemo(() => rawYears.find(y => y.year === selectedYear), [rawYears, selectedYear]);

  /** Aggregate debt stats for the summary section */
  const debtSummary = useMemo(() => {
    if (rawYears.length === 0) return null;
    const totalNewDebt = rawYears.reduce((s, y) => s + y.totals.emprunts, 0);
    const totalRepaid = rawYears.reduce((s, y) => s + y.totals.remboursement_principal, 0);
    const totalInterest = rawYears.reduce((s, y) => s + y.totals.interets_dette, 0);
    const avgEpargneBrute = rawYears.reduce((s, y) => s + y.epargne_brute, 0) / rawYears.length;
    return { totalNewDebt, totalRepaid, totalInterest, avgEpargneBrute };
  }, [rawYears]);

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
      {/* Year focus */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-400">
          Évolution patrimoniale {rawYears[0]?.year}–{rawYears[rawYears.length - 1]?.year}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Année focus :</span>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors"
          >
            {rawYears.sort((a, b) => b.year - a.year).map(y => (
              <option key={y.year} value={y.year}>{y.year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Métriques dette de l'année sélectionnée */}
      {currentYear && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-amber-500/30 p-4 mb-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <span>🏦</span>
            Gestion de la dette {selectedYear}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Emprunts <GlossaryTip term="emprunts" /></p>
              <p className="text-lg md:text-xl font-bold text-amber-400 mt-1">+{formatEuroCompact(currentYear.totals.emprunts)}</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Remb. capital <GlossaryTip term="remboursement_principal" /></p>
              <p className="text-lg md:text-xl font-bold text-emerald-400 mt-1">-{formatEuroCompact(currentYear.totals.remboursement_principal)}</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Intérêts <GlossaryTip term="interets_dette" /></p>
              <p className="text-lg md:text-xl font-bold text-red-400 mt-1">-{formatEuroCompact(currentYear.totals.interets_dette)}</p>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Δ Dette nette <GlossaryTip term="variation_dette_nette" /></p>
              <p className={`text-lg md:text-xl font-bold mt-1 ${currentYear.totals.variation_dette_nette > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {currentYear.totals.variation_dette_nette > 0 ? '+' : ''}{formatEuroCompact(currentYear.totals.variation_dette_nette)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Graphique santé financière */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
          <span>💹</span>
          Santé Financière
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Épargne brute (capacité d&apos;autofinancement) et Surplus/Déficit (hors emprunts)
        </p>
        <FinancialHealthChart data={financialData} selectedYear={selectedYear} onYearClick={setSelectedYear} height={350} />
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

      {/* Stats cumulées dette */}
      {debtSummary && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span>📋</span>
            Synthèse sur la période
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
