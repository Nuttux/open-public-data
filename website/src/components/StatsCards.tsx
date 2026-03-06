'use client';

/**
 * Composant StatsCards - KPIs principaux du budget
 *
 * Affiche les 4 métriques essentielles:
 * 1. Recettes propres (hors emprunts)
 * 2. Dépenses totales
 * 3. Déficit / Excédent (recettes propres - dépenses)
 * 4. Dette nette (variation + intérêts + lien patrimoine)
 *
 * Chaque métrique dispose d'un GlossaryTip (?) pour expliquer
 * le terme aux citoyens (hover desktop, tap mobile).
 *
 * Responsive: cartes empilées sur mobile, textes adaptés
 */

import Link from 'next/link';
import { formatEuroCompact } from '@/lib/formatters';
import GlossaryTip from './GlossaryTip';
import type { DebtMetrics } from './budget/BudgetAnnuelTab';

interface StatsCardsProps {
  recettes: number;
  depenses: number;
  year: number;
  emprunts?: number;  // Pour calculer recettes propres
  debt?: DebtMetrics;
}

export default function StatsCards({ recettes, depenses, year, emprunts = 0, debt }: StatsCardsProps) {
  // Recettes propres = recettes totales - emprunts
  const recettesPropres = recettes - emprunts;

  // Déficit = dépenses - recettes propres (positif = déficit, négatif = excédent)
  const deficit = depenses - recettesPropres;
  const isDeficit = deficit > 0;

  // Debt metrics
  const debtIncreasing = debt ? debt.variation_dette_nette > 0 : false;
  const interestPctRecettes = debt && debt.recettes_totales > 0
    ? (debt.interets_dette / debt.recettes_totales) * 100
    : 0;

  return (
    <div className="mb-4 sm:mb-6">
      {/* 4 KPIs principaux - grille adaptative */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${debt ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 sm:gap-4 mb-3`}>
        {/* Recettes propres */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-emerald-500/30 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs font-medium text-emerald-400 uppercase tracking-wider">
                Recettes propres {year}
                <GlossaryTip term="recettes_propres" />
              </p>
              <p className="mt-1 text-xl sm:text-2xl font-bold text-emerald-400">
                {formatEuroCompact(recettesPropres)}
              </p>
            </div>
            <div className="p-2 sm:p-2.5 bg-emerald-500/10 rounded-lg flex-shrink-0 ml-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Dépenses totales — rose = sortie d'argent (cohérent FLUX_COLORS.depenses) */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-rose-500/30 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs font-medium text-rose-400 uppercase tracking-wider">
                Dépenses totales {year}
                <GlossaryTip term="depenses" />
              </p>
              <p className="mt-1 text-xl sm:text-2xl font-bold text-rose-400">
                {formatEuroCompact(depenses)}
              </p>
            </div>
            <div className="p-2 sm:p-2.5 bg-rose-500/10 rounded-lg flex-shrink-0 ml-2">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Déficit / Excédent — red=déficit, emerald=excédent (cohérent FLUX_COLORS.solde) */}
        <div className={`bg-slate-800/50 backdrop-blur rounded-xl border p-4 sm:p-5 ${
          !debt ? 'sm:col-span-2 lg:col-span-1' : ''
        } ${
          isDeficit ? 'border-red-500/50' : 'border-emerald-500/50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] sm:text-xs font-medium uppercase tracking-wider ${
                isDeficit ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {isDeficit ? 'Déficit' : 'Excédent'} {year}
                <GlossaryTip term="surplus_deficit" />
              </p>
              <p className={`mt-1 text-xl sm:text-2xl font-bold ${
                isDeficit ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {formatEuroCompact(Math.abs(deficit))}
              </p>
            </div>
            <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ml-2 ${
              isDeficit ? 'bg-red-500/10' : 'bg-emerald-500/10'
            }`}>
              {isDeficit ? (
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              ) : (
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Dette nette — amber = endettement */}
        {debt && (
          <div className={`bg-slate-800/50 backdrop-blur rounded-xl border p-4 sm:p-5 ${
            debtIncreasing ? 'border-amber-500/40' : 'border-emerald-500/40'
          }`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] sm:text-xs font-medium uppercase tracking-wider ${
                  debtIncreasing ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  Endettement net {year}
                  <GlossaryTip term="variation_dette_nette" />
                </p>
                <p className={`mt-1 text-xl sm:text-2xl font-bold ${
                  debtIncreasing ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {debtIncreasing ? '+' : ''}{formatEuroCompact(debt.variation_dette_nette)}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[10px] text-slate-400">
                    {formatEuroCompact(debt.interets_dette)} d&apos;intérêts ({interestPctRecettes.toFixed(1)}% des recettes)
                  </p>
                  <Link
                    href="/patrimoine"
                    className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Voir le détail dette →
                  </Link>
                </div>
              </div>
              <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ml-2 ${
                debtIncreasing ? 'bg-amber-500/10' : 'bg-emerald-500/10'
              }`}>
                <svg className={`w-5 h-5 sm:w-6 sm:h-6 ${debtIncreasing ? 'text-amber-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
