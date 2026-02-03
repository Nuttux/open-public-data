'use client';

/**
 * Composant DrilldownPanel - Navigation multi-niveaux dans le budget
 * 
 * FEATURES:
 * - Couleur des barres = couleur de la catégorie Sankey
 * - Textes responsifs (troncature intelligente)
 * - Navigation claire (retour, breadcrumbs)
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import { getCategoryColor, lightenColor } from '@/lib/colors';
import type { DrilldownItem } from '@/lib/formatters';

interface DrilldownPanelProps {
  title: string;
  category: 'revenue' | 'expense';
  parentCategory?: string;  // Nom de la catégorie parent (pour la couleur)
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
  parentCategory,
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
    
    return [...top19, { name: `Autres (${others.length})`, value: othersTotal }];
  }, [items]);

  // Couleur basée sur la catégorie parent du Sankey
  const categoryName = parentCategory || breadcrumbs[0] || title;
  const barColor = getCategoryColor(categoryName, category);
  const hoverColor = lightenColor(barColor, 15);
  const canDrillDown = !!onItemClick;

  // Tronque le texte intelligemment
  const truncateText = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text;
    // Coupe au dernier espace avant maxLen
    const truncated = text.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.6) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  };

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      textStyle: { color: '#e2e8f0' },
      confine: true,
      formatter: (params: unknown) => {
        const p = params as Array<{ name: string; value: number; dataIndex: number }>;
        if (!p || !p[0]) return '';
        const idx = displayItems.length - 1 - p[0].dataIndex;
        const item = displayItems[idx];
        const percentage = calculatePercentage(item.value, total);
        return `
          <div style="padding: 10px; max-width: 300px;">
            <div style="font-weight: 600; margin-bottom: 6px; word-wrap: break-word; line-height: 1.3;">${item.name}</div>
            <div style="font-size: 20px; font-weight: 700; color: ${barColor};">${formatEuroCompact(item.value)}</div>
            <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} de ${categoryName}</div>
            ${canDrillDown && !item.name.startsWith('Autres') ? '<div style="margin-top: 8px; color: #60a5fa; font-size: 11px;">👆 Cliquez pour explorer</div>' : ''}
          </div>
        `;
      },
    },
    grid: {
      left: 10,
      right: 80,
      bottom: 10,
      top: 10,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => formatEuroCompact(value),
        fontSize: 10,
        color: '#94a3b8',
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
    },
    yAxis: {
      type: 'category',
      data: displayItems.map(item => truncateText(item.name, 35)).reverse(),
      axisLabel: {
        fontSize: 11,
        color: '#cbd5e1',
        width: 220,
        overflow: 'truncate',
      },
      axisLine: { show: false },
      axisTick: { show: false },
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
        barMaxWidth: 28,
        label: {
          show: true,
          position: 'right',
          formatter: (params: unknown) => {
            const p = params as { value: number | number[] };
            const value = Array.isArray(p.value) ? p.value[0] : p.value;
            return formatEuroCompact(value);
          },
          fontSize: 11,
          fontWeight: 500,
          color: '#94a3b8',
        },
        emphasis: {
          itemStyle: {
            color: hoverColor,
          },
        },
      },
    ],
  }), [displayItems, total, barColor, hoverColor, canDrillDown, categoryName, truncateText]);

  const handleChartClick = (params: { dataIndex?: number }) => {
    if (typeof params.dataIndex === 'number' && onItemClick) {
      const reversedIndex = displayItems.length - 1 - params.dataIndex;
      const item = displayItems[reversedIndex];
      if (item && !item.name.startsWith('Autres')) {
        onItemClick(item);
      }
    }
  };

  // Style basé sur la couleur de la catégorie
  const borderStyle = { borderColor: barColor + '60' };
  const bgStyle = { backgroundColor: barColor + '15' };

  return (
    <div 
      className="bg-slate-800/50 backdrop-blur rounded-xl border-2 p-4 sm:p-6 mt-6"
      style={borderStyle}
    >
      {/* Header avec navigation */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          {/* Bouton retour + Breadcrumbs */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={currentLevel > 0 ? () => onBreadcrumbClick?.(currentLevel - 1) : onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">{currentLevel > 0 ? 'Retour' : 'Fermer'}</span>
            </button>
            
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <nav className="flex items-center gap-1 text-sm overflow-x-auto">
                <button
                  onClick={onClose}
                  className="text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
                >
                  Sankey
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className="text-slate-600">›</span>
                    {idx < currentLevel ? (
                      <button
                        onClick={() => onBreadcrumbClick?.(idx)}
                        className="text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
                      >
                        {crumb.length > 20 ? crumb.substring(0, 18) + '...' : crumb}
                      </button>
                    ) : (
                      <span className="font-medium whitespace-nowrap" style={{ color: barColor }}>
                        {crumb.length > 20 ? crumb.substring(0, 18) + '...' : crumb}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
            )}
          </div>
          
          {/* Titre avec badge coloré */}
          <div className="flex flex-wrap items-center gap-2">
            <div 
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={bgStyle}
            >
              <span style={{ color: barColor }}>
                {category === 'revenue' ? '📈 Recette' : '📉 Dépense'}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-100 break-words">
            {title}
          </h3>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors self-start shrink-0"
          title="Fermer"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary box avec couleur */}
      <div className="rounded-lg p-4 mb-4" style={bgStyle}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-slate-300 font-medium">Total</span>
            <p className="text-sm text-slate-500">
              {items.length} postes
            </p>
          </div>
          <span className="text-2xl font-bold" style={{ color: barColor }}>
            {formatEuroCompact(total)}
          </span>
        </div>
      </div>

      {/* Hint drill-down */}
      {canDrillDown && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-slate-700/30 rounded-lg text-sm">
          <span className="text-blue-400">🔍</span>
          <span className="text-slate-400">
            Cliquez sur une barre pour explorer
          </span>
        </div>
      )}

      {/* Chart */}
      <ReactECharts
        option={option}
        style={{ height: `${Math.max(350, displayItems.length * 30)}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{
          click: handleChartClick,
        }}
      />
    </div>
  );
}
