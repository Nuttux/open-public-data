'use client';

/**
 * AnnuelTab — Composant partagé pour les onglets "Annuel" avec treemap.
 *
 * Utilisé par Subventions et Investissements. (Logements a un layout différent sans treemap.)
 *
 * Pattern :
 *   1. Optional banner (couverture, data quality, etc.)
 *   2. KPI cards grid
 *   3. Treemap ECharts avec breakdown selector + click-to-filter
 *   4. Table preview top N avec lien vers Explorer
 */

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import { useT } from '@/lib/localeContext';

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface BreakdownOption {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface AggregatedGroup {
  key: string;
  montant: number;
  count: number;
  pct: number;
}

export interface KpiCardDef {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}

export interface TableColumnDef<T> {
  key: string;
  label: string;
  hideOnMobile?: boolean;
  align?: 'left' | 'center' | 'right';
  render: (item: T, index: number) => ReactNode;
}

// ─── Theme ───────────────────────────────────────────────────────────────────

type ThemeColor = 'purple' | 'amber' | 'emerald' | 'teal';

const THEME = {
  purple: {
    spinner: 'border-purple-500',
    activeBtn: 'bg-purple-500/20 text-purple-300 shadow-sm',
    filterBadgeBg: 'bg-purple-500/20',
    filterBadgeText: 'text-purple-300',
    filterBadgeBorder: 'border-purple-500/30',
    filterBadgeHover: 'hover:bg-purple-500/30',
    filterX: 'text-purple-400',
    valueAccent: 'text-purple-400',
  },
  amber: {
    spinner: 'border-amber-500',
    activeBtn: 'bg-amber-500/20 text-amber-300 shadow-sm',
    filterBadgeBg: 'bg-amber-500/20',
    filterBadgeText: 'text-amber-300',
    filterBadgeBorder: 'border-amber-500/30',
    filterBadgeHover: 'hover:bg-amber-500/30',
    filterX: 'text-amber-400',
    valueAccent: 'text-amber-400',
  },
  emerald: {
    spinner: 'border-emerald-500',
    activeBtn: 'bg-emerald-500/20 text-emerald-300 shadow-sm',
    filterBadgeBg: 'bg-emerald-500/20',
    filterBadgeText: 'text-emerald-300',
    filterBadgeBorder: 'border-emerald-500/30',
    filterBadgeHover: 'hover:bg-emerald-500/30',
    filterX: 'text-emerald-400',
    valueAccent: 'text-emerald-400',
  },
  teal: {
    spinner: 'border-teal-500',
    activeBtn: 'bg-teal-500/20 text-teal-300 shadow-sm',
    filterBadgeBg: 'bg-teal-500/20',
    filterBadgeText: 'text-teal-300',
    filterBadgeBorder: 'border-teal-500/30',
    filterBadgeHover: 'hover:bg-teal-500/30',
    filterX: 'text-teal-400',
    valueAccent: 'text-teal-400',
  },
} as const;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AnnuelTabProps<T> {
  /** Raw items for the year */
  items: T[];
  isLoading: boolean;
  theme: ThemeColor;

  // Breakdowns
  breakdowns: BreakdownOption[];
  /** Get the group key for an item given a breakdown dimension */
  getGroupKey: (item: T, dim: string) => string;
  /** Get the color for a group */
  getGroupColor: (key: string, dim: string, index: number) => string;
  /** Get the primary value from an item (for aggregation) */
  getValue: (item: T) => number;

  // Treemap
  treemapTitle: string;
  /** Label for the count in tooltip, e.g. "Projets" or "Bénéficiaires" */
  tooltipCountLabel: string;
  /** Label for the value in tooltip (default: "Montant") */
  tooltipValueLabel?: string;
  /** Format the aggregated value in tooltip (default: formatEuroCompact) */
  formatValue?: (value: number) => string;
  /** Max groups in treemap per dimension — extras grouped as "Autres" */
  maxGroups?: (dim: string) => number | undefined;

  // KPIs — rendered by the wrapper for full flexibility
  kpiCards: ReactNode;

  // Table preview
  /** Item label for table header, e.g. "projets" or "bénéficiaires" */
  itemLabel: string;
  /** Table column definitions */
  columns: TableColumnDef<T>[];
  /** Sort comparator for filtered items */
  sortItems: (a: T, b: T) => number;
  /** Unique key for a table row */
  getItemKey: (item: T, index: number) => string;
  /** Max items in preview (default 30) */
  previewLimit?: number;
  /** Navigate to Explorer tab */
  onNavigateExplorer?: () => void;
  /** Format total amount in table header */
  formatTotal?: (items: T[]) => string;

  // Optional banner above KPIs
  banner?: ReactNode;
  /** Optional export bar (CSV + share link) rendered between KPIs and treemap */
  exportBar?: ReactNode;
}

// ─── Aggregation helper ──────────────────────────────────────────────────────

export function aggregateItems<T>(
  items: T[],
  getKey: (item: T) => string,
  getVal: (item: T) => number,
): AggregatedGroup[] {
  const map = new Map<string, { montant: number; count: number }>();
  for (const item of items) {
    const key = getKey(item);
    const existing = map.get(key) || { montant: 0, count: 0 };
    existing.montant += getVal(item);
    existing.count += 1;
    map.set(key, existing);
  }
  const total = items.reduce((s, item) => s + getVal(item), 0);
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

export default function AnnuelTab<T>({
  items, isLoading, theme,
  breakdowns, getGroupKey, getGroupColor, getValue,
  treemapTitle, tooltipCountLabel, tooltipValueLabel, formatValue = formatEuroCompact, maxGroups,
  kpiCards,
  itemLabel, columns, sortItems, getItemKey,
  previewLimit = 30, onNavigateExplorer, formatTotal,
  banner, exportBar,
}: AnnuelTabProps<T>) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const [breakdown, setBreakdown] = useState(breakdowns[0].id);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const tr = useT();
  const t = THEME[theme];

  // ── Aggregation ──
  const groups = useMemo(() => {
    const all = aggregateItems(items, (item) => getGroupKey(item, breakdown), getValue);
    const limit = maxGroups?.(breakdown);
    if (!limit || all.length <= limit) return all;
    const top = all.slice(0, limit);
    const rest = all.slice(limit);
    const autresMontant = rest.reduce((s, g) => s + g.montant, 0);
    const autresCount = rest.reduce((s, g) => s + g.count, 0);
    const total = all.reduce((s, g) => s + g.montant, 0);
    top.push({
      key: 'Autres',
      montant: autresMontant,
      count: autresCount,
      pct: total > 0 ? (autresMontant / total) * 100 : 0,
    });
    return top;
  }, [items, breakdown, getGroupKey, getValue, maxGroups]);

  // ── Filtered items ──
  const topGroupKeys = useMemo(() => new Set(groups.filter(g => g.key !== 'Autres').map(g => g.key)), [groups]);
  const filteredItems = useMemo(() => {
    if (!selectedGroup) return items;
    if (selectedGroup === 'Autres') {
      return items.filter(item => !topGroupKeys.has(getGroupKey(item, breakdown)));
    }
    return items.filter(item => getGroupKey(item, breakdown) === selectedGroup);
  }, [items, selectedGroup, breakdown, getGroupKey, topGroupKeys]);

  const sortedFiltered = useMemo(
    () => [...filteredItems].sort(sortItems),
    [filteredItems, sortItems],
  );

  // ── Treemap ──
  const chartHeight = isMobile ? 280 : 380;

  const chartData = useMemo(() => groups.map((g, i) => ({
    name: g.key,
    value: g.montant,
    pct: g.pct,
    count: g.count,
    itemStyle: {
      color: getGroupColor(g.key, breakdown, i),
      borderColor: selectedGroup === g.key ? '#fff' : 'rgba(255,255,255,0.1)',
      borderWidth: selectedGroup === g.key ? 3 : 1,
    },
  })), [groups, breakdown, selectedGroup, getGroupColor]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      padding: isMobile ? [8, 12] : [12, 16],
      confine: true,
      textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 13 },
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; data: { pct: number; count: number } };
        return `
          <div style="font-weight: 600; margin-bottom: 6px; font-size: ${isMobile ? '12px' : '14px'}; color: #f1f5f9;">
            ${p.name}
          </div>
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: ${isMobile ? '11px' : '12px'};">
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">${tooltipValueLabel || tr('annuel.amount')}</span>
              <span style="font-weight: 500; color: #f1f5f9;">${formatValue(p.value)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">${tr('annuel.part_du_total')}</span>
              <span style="font-weight: 500; color: #f1f5f9;">${p.data.pct.toFixed(1)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">${tooltipCountLabel}</span>
              <span style="font-weight: 500; color: #f1f5f9;">${formatNumber(p.data.count)}</span>
            </div>
          </div>
        `;
      },
    },
    series: [{
      type: 'treemap',
      data: chartData,
      width: '100%', height: '100%',
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
        textShadowColor: 'rgba(0,0,0,0.08)',
        textShadowBlur: isMobile ? 3 : 4,
      },
      upperLabel: { show: false },
      levels: [{
        itemStyle: {
          borderColor: '#0f172a',
          borderWidth: isMobile ? 1 : 2,
          gapWidth: isMobile ? 1 : 2,
        },
      }],
      animation: true,
      animationDuration: isMobile ? 300 : 500,
      animationEasing: 'cubicOut',
    }],
  }), [chartData, isMobile, tooltipCountLabel, tooltipValueLabel, formatValue, tr]);

  const handleTreemapClick = useCallback((params: unknown) => {
    const p = params as { name: string };
    setSelectedGroup(prev => prev === p.name ? null : p.name);
  }, []);

  const handleBreakdownChange = (dim: string) => {
    setSelectedGroup(null);
    setBreakdown(dim);
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className={`w-8 h-8 border-3 ${t.spinner} border-t-transparent rounded-full animate-spin`} />
      </div>
    );
  }

  const totalLabel = formatTotal
    ? formatTotal(sortedFiltered)
    : formatValue(sortedFiltered.reduce((s, item) => s + getValue(item), 0));

  return (
    <div>
      {banner}

      {/* KPI cards */}
      {kpiCards}

      {/* Export bar */}
      {exportBar}

      {/* Treemap with breakdown selector */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-100">{treemapTitle}</h3>
            <p className="text-xs sm:text-sm text-slate-300">
              {isMobile ? tr('ui.tap_to_filter') : tr('ui.click_block_filter')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:inline">{tr('ui.breakdown_label')}</span>
            <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
              {breakdowns.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleBreakdownChange(opt.id)}
                  className={`px-2.5 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                    breakdown === opt.id ? t.activeBtn : 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/50'
                  }`}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

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

        {selectedGroup && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm text-slate-300">{tr('ui.active_filter')}</span>
            <button
              onClick={() => setSelectedGroup(null)}
              className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${t.filterBadgeBg} ${t.filterBadgeText} border ${t.filterBadgeBorder} ${t.filterBadgeHover} transition-colors`}
            >
              {selectedGroup}
              <span className={t.filterX}>×</span>
            </button>
          </div>
        )}
      </div>

      {/* Table preview */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden transition-all duration-500 ease-out">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">
            {selectedGroup
              ? `${selectedGroup} — ${formatNumber(sortedFiltered.length)} ${itemLabel}`
              : `Top ${itemLabel} — ${formatNumber(sortedFiltered.length)} ${itemLabel}`}
          </h3>
          <span className={`text-sm font-semibold ${t.valueAccent}`}>{totalLabel}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {sortedFiltered.slice(0, previewLimit).map((item, i) => (
                <tr key={getItemKey(item, i)} className={`hover:bg-slate-700/30 transition-colors`}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} px-2 md:px-4 py-3`}
                    >
                      {col.render(item, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedFiltered.length > previewLimit && onNavigateExplorer && (
          <div className="px-4 py-3 border-t border-slate-700 text-center">
            <button
              onClick={onNavigateExplorer}
              className={`text-sm ${t.valueAccent} hover:opacity-80 transition-colors`}
            >
              {tr('ui.click_to_explore').replace('→', '').trim()} {formatNumber(sortedFiltered.length)} {itemLabel} →
            </button>
          </div>
        )}
        {sortedFiltered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-slate-300">{tr('ui.no_match_filters')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
