'use client';

/**
 * Composant DrilldownPanel - Navigation multi-niveaux dans le budget
 * 
 * FEATURES:
 * - Breadcrumbs cliquables pour remonter
 * - Bouton retour bien visible
 * - Indication claire si drill-down possible
 * - Barres cliquables avec cursor pointer
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import type { DrilldownItem } from '@/lib/formatters';

interface DrilldownPanelProps {
  title: string;
  category: 'revenue' | 'expense';
  items: DrilldownItem[];
  breadcrumbs?: string[];
  currentLevel?: number;
  onClose: () => void;
  onBreadcrumbClick?: (levelIndex: number) => void;
  onItemClick?: (item: DrilldownItem) => void;
}

export default function DrilldownPanel({ 
  title, 
  category, 
  items, 
  breadcrumbs = [],
  currentLevel = 0,
  onClose,
  onBreadcrumbClick,
  onItemClick,
}: DrilldownPanelProps) {
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + item.value, 0);
  }, [items]);

  // Limite à 20 éléments max
  const displayItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    if (sorted.length <= 20) return sorted;
    
    const top19 = sorted.slice(0, 19);
    const others = sorted.slice(19);
    const othersTotal = others.reduce((sum, item) => sum + item.value, 0);
    
    return [...top19, { name: `Autres (${others.length} postes)`, value: othersTotal }];
  }, [items]);

  const barColor = category === 'revenue' ? '#10b981' : '#3b82f6';
  const hoverColor = category === 'revenue' ? '#34d399' : '#60a5fa';
  const canDrillDown = !!onItemClick;

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      textStyle: { color: '#e2e8f0' },
      formatter: (params: unknown) => {
        const p = params as Array<{ name: string; value: number }>;
        if (!p || !p[0]) return '';
        const item = p[0];
        const percentage = calculatePercentage(item.value, total);
        return `
          <div style="padding: 10px;">
            <div style="font-weight: 600; margin-bottom: 6px; max-width: 300px; word-wrap: break-word;">${item.name}</div>
            <div style="font-size: 18px; font-weight: 700; color: ${barColor};">${formatEuroCompact(item.value)}</div>
            <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} de cette catégorie</div>
            ${canDrillDown ? '<div style="margin-top: 8px; color: #60a5fa; font-size: 11px;">👆 Cliquez pour explorer</div>' : ''}
          </div>
        `;
      },
    },
    grid: {
      left: '3%',
      right: '15%',
      bottom: '3%',
      top: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => formatEuroCompact(value),
        fontSize: 10,
        color: '#94a3b8',
      },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
    },
    yAxis: {
      type: 'category',
      data: displayItems.map(item => {
        const name = item.name;
        return name.length > 45 ? name.substring(0, 42) + '...' : name;
      }).reverse(),
      axisLabel: {
        fontSize: 11,
        color: '#cbd5e1',
        width: 280,
        overflow: 'truncate',
      },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    series: [
      {
        type: 'bar',
        data: displayItems.map(item => item.value).reverse(),
        itemStyle: {
          color: barColor,
          borderRadius: [0, 4, 4, 0],
        },
        cursor: canDrillDown ? 'pointer' : 'default',
        label: {
          show: true,
          position: 'right',
          formatter: (params: unknown) => {
            const p = params as { value: number | number[] };
            const value = Array.isArray(p.value) ? p.value[0] : p.value;
            return formatEuroCompact(value);
          },
          fontSize: 10,
          color: '#94a3b8',
        },
        emphasis: {
          itemStyle: {
            color: hoverColor,
          },
        },
      },
    ],
  }), [displayItems, total, barColor, hoverColor, canDrillDown]);

  const handleChartClick = (params: { dataIndex?: number }) => {
    if (typeof params.dataIndex === 'number' && onItemClick) {
      const reversedIndex = displayItems.length - 1 - params.dataIndex;
      const item = displayItems[reversedIndex];
      if (item && !item.name.startsWith('Autres (')) {
        onItemClick(item);
      }
    }
  };

  const accentBorder = category === 'revenue' ? 'border-emerald-500/40' : 'border-blue-500/40';
  const accentBg = category === 'revenue' ? 'bg-emerald-500/10' : 'bg-blue-500/10';
  const accentText = category === 'revenue' ? 'text-emerald-400' : 'text-blue-400';

  return (
    <div className={`bg-slate-800/50 backdrop-blur rounded-xl border-2 ${accentBorder} p-6 mt-6`}>
      {/* Header avec navigation */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {/* Bouton retour + Breadcrumbs */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={currentLevel > 0 ? () => onBreadcrumbClick?.(currentLevel - 1) : onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {currentLevel > 0 ? 'Retour' : 'Fermer'}
            </button>
            
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <nav className="flex items-center gap-1 text-sm flex-wrap">
                <button
                  onClick={onClose}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Sankey
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className="text-slate-600">›</span>
                    {idx < currentLevel ? (
                      <button
                        onClick={() => onBreadcrumbClick?.(idx)}
                        className="text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {crumb}
                      </button>
                    ) : (
                      <span className={`font-medium ${accentText}`}>
                        {crumb}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
            )}
          </div>
          
          {/* Titre avec badge */}
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${accentBg} ${accentText}`}>
              {category === 'revenue' ? '📈 Recette' : '📉 Dépense'}
            </div>
            <h3 className="text-xl font-semibold text-slate-100">
              {title}
            </h3>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          title="Fermer"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary box */}
      <div className={`rounded-lg p-4 mb-4 ${accentBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-slate-300 font-medium">Total</span>
            <p className="text-sm text-slate-500">
              {items.length} postes budgétaires
            </p>
          </div>
          <span className={`text-2xl font-bold ${accentText}`}>
            {formatEuroCompact(total)}
          </span>
        </div>
      </div>

      {/* Hint drill-down */}
      {canDrillDown && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <span className="text-blue-400">🔍</span>
          <span className="text-sm text-blue-300">
            Cliquez sur une barre pour explorer le détail
          </span>
        </div>
      )}

      {/* Chart */}
      <ReactECharts
        option={option}
        style={{ height: `${Math.max(400, displayItems.length * 32)}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{
          click: handleChartClick,
        }}
      />
    </div>
  );
}
