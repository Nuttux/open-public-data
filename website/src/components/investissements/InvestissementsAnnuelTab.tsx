'use client';

/**
 * InvestissementsAnnuelTab — Onglet "Annuel" de /investissements.
 *
 * Affiche un treemap ECharts avec sélecteur de dimension de breakdown :
 *   - Par thématique (défaut)
 *   - Par chapitre budgétaire
 *   - Par arrondissement
 *
 * KPI cards au-dessus, table top projets en dessous.
 * Clic sur un bloc du treemap → filtre la table.
 *
 * Le composant est générique : les données brutes sont agrégées côté client
 * selon la dimension choisie, pas besoin de données pré-agrégées.
 */

import { useState, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { AutorisationProgramme } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Dimensions de ventilation disponibles */
type BreakdownDimension = 'thematique' | 'chapitre' | 'arrondissement';

interface BreakdownOption {
  id: BreakdownDimension;
  label: string;
  icon: string;
}

interface InvestissementsAnnuelTabProps {
  /** Projets de l'année sélectionnée */
  projets: AutorisationProgramme[];
  /** Année affichée */
  selectedYear: number;
  /** Budget d'investissement total de l'année (pour couverture) */
  budgetInvest?: number;
  /** Chargement en cours */
  isLoading: boolean;
  /** Callback pour naviguer vers l'Explorer */
  onNavigateExplorer?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BREAKDOWN_OPTIONS: BreakdownOption[] = [
  { id: 'thematique', label: 'Thématique', icon: '🎯' },
  { id: 'chapitre', label: 'Chapitre', icon: '📋' },
  { id: 'arrondissement', label: 'Arrondissement', icon: '📍' },
];

/** Couleurs pour les arrondissements (gradient chaud → froid) */
const ARR_COLORS = [
  PALETTE.amber, PALETTE.orange, PALETTE.rose, PALETTE.red,
  PALETTE.pink, PALETTE.purple, PALETTE.violet, PALETTE.blue,
  PALETTE.sky, PALETTE.cyan, PALETTE.teal, PALETTE.emerald,
  PALETTE.green, PALETTE.lime, PALETTE.yellow, PALETTE.amber,
  PALETTE.orange, PALETTE.rose, PALETTE.red, PALETTE.pink, PALETTE.purple,
];

/** Labels des arrondissements */
function arrLabel(arr: number | undefined): string {
  if (arr === undefined || arr === null) return 'Non localisé';
  if (arr === 0) return 'Paris Centre';
  return `${arr}e`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrait la clé de regroupement d'un projet selon la dimension choisie */
function getGroupKey(p: AutorisationProgramme, dim: BreakdownDimension): string {
  switch (dim) {
    case 'thematique':
      return THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.label || p.thematique || 'Autre';
    case 'chapitre':
      return p.missionTexte || p.domaineTexte || 'Non classifié';
    case 'arrondissement':
      return arrLabel(p.arrondissement);
  }
}

/** Couleur pour un groupe selon la dimension */
function getGroupColor(key: string, dim: BreakdownDimension, index: number): string {
  switch (dim) {
    case 'thematique':
      return getThematiqueColor(key);
    case 'chapitre':
      return ARR_COLORS[index % ARR_COLORS.length];
    case 'arrondissement':
      return ARR_COLORS[index % ARR_COLORS.length];
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

interface AggregatedGroup {
  key: string;
  montant: number;
  count: number;
  pct: number;
}

function aggregate(projets: AutorisationProgramme[], dim: BreakdownDimension): AggregatedGroup[] {
  const map = new Map<string, { montant: number; count: number }>();
  for (const p of projets) {
    const key = getGroupKey(p, dim);
    const existing = map.get(key) || { montant: 0, count: 0 };
    existing.montant += p.montant;
    existing.count += 1;
    map.set(key, existing);
  }
  const total = projets.reduce((s, p) => s + p.montant, 0);
  return Array.from(map.entries())
    .map(([key, val]) => ({
      key,
      montant: val.montant,
      count: val.count,
      pct: total > 0 ? (val.montant / total) * 100 : 0,
    }))
    .sort((a, b) => b.montant - a.montant);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvestissementsAnnuelTab({
  projets,
  selectedYear,
  budgetInvest,
  isLoading,
  onNavigateExplorer,
}: InvestissementsAnnuelTabProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const [breakdown, setBreakdown] = useState<BreakdownDimension>('thematique');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // ── Stats KPI ──
  const stats = useMemo(() => {
    const totalMontant = projets.reduce((s, p) => s + p.montant, 0);
    const withGeo = projets.filter(p => p.latitude && p.longitude).length;
    return {
      total: projets.length,
      totalMontant,
      withGeo,
      coverage: budgetInvest && budgetInvest > 0
        ? ((totalMontant / budgetInvest) * 100).toFixed(0)
        : null,
    };
  }, [projets, budgetInvest]);

  // ── Agrégation dynamique ──
  const groups = useMemo(() => aggregate(projets, breakdown), [projets, breakdown]);

  // ── Projets filtrés par le groupe sélectionné ──
  const filteredProjets = useMemo(() => {
    if (!selectedGroup) return projets;
    return projets.filter(p => getGroupKey(p, breakdown) === selectedGroup);
  }, [projets, selectedGroup, breakdown]);

  const sortedFiltered = useMemo(
    () => [...filteredProjets].sort((a, b) => b.montant - a.montant),
    [filteredProjets],
  );

  // ── Treemap ECharts ──
  const chartHeight = isMobile ? 280 : 380;

  const chartData = useMemo(() => {
    return groups.map((g, i) => ({
      name: g.key,
      value: g.montant,
      pct: g.pct,
      count: g.count,
      itemStyle: {
        color: getGroupColor(g.key, breakdown, i),
        borderColor: selectedGroup === g.key ? '#fff' : 'rgba(255,255,255,0.1)',
        borderWidth: selectedGroup === g.key ? 3 : 1,
      },
    }));
  }, [groups, breakdown, selectedGroup]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      padding: isMobile ? [8, 12] : [12, 16],
      confine: true,
      textStyle: { color: '#e2e8f0', fontSize: isMobile ? 11 : 13 },
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; data: { pct: number; count: number } };
        return `
          <div style="font-weight: 600; margin-bottom: 6px; font-size: ${isMobile ? '12px' : '14px'};">
            ${p.name}
          </div>
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: ${isMobile ? '11px' : '12px'};">
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">Montant</span>
              <span style="font-weight: 500;">${formatEuroCompact(p.value)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">Part du total</span>
              <span style="font-weight: 500;">${p.data.pct.toFixed(1)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">Projets</span>
              <span style="font-weight: 500;">${formatNumber(p.data.count)}</span>
            </div>
          </div>
        `;
      },
    },
    series: [{
      type: 'treemap',
      data: chartData,
      width: '100%',
      height: '100%',
      top: 0, left: 0, right: 0, bottom: 0,
      roam: false,
      nodeClick: 'link',
      breadcrumb: { show: false },
      label: {
        show: true,
        formatter: (params: unknown) => {
          const p = params as { name: string; data: { pct: number } };
          const threshold = isMobile ? 5 : 3;
          if (p.data.pct < threshold) return '';
          const name = isMobile && p.name.length > 12 ? p.name.substring(0, 11) + '…' : p.name;
          return `${name}\n${p.data.pct.toFixed(0)}%`;
        },
        fontSize: isMobile ? 10 : 12,
        fontWeight: 500,
        color: '#fff',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowBlur: isMobile ? 3 : 4,
      },
      upperLabel: { show: false },
      levels: [{
        itemStyle: {
          borderColor: '#1e293b',
          borderWidth: isMobile ? 1 : 2,
          gapWidth: isMobile ? 1 : 2,
        },
      }],
      animation: true,
      animationDuration: isMobile ? 300 : 500,
      animationEasing: 'cubicOut',
    }],
  }), [chartData, isMobile]);

  const handleTreemapClick = useCallback((params: unknown) => {
    const p = params as { name: string };
    setSelectedGroup(prev => prev === p.name ? null : p.name);
  }, []);

  /** Reset le filtre quand on change de dimension */
  const handleBreakdownChange = (dim: BreakdownDimension) => {
    setSelectedGroup(null);
    setBreakdown(dim);
  };

  // ── Render ──

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Coverage info */}
      {stats.coverage && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-sm text-blue-300">
          <strong>Couverture :</strong> Travaux localisables représentant{' '}
          <strong>~{stats.coverage}%</strong>{' '}
          du budget d&apos;investissement ({budgetInvest ? formatEuroCompact(budgetInvest) : '—'}).
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Montant total</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalMontant)}</p>
          <p className="text-xs text-slate-500 mt-1">{formatNumber(stats.total)} projets</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Projet médian</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {stats.total > 0 ? formatEuroCompact(
              [...projets].sort((a, b) => a.montant - b.montant)[Math.floor(projets.length / 2)]?.montant || 0
            ) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">montant médian</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Top projet</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {stats.total > 0 ? formatEuroCompact(
              Math.max(...projets.map(p => p.montant))
            ) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
            {stats.total > 0 ? projets.reduce((max, p) => p.montant > max.montant ? p : max, projets[0]).apTexte : '—'}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Budget invest. total</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{budgetInvest ? formatEuroCompact(budgetInvest) : '—'}</p>
          <p className="text-xs text-slate-500 mt-1">{selectedYear}</p>
        </div>
      </div>

      {/* Treemap with breakdown selector */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6 mb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-100">
              Répartition des travaux
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              {isMobile ? 'Appuyez pour filtrer' : 'Cliquez sur un bloc pour filtrer la table'}
            </p>
          </div>
          {/* Breakdown selector — même style que le toggle Liste/Carte */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Ventilation :</span>
            <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
              {BREAKDOWN_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleBreakdownChange(opt.id)}
                  className={`px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                    breakdown === opt.id
                      ? 'bg-amber-500/20 text-amber-300 shadow-sm'
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

        {/* Treemap */}
        <div
          className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden"
          style={{ height: chartHeight }}
        >
          <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            onEvents={{ click: handleTreemapClick }}
            opts={{ renderer: 'canvas' }}
          />
        </div>

        {/* Active filter indicator */}
        {selectedGroup && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm text-slate-400">Filtre actif :</span>
            <button
              onClick={() => setSelectedGroup(null)}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            >
              {selectedGroup}
              <span className="text-amber-400">×</span>
            </button>
          </div>
        )}
      </div>

      {/* Table top projets (filtrée) */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">
            {selectedGroup
              ? `${selectedGroup} — ${formatNumber(sortedFiltered.length)} projets`
              : `Top projets — ${formatNumber(sortedFiltered.length)} projets`}
          </h3>
          <span className="text-sm font-semibold text-amber-400">
            {formatEuroCompact(sortedFiltered.reduce((s, p) => s + p.montant, 0))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projet</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Chapitre</th>
                <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Montant</th>
                <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Arr.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sortedFiltered.slice(0, 30).map((p, i) => {
                const label = THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention];
                return (
                  <tr key={p.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-2 md:px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{p.apTexte}</p>
                          <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                            {label?.icon || '📋'} {label?.label || p.thematique}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <p className="text-xs text-slate-400 line-clamp-2">{p.missionTexte}</p>
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right">
                      <p className="text-xs md:text-sm font-semibold text-amber-400 whitespace-nowrap">
                        {formatEuroCompact(p.montant)}
                      </p>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-center">
                      {p.arrondissement !== undefined
                        ? <span className="text-sm text-slate-300">{arrLabel(p.arrondissement)}</span>
                        : <span className="text-slate-500">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sortedFiltered.length > 30 && onNavigateExplorer && (
          <div className="px-4 py-3 border-t border-slate-700 text-center">
            <button
              onClick={onNavigateExplorer}
              className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              Voir les {formatNumber(sortedFiltered.length)} projets →
            </button>
          </div>
        )}
        {sortedFiltered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-slate-400">Aucun projet ne correspond aux filtres</p>
          </div>
        )}
      </div>
    </div>
  );
}
