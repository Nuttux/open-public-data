'use client';

/**
 * YoyCards - Cartes KPI avec variation entre deux années
 *
 * Affiche les indicateurs clés du budget avec:
 * - Recettes propres (hors emprunts)
 * - Dépenses totales
 * - Déficit ou Excédent (label direct, pas "Solde")
 * - Variation entre l'année de début et l'année de fin (%)
 * - Indicateur visuel hausse/baisse
 *
 * Supporte la comparaison entre deux années quelconques (pas forcément N vs N-1).
 * Chaque label dispose d'un GlossaryTip (?) pour expliquer le terme aux citoyens.
 */

import { useMemo } from 'react';
import { formatEuroCompact } from '@/lib/formatters';
import GlossaryTip from './GlossaryTip';
import type { YearlyBudget } from './EvolutionChart';

interface YoyCardsProps {
  /** Données de l'année de fin (affichée en gros) */
  currentYear: YearlyBudget;
  /** Données de l'année de début (pour calcul de la variation) */
  previousYear?: YearlyBudget;
}

/**
 * Calcule la variation en pourcentage entre deux valeurs
 */
function calculateVariation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Composant de variation avec flèche et couleur
 */
function VariationBadge({
  value,
  inverse = false,
}: {
  value: number | null;
  /** Pour le solde, une hausse vers moins négatif est "bonne" */
  inverse?: boolean;
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
  const variationRecettes = useMemo(() => {
    if (!previousYear) return null;
    return calculateVariation(currentYear.recettes, previousYear.recettes);
  }, [currentYear.recettes, previousYear]);

  const variationDepenses = useMemo(() => {
    if (!previousYear) return null;
    return calculateVariation(currentYear.depenses, previousYear.depenses);
  }, [currentYear.depenses, previousYear]);

  const variationSolde = useMemo(() => {
    if (!previousYear) return null;
    // Pour le solde, on calcule la différence absolue car le signe peut changer
    const diff = currentYear.solde - previousYear.solde;
    const pct = (diff / Math.abs(previousYear.solde)) * 100;
    return isFinite(pct) ? pct : null;
  }, [currentYear.solde, previousYear]);

  /** Label de comparaison affiché dans les cartes */
  const vsLabel = previousYear ? `vs ${previousYear.year}` : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Recettes Propres (hors emprunts) */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap">
            Recettes {currentYear.year} <GlossaryTip term="recettes_propres" />
          </span>
          {vsLabel && (
            <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">{vsLabel}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-emerald-400">
              {formatEuroCompact(currentYear.recettes)}
            </p>
          </div>
          <VariationBadge value={variationRecettes} />
        </div>
      </div>

      {/* Dépenses */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap">
            Dépenses {currentYear.year} <GlossaryTip term="depenses" />
          </span>
          {vsLabel && (
            <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">{vsLabel}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold text-rose-400">
            {formatEuroCompact(currentYear.depenses)}
          </p>
          <VariationBadge value={variationDepenses} inverse />
        </div>
      </div>

      {/* Déficit / Excédent — label direct, pas "Solde" */}
      <div className={`bg-slate-800/50 backdrop-blur rounded-xl border p-4 ${
        currentYear.solde >= 0 ? 'border-emerald-500/40' : 'border-red-500/40'
      }`}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className={`text-xs uppercase tracking-wide whitespace-nowrap ${
            currentYear.solde >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {currentYear.solde >= 0 ? 'Excédent' : 'Déficit'} {currentYear.year} <GlossaryTip term="surplus_deficit" />
          </span>
          {vsLabel && (
            <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">{vsLabel}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className={`text-2xl font-bold ${currentYear.solde >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatEuroCompact(Math.abs(currentYear.solde))}
          </p>
          <VariationBadge value={variationSolde} />
        </div>
      </div>
    </div>
  );
}
