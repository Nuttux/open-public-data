'use client';

/**
 * Composant StatsCards - KPIs principaux du budget
 * 
 * Affiche les 3 métriques essentielles:
 * 1. Recettes propres (hors emprunts)
 * 2. Dépenses totales
 * 3. Déficit / Excédent (recettes propres - dépenses)
 * 
 * + Indicateur secondaire: Équilibre budgétaire comptable
 */

import { formatEuroCompact } from '@/lib/formatters';

interface StatsCardsProps {
  recettes: number;
  depenses: number;
  solde: number;
  year: number;
  emprunts?: number;  // Pour calculer recettes propres
}

export default function StatsCards({ recettes, depenses, solde, year, emprunts = 0 }: StatsCardsProps) {
  // Recettes propres = recettes totales - emprunts
  const recettesPropres = recettes - emprunts;
  
  // Déficit = dépenses - recettes propres (positif = déficit, négatif = excédent)
  const deficit = depenses - recettesPropres;
  const isDeficit = deficit > 0;
  
  return (
    <div className="mb-6">
      {/* 3 KPIs principaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
        {/* Recettes propres */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-emerald-500/30 p-5">
        <div className="flex items-center justify-between">
          <div>
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                Recettes propres {year}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
                {formatEuroCompact(recettesPropres)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                hors emprunts
            </p>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-lg">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

        {/* Dépenses totales */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-blue-500/30 p-5">
        <div className="flex items-center justify-between">
          <div>
              <p className="text-xs font-medium text-blue-400 uppercase tracking-wider">
                Dépenses totales {year}
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-400">
              {formatEuroCompact(depenses)}
            </p>
              <p className="text-xs text-slate-500 mt-1">
                fonctionnement + investissement
              </p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-lg">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>
      </div>

        {/* Déficit / Excédent */}
      <div className={`bg-slate-800/50 backdrop-blur rounded-xl border p-5 ${
          isDeficit ? 'border-red-500/50' : 'border-green-500/50'
      }`}>
        <div className="flex items-center justify-between">
          <div>
              <p className={`text-xs font-medium uppercase tracking-wider ${
                isDeficit ? 'text-red-400' : 'text-green-400'
              }`}>
                {isDeficit ? '⚠️ Déficit' : '✅ Excédent'} {year}
            </p>
              <p className={`mt-1 text-2xl font-bold ${
                isDeficit ? 'text-red-400' : 'text-green-400'
              }`}>
                {formatEuroCompact(Math.abs(deficit))}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {isDeficit ? 'financé par emprunt' : 'capacité d\'autofinancement'}
            </p>
          </div>
            <div className={`p-2.5 rounded-lg ${
              isDeficit ? 'bg-red-500/10' : 'bg-green-500/10'
            }`}>
              {isDeficit ? (
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            ) : (
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Indicateur secondaire - Équilibre budgétaire comptable */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">Équilibre budgétaire comptable :</span>
          <span className={`font-medium ${solde >= 0 ? 'text-slate-300' : 'text-amber-400'}`}>
            {solde >= 0 ? '+' : ''}{formatEuroCompact(solde)}
          </span>
          <span className="text-slate-600 text-xs">(recettes totales − dépenses totales, y.c. emprunts)</span>
        </div>
      </div>
    </div>
  );
}
