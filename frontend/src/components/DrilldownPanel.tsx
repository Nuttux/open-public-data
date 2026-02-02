'use client';

/**
 * Composant DrilldownPanel - Panneau de détail avec navigation multi-niveaux
 * 
 * FEATURES:
 * - Breadcrumbs cliquables pour naviguer dans les niveaux
 * - Barres cliquables pour drill-down plus profond
 * - Dark theme avec graphique en barres horizontales
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

  // Limite à 20 éléments max pour la lisibilité
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
  const accentClass = category === 'revenue' ? 'emerald' : 'blue';

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
            ${onItemClick ? '<div style="margin-top: 8px; color: #60a5fa; font-size: 11px;">👆 Cliquez pour explorer</div>' : ''}
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
        // Tronque les labels trop longs
        const name = item.name;
        return name.length > 40 ? name.substring(0, 37) + '...' : name;
      }).reverse(),
      axisLabel: {
        fontSize: 11,
        color: '#cbd5e1',
        width: 250,
        overflow: 'truncate',
      },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    series: [
      {
        type: 'bar',
        data: displayItems.map(item => ({
          value: item.value,
          itemData: item,  // Store original item for click handler
        })).reverse(),
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
            color: hoverColor,
          },
        },
      },
    ],
  }), [displayItems, total, barColor, hoverColor, onItemClick]);

  // Gestion du clic sur une barre
  const handleChartClick = (params: { dataIndex?: number }) => {
    if (typeof params.dataIndex === 'number' && onItemClick) {
      // Les données sont inversées pour l'affichage
      const reversedIndex = displayItems.length - 1 - params.dataIndex;
      const item = displayItems[reversedIndex];
      if (item && !item.name.startsWith('Autres (')) {
        onItemClick(item);
      }
    }
  };

  return (
    <div className={`bg-slate-800/50 backdrop-blur rounded-xl border-2 border-${accentClass}-500/30 p-6 mt-6`}>
      {/* Header avec breadcrumbs */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 text-sm mb-2 flex-wrap">
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                🏠 Vue générale
              </button>
              {breadcrumbs.map((crumb, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  <span className="text-slate-600">/</span>
                  {idx < currentLevel ? (
                    <button
                      onClick={() => onBreadcrumbClick?.(idx)}
                      className="text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {crumb}
                    </button>
                  ) : (
                    <span className={`font-medium ${category === 'revenue' ? 'text-emerald-400' : 'text-blue-400'}`}>
                      {crumb}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
          
          {/* Titre et badge */}
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
        </div>
        
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors ml-4"
          title="Fermer"
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
          <div>
            <span className="text-slate-300">Total de cette catégorie</span>
            <p className="text-sm text-slate-500">
              {items.length} postes budgétaires
            </p>
          </div>
          <span className={`text-2xl font-bold ${
            category === 'revenue' ? 'text-emerald-400' : 'text-blue-400'
          }`}>
            {formatEuroCompact(total)}
          </span>
        </div>
      </div>

      {/* Hint pour drill-down */}
      {onItemClick && (
        <p className="text-xs text-slate-500 mb-3 flex items-center gap-2">
          <span className="text-blue-400">💡</span>
          Cliquez sur une barre pour explorer le détail
        </p>
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
