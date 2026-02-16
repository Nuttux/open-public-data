'use client';

/**
 * SubventionsAnnuelTab — Onglet "Annuel" de /subventions.
 *
 * Affiche un treemap ECharts avec sélecteur de dimension de breakdown :
 *   - Par thématique (défaut)
 *   - Par direction
 *   - Par type d'organisme
 *
 * KPI cards au-dessus, table top bénéficiaires en dessous.
 * Clic sur un bloc du treemap → filtre la table.
 *
 * Pattern identique à InvestissementsAnnuelTab (Travaux = référence).
 */

import { useState, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import DataQualityBanner from '@/components/DataQualityBanner';
import type { Beneficiaire } from '@/components/SubventionsTable';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Dimensions de ventilation disponibles */
type BreakdownDimension = 'thematique' | 'direction' | 'type_organisme';

interface BreakdownOption {
  id: BreakdownDimension;
  label: string;
  icon: string;
}

interface SubventionsAnnuelTabProps {
  /** Année sélectionnée */
  selectedYear: number;
  /** Liste des bénéficiaires */
  beneficiaires: Beneficiaire[];
  /** Nombre total de subventions (depuis l'index) */
  nbSubventions: number;
  /** Chargement en cours */
  isLoading: boolean;
  /** Erreur éventuelle */
  error: string | null;
  /** Callback pour naviguer vers l'Explorer */
  onNavigateExplorer?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BREAKDOWN_OPTIONS: BreakdownOption[] = [
  { id: 'thematique', label: 'Thématique', icon: '🎯' },
  { id: 'direction', label: 'Direction', icon: '🏛' },
  { id: 'type_organisme', label: 'Type organisme', icon: '👥' },
];

/** Mapping nature juridique → type organisme simplifié */
const NATURE_TO_TYPE: Record<string, string> = {
  'Associations': 'Associations',
  'Etablissements publics': 'Établissements publics',
  'Etablissements de droit public': 'Établissements publics',
  'Autres personnes de droit public': 'Établissements publics',
  'Etat': 'Établissements publics',
  'Communes': 'Établissements publics',
  'Département': 'Établissements publics',
  'Régions': 'Établissements publics',
  'Entreprises': 'Entreprises',
  'Autres personnes de droit privé': 'Autres privés',
  'Personnes physiques': 'Personnes physiques',
  'Autres': 'Autres',
};

/** Couleurs pour directions et types (gradient) */
const DIM_COLORS = [
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green, PALETTE.orange, PALETTE.red,
  PALETTE.teal, PALETTE.emerald, PALETTE.violet, PALETTE.rose,
  PALETTE.sky, PALETTE.lime, PALETTE.yellow, PALETTE.slate,
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrait la clé de regroupement d'un bénéficiaire selon la dimension choisie */
function getGroupKey(b: Beneficiaire, dim: BreakdownDimension): string {
  switch (dim) {
    case 'thematique':
      return b.thematique || 'Non classifié';
    case 'direction':
      return b.direction || 'Non renseignée';
    case 'type_organisme':
      return NATURE_TO_TYPE[b.nature_juridique || ''] || 'Autres';
  }
}

/** Couleur pour un groupe selon la dimension */
function getGroupColor(key: string, dim: BreakdownDimension, index: number): string {
  if (dim === 'thematique') return getThematiqueColor(key);
  return DIM_COLORS[index % DIM_COLORS.length];
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

interface AggregatedGroup {
  key: string;
  montant: number;
  count: number;
  pct: number;
}

function aggregateBeneficiaires(beneficiaires: Beneficiaire[], dim: BreakdownDimension): AggregatedGroup[] {
  const map = new Map<string, { montant: number; count: number }>();
  for (const b of beneficiaires) {
    const key = getGroupKey(b, dim);
    const existing = map.get(key) || { montant: 0, count: 0 };
    existing.montant += b.montant_total;
    existing.count += 1;
    map.set(key, existing);
  }
  const total = beneficiaires.reduce((s, b) => s + b.montant_total, 0);
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

export default function SubventionsAnnuelTab({
  selectedYear,
  beneficiaires,
  nbSubventions,
  isLoading,
  error,
  onNavigateExplorer,
}: SubventionsAnnuelTabProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const [breakdown, setBreakdown] = useState<BreakdownDimension>('thematique');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // ── Stats KPI ──
  const stats = useMemo(() => {
    const totalMontant = beneficiaires.reduce((s, b) => s + b.montant_total, 0);
    return { total: beneficiaires.length, totalMontant };
  }, [beneficiaires]);

  // ── Top bénéficiaire + médiane ──
  const topKpis = useMemo(() => {
    if (beneficiaires.length === 0) return null;
    const sorted = [...beneficiaires].sort((a, b) => b.montant_total - a.montant_total);
    const topBenef = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)].montant_total;
    return { topBenef, median };
  }, [beneficiaires]);

  // ── Agrégation dynamique ──
  const groups = useMemo(() => aggregateBeneficiaires(beneficiaires, breakdown), [beneficiaires, breakdown]);

  // ── Bénéficiaires filtrés par le groupe sélectionné ──
  const filteredBenefs = useMemo(() => {
    if (!selectedGroup) return beneficiaires;
    return beneficiaires.filter(b => getGroupKey(b, breakdown) === selectedGroup);
  }, [beneficiaires, selectedGroup, breakdown]);

  const sortedFiltered = useMemo(
    () => [...filteredBenefs].sort((a, b) => b.montant_total - a.montant_total),
    [filteredBenefs],
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
              <span style="color: #94a3b8;">Bénéficiaires</span>
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
        <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <DataQualityBanner dataset="subventions" year={selectedYear} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400 flex items-center gap-2"><span>⚠</span>{error}</p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Montant total</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalMontant)}</p>
          <p className="text-xs text-slate-500 mt-1">{formatNumber(nbSubventions)} subventions</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Bénéficiaire médian</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">
            {topKpis ? formatEuroCompact(topKpis.median) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">montant médian</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Top bénéficiaire</p>
          <p className="text-lg font-bold text-emerald-400 mt-1 truncate" title={topKpis?.topBenef?.beneficiaire}>
            {topKpis?.topBenef ? formatEuroCompact(topKpis.topBenef.montant_total) : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate" title={topKpis?.topBenef?.beneficiaire}>
            {topKpis?.topBenef?.beneficiaire?.slice(0, 30) || '—'}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Bénéficiaires</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{formatNumber(stats.total)}</p>
          <p className="text-xs text-slate-500 mt-1">{selectedYear}</p>
        </div>
      </div>

      {/* Treemap with breakdown selector */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6 mb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-100">
              Répartition des subventions
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              {isMobile ? 'Appuyez pour filtrer' : 'Cliquez sur un bloc pour filtrer la table'}
            </p>
          </div>
          {/* Breakdown selector — même style que Travaux */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Ventilation :</span>
            <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
              {BREAKDOWN_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleBreakdownChange(opt.id)}
                  className={`px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                    breakdown === opt.id
                      ? 'bg-purple-500/20 text-purple-300 shadow-sm'
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
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
            >
              {selectedGroup}
              <span className="text-purple-400">×</span>
            </button>
          </div>
        )}
      </div>

      {/* Table top bénéficiaires (filtrée) — avec animation slide-in */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden transition-all duration-500 ease-out">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">
            {selectedGroup
              ? `${selectedGroup} — ${formatNumber(sortedFiltered.length)} bénéficiaires`
              : `Top bénéficiaires — ${formatNumber(sortedFiltered.length)} bénéficiaires`}
          </h3>
          <span className="text-sm font-semibold text-purple-400">
            {formatEuroCompact(sortedFiltered.reduce((s, b) => s + b.montant_total, 0))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Bénéficiaire</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Thématique</th>
                <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase">Montant</th>
                <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Dir.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sortedFiltered.slice(0, 30).map((b, i) => (
                <tr key={`${b.beneficiaire}-${i}`} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-2 md:px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{b.beneficiaire}</p>
                        <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                          {b.nature_juridique || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    <p className="text-xs text-slate-400 line-clamp-2">{b.thematique}</p>
                  </td>
                  <td className="px-2 md:px-4 py-3 text-right">
                    <p className="text-xs md:text-sm font-semibold text-purple-400 whitespace-nowrap">
                      {formatEuroCompact(b.montant_total)}
                    </p>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-center">
                    {b.direction
                      ? <span className="text-sm text-slate-300">{b.direction}</span>
                      : <span className="text-slate-500">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedFiltered.length > 30 && onNavigateExplorer && (
          <div className="px-4 py-3 border-t border-slate-700 text-center">
            <button
              onClick={onNavigateExplorer}
              className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              Voir les {formatNumber(sortedFiltered.length)} bénéficiaires →
            </button>
          </div>
        )}
        {sortedFiltered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-slate-400">Aucun bénéficiaire ne correspond aux filtres</p>
          </div>
        )}
      </div>
    </div>
  );
}
