'use client';

/**
 * Composant DrilldownPanel - Panneau de détail pour le drill-down
 * Dark theme avec graphique en barres horizontales
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
  onClose: () => void;
}

export default function DrilldownPanel({ title, category, items, onClose }: DrilldownPanelProps) {
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + item.value, 0);
  }, [items]);

  // Limite à 15 éléments max pour la lisibilité
  const displayItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    if (sorted.length <= 15) return sorted;
    
    const top14 = sorted.slice(0, 14);
    const others = sorted.slice(14);
    const othersTotal = others.reduce((sum, item) => sum + item.value, 0);
    
    return [...top14, { name: `Autres (${others.length} postes)`, value: othersTotal }];
  }, [items]);

  const barColor = category === 'revenue' ? '#10b981' : '#3b82f6';
  const accentColor = category === 'revenue' ? 'emerald' : 'blue';

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: unknown) => {
        const p = params as Array<{ name: string; value: number }>;
        if (!p || !p[0]) return '';
        const item = p[0];
        const percentage = calculatePercentage(item.value, total);
        return `
          <div style="padding: 10px;">
            <div style="font-weight: 600; margin-bottom: 6px; max-width: 250px; word-wrap: break-word;">${item.name}</div>
            <div style="font-size: 18px; font-weight: 700; color: ${barColor};">${formatEuroCompact(item.value)}</div>
            <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} de cette catégorie</div>
          </div>
        `;
      },
    },
    grid: {
      left: '3%',
      right: '18%',
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
      data: displayItems.map(item => item.name).reverse(),
      axisLabel: {
        fontSize: 11,
        color: '#cbd5e1',
        width: 200,
        overflow: 'truncate',
        ellipsis: '...',
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
            color: category === 'revenue' ? '#34d399' : '#60a5fa',
          },
        },
      },
    ],
  }), [displayItems, total, barColor, category]);

  return (
    <div className={`bg-slate-800/50 backdrop-blur rounded-xl border-2 border-${accentColor}-500/30 p-6 mt-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            category === 'revenue' 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {category === 'revenue' ? '📈 Recette' : '📉 Dépense'}
          </div>
          <h3 className="text-lg font-semibold text-slate-100">
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          title="Fermer le détail"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      <div className={`rounded-lg p-4 mb-4 ${
        category === 'revenue' ? 'bg-emerald-500/10' : 'bg-blue-500/10'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Total de cette catégorie</span>
          <span className={`text-xl font-bold ${
            category === 'revenue' ? 'text-emerald-400' : 'text-blue-400'
          }`}>
            {formatEuroCompact(total)}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {items.length} postes budgétaires
        </p>
      </div>

      {/* Chart */}
      <ReactECharts
        option={option}
        style={{ height: `${Math.max(350, displayItems.length * 38)}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
