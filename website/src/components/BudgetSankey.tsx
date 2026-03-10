'use client';

/**
 * Composant BudgetSankey - Visualisation Sankey du budget
 * 
 * FEATURES:
 * - Layout horizontal avec marges adaptatives (mobile/desktop)
 * - Vue simplifiée sur mobile (barres horizontales)
 * - Emprunts/Dette visuellement distincts
 * - Click pour drill-down
 * - Responsive: ajuste automatiquement la taille et les marges
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import { REVENUE_COLORS, EXPENSE_COLORS, FLUX_COLORS } from '@/lib/colors';
import type { BudgetData } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import { useTrack } from '@/lib/analyticsContext';
import { useT, useTCategory } from '@/lib/localeContext';

interface BudgetSankeyProps {
  data: BudgetData;
  onNodeClick?: (nodeName: string, category: 'revenue' | 'expense') => void;
}

/**
 * Vue mobile simplifiée - Barres horizontales interactives
 */
function MobileBudgetView({ data, onNodeClick, track }: BudgetSankeyProps & { track: ReturnType<typeof useTrack>; }) {
  const tCat = useTCategory();
  const t = useT();
  const totalBudget = Math.max(data.totals.recettes, data.totals.depenses);

  // Séparer recettes et dépenses
  const revenues = data.nodes
    .filter(n => n.category === 'revenue')
    .map(n => ({
      name: n.name,
      value: data.links.find(l => l.source === n.name)?.value || 0,
    }))
    .sort((a, b) => b.value - a.value);

  const expenses = data.nodes
    .filter(n => n.category === 'expense')
    .map(n => ({
      name: n.name,
      value: data.links.find(l => l.target === n.name)?.value || 0,
    }))
    .sort((a, b) => b.value - a.value);

  const maxValue = Math.max(
    ...revenues.map(r => r.value),
    ...expenses.map(e => e.value)
  );

  /** Chevron indicator — universal "tappable, there's more" signal */
  const ChevronRight = () => (
    <svg className="w-4 h-4 text-slate-500 group-active:text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  return (
    <div className="space-y-6">
      {/* Recettes */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {tCat('Recettes')}
          <span className="text-[10px] text-slate-500 font-normal ml-1">{t('budget.tap_bar_explore')}</span>
        </h3>
        <div className="space-y-2">
          {revenues.map((item, idx) => (
            <button
              key={item.name}
              onClick={() => {
                track('sankey_node_click', { node: item.name, category: 'revenue', type: 'mobile_bar' });
                onNodeClick?.(item.name, 'revenue');
              }}
              className={`w-full text-left group active:scale-[0.98] transition-transform duration-150 ${
                idx === 0 ? 'animate-hint-pulse' : ''
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 group-active:text-white transition-colors truncate pr-2">
                  {tCat(item.name)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400 font-medium whitespace-nowrap">
                    {formatEuroCompact(item.value)}
                  </span>
                  <ChevronRight />
                </div>
              </div>
              <div className="h-6 bg-slate-700/50 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
                    backgroundColor: REVENUE_COLORS[item.name] || '#10b981',
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {formatPercent(calculatePercentage(item.value, totalBudget))} {t('percapita.pct_budget')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Dépenses — rose = sortie d'argent (cohérent FLUX_COLORS.depenses) */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          {tCat('Dépenses')}
          <span className="text-[10px] text-slate-500 font-normal ml-1">{t('budget.tap_bar_explore')}</span>
        </h3>
        <div className="space-y-2">
          {expenses.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                track('sankey_node_click', { node: item.name, category: 'expense', type: 'mobile_bar' });
                onNodeClick?.(item.name, 'expense');
              }}
              className="w-full text-left group active:scale-[0.98] transition-transform duration-150"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 group-active:text-white transition-colors truncate pr-2">
                  {tCat(item.name)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-rose-400 font-medium whitespace-nowrap">
                    {formatEuroCompact(item.value)}
                  </span>
                  <ChevronRight />
                </div>
              </div>
              <div className="h-6 bg-slate-700/50 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
                    backgroundColor: EXPENSE_COLORS[item.name] || '#3b82f6',
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {formatPercent(calculatePercentage(item.value, totalBudget))} {t('percapita.pct_budget')}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BudgetSankey({ data, onNodeClick }: BudgetSankeyProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const track = useTrack();
  const isSmallTablet = useIsMobile(BREAKPOINTS.lg);
  const tCat = useTCategory();
  const t = useT();
  const totalBudget = useMemo(() => {
    return Math.max(data.totals.recettes, data.totals.depenses);
  }, [data.totals]);

  // Calcul des montants d'emprunts et dette
  const financingInfo = useMemo(() => {
    const empruntsLink = data.links.find(l => l.source === 'Emprunts');
    const detteLink = data.links.find(l => l.target === 'Dette');
    return {
      emprunts: empruntsLink?.value || 0,
      dette: detteLink?.value || 0,
    };
  }, [data.links]);

  const getNodeColor = useCallback((name: string, category: string) => {
    if (category === 'central') return '#8b5cf6'; // Violet — noeud central distinct des flux
    if (category === 'revenue') {
      return REVENUE_COLORS[name] || '#64748b';
    }
    if (category === 'expense') {
      return EXPENSE_COLORS[name] || '#64748b';
    }
    return '#64748b';
  }, []);

  const chartData = useMemo(() => {
    const nodes = data.nodes.map((node) => ({
      name: node.name,
      itemStyle: {
        color: getNodeColor(node.name, node.category),
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
      },
      // Pointer cursor on clickable nodes (revenue/expense, not central)
      cursor: node.category !== 'central' ? 'pointer' : 'default',
      category: node.category,
    }));

    const links = data.links.map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
    }));

    return { nodes, links };
  }, [data, getNodeColor]);

  // Marges adaptatives selon la taille de l'écran
  const chartMargins = useMemo(() => {
    if (isSmallTablet) {
      return { left: 100, right: 120, top: 15, bottom: 15 };
    }
    return { left: 180, right: 200, top: 20, bottom: 20 };
  }, [isSmallTablet]);

  // Hauteur adaptative
  const chartHeight = useMemo(() => {
    return isSmallTablet ? 450 : 550;
  }, [isSmallTablet]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      textStyle: { color: '#e2e8f0' },
      confine: true, // Keep tooltip within chart bounds (important for mobile)
      formatter: (params: unknown) => {
        const p = params as {
          dataType: string;
          name: string;
          value: number;
          data: { source?: string; target?: string; category?: string };
        };
        
        if (p.dataType === 'node') {
          const percentage = calculatePercentage(p.value, totalBudget);
          let label = tCat('Budget');

          if (p.data.category === 'revenue') {
            label = p.name === 'Emprunts' ? tCat('Emprunts') : tCat('Recettes');
          } else if (p.data.category === 'expense') {
            label = p.name === 'Dette' ? tCat('Remboursement dette') : tCat('Dépenses');
          }

          return `
            <div style="padding: 8px; max-width: 240px;">
              <div style="font-weight: 600; margin-bottom: 6px;">${tCat(p.name)}</div>
              <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">${label}</div>
              <div style="font-size: 18px; font-weight: 700; color: #10b981;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 11px;">${formatPercent(percentage)} ${t('percapita.pct_budget')}</div>
              ${p.data.category !== 'central' ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #334155; color: #60a5fa; font-size: 11px;">${t('budget.click_bar_explore')} →</div>` : ''}
            </div>
          `;
        }

        if (p.dataType === 'edge') {
          const percentage = calculatePercentage(p.value, totalBudget);
          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">
                ${tCat(p.data.source || '')} → ${tCat(p.data.target || '')}
              </div>
              <div style="font-size: 16px; font-weight: 700; color: ${FLUX_COLORS.emprunts};">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 11px;">${formatPercent(percentage)} ${t('percapita.pct_budget')}</div>
            </div>
          `;
        }
        
        return '';
      },
    },
    series: [
      {
        type: 'sankey',
        layout: 'none',
        emphasis: {
          focus: 'adjacency',
          itemStyle: {
            shadowBlur: 12,
            shadowColor: 'rgba(96, 165, 250, 0.4)',
            borderColor: 'rgba(255,255,255,0.4)',
            borderWidth: 2,
          },
          lineStyle: { opacity: 0.7 },
        },
        nodeAlign: 'justify',
        orient: 'horizontal',
        left: chartMargins.left,
        right: chartMargins.right,
        top: chartMargins.top,
        bottom: chartMargins.bottom,
        nodeWidth: isSmallTablet ? 16 : 20,
        nodeGap: isSmallTablet ? 8 : 10,
        layoutIterations: 32,
        draggable: true,
        data: chartData.nodes,
        links: chartData.links,
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.4,
        },
        label: {
          show: true,
          fontSize: isSmallTablet ? 10 : 12,
          color: '#e2e8f0',
          fontWeight: 500,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            const translated = tCat(params.name);
            if (params.name === 'Budget Paris') {
              return translated;
            }
            const value = params.value || 0;
            const displayName = isSmallTablet && translated.length > 12
              ? translated.substring(0, 11) + '…'
              : translated;
            return `${displayName}\n{small|${formatEuroCompact(value)}}`;
          },
          rich: {
            small: {
              fontSize: isSmallTablet ? 9 : 10,
              color: '#94a3b8',
              lineHeight: isSmallTablet ? 14 : 16,
            },
          },
        },
        levels: [
          {
            depth: 0,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'left', align: 'right', padding: [0, isSmallTablet ? 5 : 10, 0, 0] },
          },
          {
            depth: 1,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'inside', color: '#fff', fontSize: isSmallTablet ? 10 : 11 },
          },
          {
            depth: 2,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'right', align: 'left', padding: [0, 0, 0, isSmallTablet ? 5 : 10] },
          },
        ],
      },
    ],
  }), [chartData, totalBudget, chartMargins, isSmallTablet, tCat, t]);

  const handleChartClick = useCallback((params: {
    dataType?: string;
    name?: string;
    data?: { category?: string; source?: string; target?: string };
  }) => {
    if (params.dataType === 'node' && params.name && params.data?.category !== 'central') {
      const category = params.data?.category as 'revenue' | 'expense';
      track('sankey_node_click', { node: params.name, category, type: 'node' });
      onNodeClick?.(params.name, category);
    }

    if (params.dataType === 'edge' && params.data) {
      const { source, target } = params.data;
      if (source === 'Budget Paris' && target) {
        track('sankey_node_click', { node: target, category: 'expense', type: 'edge' });
        onNodeClick?.(target, 'expense');
      } else if (target === 'Budget Paris' && source) {
        track('sankey_node_click', { node: source, category: 'revenue', type: 'edge' });
        onNodeClick?.(source, 'revenue');
      }
    }
  }, [onNodeClick, track]);


  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-100">
            {t('budget.view.flux_full')} {data.year}
          </h2>
          {isMobile ? (
            <p className="text-xs text-slate-400 mt-1">{t('budget.tap_bar_explore')}</p>
          ) : (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                {t('chart.click_to_filter')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Vue simplifiée en barres */}
      {isMobile ? (
        <MobileBudgetView data={data} onNodeClick={onNodeClick} track={track} />
      ) : (
        <>
          {/* Desktop/Tablet: Sankey avec légende */}
          {/* Légende — couleurs cohérentes avec FLUX_COLORS */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <span className="text-slate-400">{tCat('Recettes')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
              <span className="text-slate-400">{tCat('Emprunts')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-500"></div>
              <span className="text-slate-400">{tCat('Budget')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
              <span className="text-slate-400">{tCat('Dépenses')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
              <span className="text-slate-400">{tCat('Dette')}</span>
            </div>
          </div>

          <ReactECharts
            option={option}
            style={{ height: `${chartHeight}px`, width: '100%' }}
            onEvents={{
              click: handleChartClick,
            }}
            opts={{ renderer: 'canvas' }}
          />
        </>
      )}
    </div>
  );
}
