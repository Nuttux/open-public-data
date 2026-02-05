'use client';

/**
 * YoyCards - Cartes KPI avec variation Year-over-Year
 * 
 * Affiche les indicateurs clés du budget avec:
 * - Valeur actuelle
 * - Variation vs année précédente (%)
 * - Indicateur visuel hausse/baisse
 */

import { useMemo } from 'react';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import type { YearlyBudget } from './EvolutionChart';

interface YoyCardsProps {
  /** Données de l'année sélectionnée */
  currentYear: YearlyBudget;
  /** Données de l'année précédente (pour calcul YoY) */
  previousYear?: YearlyBudget;
}

/**
 * Calcule la variation en pourcentage
 */
function calculateYoY(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Composant de variation avec flèche et couleur
 */
function YoyBadge({ 
  value, 
  inverse = false 
}: { 
  value: number | null; 
  inverse?: boolean;  // Pour le solde, une hausse vers moins négatif est "bonne"
}) {
  if (value === null) {
    return <span className="text-slate-500 text-xs">N/A</span>;
  }

  const isPositive = inverse ? value < 0 : value > 0;
  const color = isPositive ? 'text-emerald-400' : 'text-red-400';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';

  return (
    <span className={`text-sm font-medium ${color} flex items-center gap-1`}>
      <span>{arrow}</span>
      <span>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
    </span>
  );
}

export default function YoyCards({ currentYear, previousYear }: YoyCardsProps) {
  const yoyRecettes = useMemo(() => {
    if (!previousYear) return null;
    return calculateYoY(currentYear.recettes, previousYear.recettes);
  }, [currentYear.recettes, previousYear?.recettes]);

  const yoyDepenses = useMemo(() => {
    if (!previousYear) return null;
    return calculateYoY(currentYear.depenses, previousYear.depenses);
  }, [currentYear.depenses, previousYear?.depenses]);

  const yoySolde = useMemo(() => {
    if (!previousYear) return null;
    // Pour le solde, on calcule la différence absolue car le signe peut changer
    const diff = currentYear.solde - previousYear.solde;
    const pct = (diff / Math.abs(previousYear.solde)) * 100;
    return isFinite(pct) ? pct : null;
  }, [currentYear.solde, previousYear?.solde]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Recettes */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Recettes {currentYear.year}</span>
          {previousYear && (
            <span className="text-xs text-slate-500">vs {previousYear.year}</span>
          )}
        </div>
        <p className="text-2xl font-bold text-emerald-400">
          {formatEuroCompact(currentYear.recettes)}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {formatNumber(Math.round(currentYear.recettes / 1_000_000))} M€
          </span>
          <YoyBadge value={yoyRecettes} />
        </div>
      </div>

      {/* Dépenses */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Dépenses {currentYear.year}</span>
          {previousYear && (
            <span className="text-xs text-slate-500">vs {previousYear.year}</span>
          )}
        </div>
        <p className="text-2xl font-bold text-purple-400">
          {formatEuroCompact(currentYear.depenses)}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {formatNumber(Math.round(currentYear.depenses / 1_000_000))} M€
          </span>
          <YoyBadge value={yoyDepenses} inverse />
        </div>
      </div>

      {/* Solde */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Solde {currentYear.year}</span>
          {previousYear && (
            <span className="text-xs text-slate-500">vs {previousYear.year}</span>
          )}
        </div>
        <p className={`text-2xl font-bold ${currentYear.solde >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {currentYear.solde >= 0 ? '+' : ''}{formatEuroCompact(currentYear.solde)}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {currentYear.solde >= 0 ? 'Excédent' : 'Déficit'}
          </span>
          {yoySolde !== null && (
            <span className={`text-sm font-medium ${yoySolde > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {yoySolde > 0 ? '↑' : '↓'} {Math.abs(yoySolde).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
