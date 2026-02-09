'use client';

/**
 * LogementsAnnuelTab — Onglet "Annuel" de /logements.
 *
 * Affiche :
 *   - KPI cards : total logements, programmes, PLAI, PLUS, PLS
 *   - Toggle breakdown : par bailleur (défaut) ou par arrondissement
 *   - Table classement bailleurs avec barres de progression
 *   - Légende types de logements sociaux
 *
 * Sources : données chargées par le parent et transmises en props.
 */

import { useState, useMemo } from 'react';
import type { LogementSocial } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

type BreakdownDimension = 'bailleur' | 'arrondissement';

interface BreakdownOption {
  id: BreakdownDimension;
  label: string;
  icon: string;
}

interface BailleurStats {
  nom: string;
  nbProjets: number;
  nbLogements: number;
  nbPLAI: number;
  nbPLUS: number;
  nbPLS: number;
  arrondissements: number[];
}

interface ArrondissementRow {
  nom: string;
  code: number;
  nbProjets: number;
  nbLogements: number;
  nbPLAI: number;
  nbPLUS: number;
  nbPLS: number;
}

interface LogementsAnnuelTabProps {
  /** Logements filtrés par arrondissement (depuis le parent) */
  logements: LogementSocial[];
  /** Arrondissement sélectionné (null = tous) */
  selectedArrondissement: number | null;
  /** Stats globaux */
  stats: {
    projets: number;
    logements: number;
    PLAI: number;
    PLUS: number;
    PLS: number;
    bailleurs: number;
  };
  /** Callback pour naviguer vers un bailleur sur la carte */
  onViewBailleurOnMap?: (bailleur: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BREAKDOWN_OPTIONS: BreakdownOption[] = [
  { id: 'bailleur', label: 'Bailleurs', icon: '🏢' },
  { id: 'arrondissement', label: 'Arrondissement', icon: '📍' },
];

/** Label pour un arrondissement */
function arrLabel(code: number): string {
  if (code === 0) return 'Paris Centre';
  return `${code}e arr.`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LogementsAnnuelTab({
  logements,
  selectedArrondissement,
  stats,
  onViewBailleurOnMap,
}: LogementsAnnuelTabProps) {
  const [breakdown, setBreakdown] = useState<BreakdownDimension>('bailleur');

  // ── Bailleurs aggregation ──
  const topBailleurs = useMemo(() => {
    const b: Record<string, BailleurStats> = {};
    logements.forEach(l => {
      const nom = l.bailleur || '(non renseigné)';
      if (!b[nom]) b[nom] = { nom, nbProjets: 0, nbLogements: 0, nbPLAI: 0, nbPLUS: 0, nbPLS: 0, arrondissements: [] };
      b[nom].nbProjets++;
      b[nom].nbLogements += l.nbLogements;
      b[nom].nbPLAI += l.nbPLAI || 0;
      b[nom].nbPLUS += l.nbPLUS || 0;
      b[nom].nbPLS += l.nbPLS || 0;
      if (!b[nom].arrondissements.includes(l.arrondissement)) b[nom].arrondissements.push(l.arrondissement);
    });
    return Object.values(b).sort((a, b) => b.nbLogements - a.nbLogements);
  }, [logements]);

  // ── Arrondissement aggregation ──
  const arrondissementRows = useMemo(() => {
    const a: Record<number, ArrondissementRow> = {};
    logements.forEach(l => {
      const code = l.arrondissement;
      if (!a[code]) a[code] = { nom: arrLabel(code), code, nbProjets: 0, nbLogements: 0, nbPLAI: 0, nbPLUS: 0, nbPLS: 0 };
      a[code].nbProjets++;
      a[code].nbLogements += l.nbLogements;
      a[code].nbPLAI += l.nbPLAI || 0;
      a[code].nbPLUS += l.nbPLUS || 0;
      a[code].nbPLS += l.nbPLS || 0;
    });
    return Object.values(a).sort((x, y) => y.nbLogements - x.nbLogements);
  }, [logements]);

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Total Logements</p>
          <p className="text-xl md:text-2xl font-bold text-emerald-400 mt-1">
            {stats.logements >= 1000 ? `${(stats.logements / 1000).toFixed(0)}k` : formatNumber(stats.logements)}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Programmes</p>
          <p className="text-xl md:text-2xl font-bold text-slate-100 mt-1">{formatNumber(stats.projets)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLAI (très social)</p>
          <p className="text-xl md:text-2xl font-bold text-blue-400 mt-1">
            {stats.PLAI >= 1000 ? `${(stats.PLAI / 1000).toFixed(0)}k` : formatNumber(stats.PLAI)}
          </p>
          <p className="text-[10px] md:text-xs text-slate-500">
            {stats.logements > 0 ? ((stats.PLAI / stats.logements) * 100).toFixed(0) : 0}%
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLUS (social)</p>
          <p className="text-xl md:text-2xl font-bold text-cyan-400 mt-1">
            {stats.PLUS >= 1000 ? `${(stats.PLUS / 1000).toFixed(0)}k` : formatNumber(stats.PLUS)}
          </p>
          <p className="text-[10px] md:text-xs text-slate-500">
            {stats.logements > 0 ? ((stats.PLUS / stats.logements) * 100).toFixed(0) : 0}%
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4 col-span-2 sm:col-span-1">
          <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLS (intermédiaire)</p>
          <p className="text-xl md:text-2xl font-bold text-violet-400 mt-1">
            {stats.PLS >= 1000 ? `${(stats.PLS / 1000).toFixed(0)}k` : formatNumber(stats.PLS)}
          </p>
          <p className="text-[10px] md:text-xs text-slate-500">
            {stats.logements > 0 ? ((stats.PLS / stats.logements) * 100).toFixed(0) : 0}%
          </p>
        </div>
      </div>

      {/* Breakdown selector + table */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            Classement
            {selectedArrondissement !== null && (
              <span className="text-sm font-normal text-slate-400">
                ({selectedArrondissement === 0 ? 'Paris Centre' : `${selectedArrondissement}ème`})
              </span>
            )}
          </h2>
          {/* Breakdown toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Ventilation :</span>
            <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
              {BREAKDOWN_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setBreakdown(opt.id)}
                  className={`px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                    breakdown === opt.id
                      ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table: Bailleurs */}
        {breakdown === 'bailleur' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase w-6 md:w-8">#</th>
                  <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Bailleur</th>
                  <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Logements</th>
                  <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projets</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-blue-400 uppercase">PLAI</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-cyan-400 uppercase">PLUS</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-violet-400 uppercase">PLS</th>
                  <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Part</th>
                  {onViewBailleurOnMap && (
                    <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {topBailleurs.slice(0, 20).map((b, i) => {
                  const pct = stats.logements > 0 ? (b.nbLogements / stats.logements) * 100 : 0;
                  return (
                    <tr key={b.nom} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-2 md:px-4 py-3 text-slate-500 text-sm">{i + 1}</td>
                      <td className="px-2 md:px-4 py-3">
                        <p className="text-xs md:text-sm font-medium text-slate-200">{b.nom}</p>
                        <p className="text-[10px] md:text-xs text-slate-500">{b.arrondissements.length} arr.</p>
                      </td>
                      <td className="px-2 md:px-4 py-3 text-right">
                        <p className="text-xs md:text-sm font-semibold text-emerald-400">{formatNumber(b.nbLogements)}</p>
                      </td>
                      <td className="px-2 md:px-4 py-3 text-right text-xs md:text-sm text-slate-300">{formatNumber(b.nbProjets)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-blue-400">{formatNumber(b.nbPLAI)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-cyan-400">{formatNumber(b.nbPLUS)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-violet-400">{formatNumber(b.nbPLS)}</td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(pct * 2, 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      {onViewBailleurOnMap && (
                        <td className="hidden md:table-cell px-4 py-3 text-center">
                          <button
                            onClick={() => onViewBailleurOnMap(b.nom)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            Voir sur carte →
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table: Arrondissements */}
        {breakdown === 'arrondissement' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase w-6 md:w-8">#</th>
                  <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Arrondissement</th>
                  <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Logements</th>
                  <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projets</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-blue-400 uppercase">PLAI</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-cyan-400 uppercase">PLUS</th>
                  <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-violet-400 uppercase">PLS</th>
                  <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Part</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {arrondissementRows.map((a, i) => {
                  const pct = stats.logements > 0 ? (a.nbLogements / stats.logements) * 100 : 0;
                  return (
                    <tr key={a.code} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-2 md:px-4 py-3 text-slate-500 text-sm">{i + 1}</td>
                      <td className="px-2 md:px-4 py-3">
                        <p className="text-xs md:text-sm font-medium text-slate-200">{a.nom}</p>
                      </td>
                      <td className="px-2 md:px-4 py-3 text-right">
                        <p className="text-xs md:text-sm font-semibold text-emerald-400">{formatNumber(a.nbLogements)}</p>
                      </td>
                      <td className="px-2 md:px-4 py-3 text-right text-xs md:text-sm text-slate-300">{formatNumber(a.nbProjets)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-blue-400">{formatNumber(a.nbPLAI)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-cyan-400">{formatNumber(a.nbPLUS)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-violet-400">{formatNumber(a.nbPLS)}</td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(pct * 2, 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {topBailleurs.length > 20 && breakdown === 'bailleur' && (
          <div className="px-4 py-3 border-t border-slate-700 text-center">
            <p className="text-sm text-slate-500">+ {topBailleurs.length - 20} autres bailleurs</p>
          </div>
        )}
      </div>

      {/* Légende types */}
      <div className="mt-6 bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Types de logements sociaux</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-400 mt-0.5" />
            <div>
              <p className="text-slate-300 font-medium">PLAI - Très social</p>
              <p className="text-slate-500">Revenus &lt; 60% du plafond HLM.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-400 mt-0.5" />
            <div>
              <p className="text-slate-300 font-medium">PLUS - Social standard</p>
              <p className="text-slate-500">Revenus &lt; 100% du plafond HLM.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-400 mt-0.5" />
            <div>
              <p className="text-slate-300 font-medium">PLS - Intermédiaire</p>
              <p className="text-slate-500">Revenus 100-130% du plafond HLM.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
