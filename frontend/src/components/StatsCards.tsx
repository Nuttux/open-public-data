'use client';

/**
 * Composant StatsCards - Affiche les KPIs principaux du budget
 * Design dark avec accent de couleurs
 */

import { formatEuroCompact } from '@/lib/formatters';

interface StatsCardsProps {
  recettes: number;
  depenses: number;
  solde: number;
  year: number;
}

export default function StatsCards({ recettes, depenses, solde, year }: StatsCardsProps) {
  const isExcedent = solde >= 0;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Recettes */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Recettes {year}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              {formatEuroCompact(recettes)}
            </p>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-lg">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
            </svg>
          </div>
        </div>
      </div>

      {/* Dépenses */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Dépenses {year}
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-400">
              {formatEuroCompact(depenses)}
            </p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-lg">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Solde */}
      <div className={`bg-slate-800/50 backdrop-blur rounded-xl border p-5 ${
        isExcedent ? 'border-emerald-500/30' : 'border-red-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {isExcedent ? 'Excédent' : 'Déficit'} {year}
            </p>
            <p className={`mt-1 text-2xl font-bold ${isExcedent ? 'text-emerald-400' : 'text-red-400'}`}>
              {isExcedent ? '+' : ''}{formatEuroCompact(solde)}
            </p>
          </div>
          <div className={`p-2.5 rounded-lg ${isExcedent ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            {isExcedent ? (
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
