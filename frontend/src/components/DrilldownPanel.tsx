'use client';

/**
 * Composant DrilldownPanel - Navigation multi-niveaux dans le budget
 * 
 * FEATURES:
 * - Couleur des barres = couleur de la catégorie Sankey
 * - Textes responsifs (troncature intelligente)
 * - Navigation claire (retour, breadcrumbs)
 * - Mini donut pour split Fonctionnement/Investissement
 * - Filtrage par section budgétaire
 */

import { useMemo, useState, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import { getCategoryColor, lightenColor } from '@/lib/colors';
import type { DrilldownItem, SectionBreakdown } from '@/lib/formatters';

/** Type pour les sections budgétaires */
type BudgetSection = 'all' | 'Fonctionnement' | 'Investissement';

interface DrilldownPanelProps {
  title: string;
  category: 'revenue' | 'expense';
  parentCategory?: string;  // Nom de la catégorie parent (pour la couleur)
  items: DrilldownItem[];
  /** Section breakdown data (Fonct/Invest) for this expense group */
  sectionData?: SectionBreakdown;
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
  sectionData,
  breadcrumbs = [],
  currentLevel = 0,
  onClose,
  onBreadcrumbClick,
  onItemClick,
}: DrilldownPanelProps) {
  // State for section filtering
  const [selectedSection, setSelectedSection] = useState<BudgetSection>('all');
  
  // Calculate totals for section breakdown
  const sectionTotals = useMemo(() => {
    if (!sectionData) return null;
    
    const fonct = sectionData.Fonctionnement?.total || 0;
    const invest = sectionData.Investissement?.total || 0;
    const total = fonct + invest;
    
    if (total === 0) return null;
    
    return {
      fonctionnement: fonct,
      investissement: invest,
      total,
      fonctPct: fonct / total,
      investPct: invest / total,
    };
  }, [sectionData]);
  
  // Get filtered items based on selected section
  const filteredItems = useMemo(() => {
    if (selectedSection === 'all' || !sectionData) {
      return items;
    }
    
    const sectionItems = sectionData[selectedSection]?.items;
    // Return empty array if section has no items (don't fall back to all items)
    return sectionItems || [];
  }, [items, sectionData, selectedSection]);
  
  const total = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + item.value, 0);
  }, [filteredItems]);
  
  // Handle section click from donut
  const handleSectionClick = useCallback((section: BudgetSection) => {
    setSelectedSection(prev => prev === section ? 'all' : section);
  }, []);

  // Limite à 20 éléments max
  const displayItems = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => b.value - a.value);
    if (sorted.length <= 20) return sorted;
    
    const top19 = sorted.slice(0, 19);
    const others = sorted.slice(19);
    const othersTotal = others.reduce((sum, item) => sum + item.value, 0);
    
    return [...top19, { name: `Autres (${others.length})`, value: othersTotal }];
  }, [filteredItems]);
  
  // Mini donut chart options for section breakdown
  const donutOption: EChartsOption = useMemo(() => {
    if (!sectionTotals) return {};
    
    // Build data array only with sections that have values > 0
    const donutData = [];
    if (sectionTotals.fonctionnement > 0) {
      donutData.push({
        value: sectionTotals.fonctionnement,
        name: 'Fonctionnement',
        itemStyle: { 
          color: selectedSection === 'Fonctionnement' ? '#3b82f6' : '#3b82f680',
        },
      });
    }
    if (sectionTotals.investissement > 0) {
      donutData.push({
        value: sectionTotals.investissement,
        name: 'Investissement',
        itemStyle: { 
          color: selectedSection === 'Investissement' ? '#f59e0b' : '#f59e0b80',
        },
      });
    }
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        borderRadius: 8,
        textStyle: { color: '#e2e8f0' },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600;">${p.name}</div>
              <div style="font-size: 18px; font-weight: 700; color: ${p.name === 'Fonctionnement' ? '#3b82f6' : '#f59e0b'};">
                ${formatEuroCompact(p.value)}
              </div>
              <div style="color: #94a3b8; font-size: 12px;">${p.percent.toFixed(0)}%</div>
            </div>
          `;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['55%', '80%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: '#1e293b',
            borderWidth: 2,
          },
          label: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 5,
          },
          data: donutData,
        },
      ],
    };
  }, [sectionTotals, selectedSection]);

  // Couleur basée sur la catégorie parent du Sankey
  const categoryName = parentCategory || breadcrumbs[0] || title;
  const barColor = getCategoryColor(categoryName, category);
  const hoverColor = lightenColor(barColor, 15);
  const canDrillDown = !!onItemClick;

  // Tronque le texte intelligemment
  const truncateText = useCallback((text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text;
    // Coupe au dernier espace avant maxLen
    const truncated = text.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.6) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  }, []);

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
              {filteredItems.length} postes
              {selectedSection !== 'all' && (
                <span className="ml-1 text-xs">
                  ({selectedSection})
                </span>
              )}
            </p>
          </div>
          <span className="text-2xl font-bold" style={{ color: barColor }}>
            {formatEuroCompact(total)}
          </span>
        </div>
      </div>
      
      {/* Section breakdown (Fonctionnement vs Investissement) */}
      {sectionTotals && category === 'expense' && (
        <div className="mb-4 p-4 bg-slate-700/30 rounded-lg">
          <div className="flex items-center gap-4">
            {/* Mini donut chart */}
            <div className="w-20 h-20 flex-shrink-0">
              <ReactECharts
                option={donutOption}
                style={{ height: '80px', width: '80px' }}
                opts={{ renderer: 'canvas' }}
                onEvents={{
                  click: (params: { name?: string }) => {
                    if (params.name === 'Fonctionnement' && sectionTotals.fonctionnement > 0) {
                      handleSectionClick('Fonctionnement');
                    } else if (params.name === 'Investissement' && sectionTotals.investissement > 0) {
                      handleSectionClick('Investissement');
                    }
                  },
                }}
              />
            </div>
            
            {/* Section buttons */}
            <div className="flex-1 space-y-2">
              <button
                onClick={() => sectionTotals.fonctionnement > 0 && handleSectionClick('Fonctionnement')}
                disabled={sectionTotals.fonctionnement === 0}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                  selectedSection === 'Fonctionnement'
                    ? 'bg-blue-500/20 border border-blue-500/50'
                    : sectionTotals.fonctionnement > 0
                      ? 'bg-slate-700/50 hover:bg-slate-700 border border-transparent'
                      : 'bg-slate-800/30 border border-transparent opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${sectionTotals.fonctionnement > 0 ? 'bg-blue-500' : 'bg-blue-500/30'}`}></div>
                  <span className={`text-sm font-medium ${sectionTotals.fonctionnement > 0 ? 'text-slate-200' : 'text-slate-500'}`}>Fonctionnement</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-semibold ${sectionTotals.fonctionnement > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                    {sectionTotals.fonctionnement > 0 ? formatEuroCompact(sectionTotals.fonctionnement) : '—'}
                  </span>
                  {sectionTotals.fonctionnement > 0 && (
                    <span className="text-xs text-slate-500 ml-2">
                      {formatPercent(sectionTotals.fonctPct)}
                    </span>
                  )}
                </div>
              </button>
              
              <button
                onClick={() => sectionTotals.investissement > 0 && handleSectionClick('Investissement')}
                disabled={sectionTotals.investissement === 0}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                  selectedSection === 'Investissement'
                    ? 'bg-amber-500/20 border border-amber-500/50'
                    : sectionTotals.investissement > 0
                      ? 'bg-slate-700/50 hover:bg-slate-700 border border-transparent'
                      : 'bg-slate-800/30 border border-transparent opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${sectionTotals.investissement > 0 ? 'bg-amber-500' : 'bg-amber-500/30'}`}></div>
                  <span className={`text-sm font-medium ${sectionTotals.investissement > 0 ? 'text-slate-200' : 'text-slate-500'}`}>Investissement</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-semibold ${sectionTotals.investissement > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                    {sectionTotals.investissement > 0 ? formatEuroCompact(sectionTotals.investissement) : '—'}
                  </span>
                  {sectionTotals.investissement > 0 && (
                    <span className="text-xs text-slate-500 ml-2">
                      {formatPercent(sectionTotals.investPct)}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
          
          {/* Reset filter hint */}
          {selectedSection !== 'all' && (
            <button
              onClick={() => setSelectedSection('all')}
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ↩ Afficher toutes les dépenses
            </button>
          )}
          
          {/* Note about special operations when section totals don't add up to total */}
          {selectedSection === 'all' && sectionTotals.total < total * 0.95 && (
            <div className="mt-3 text-xs text-slate-500 text-center">
              💡 Certains postes (reversements fiscaux, dette...) sont des opérations spéciales
            </div>
          )}
        </div>
      )}

      {/* Hint drill-down */}
      {canDrillDown && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-slate-700/30 rounded-lg text-sm">
          <span className="text-blue-400">🔍</span>
          <span className="text-slate-400">
            Cliquez sur une barre pour explorer
          </span>
        </div>
      )}

      {/* Chart or empty message */}
      {displayItems.length > 0 ? (
        <ReactECharts
          option={option}
          style={{ height: `${Math.max(350, displayItems.length * 30)}px`, width: '100%' }}
          opts={{ renderer: 'canvas' }}
          onEvents={{
            click: handleChartClick,
          }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-slate-400">Aucune dépense dans cette section</p>
          <button
            onClick={() => setSelectedSection('all')}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            ↩ Afficher toutes les dépenses
          </button>
        </div>
      )}
    </div>
  );
}
