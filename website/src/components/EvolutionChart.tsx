'use client';

/**
 * EvolutionChart - Graphique d'évolution du budget
 * 
 * Affiche l'évolution des recettes et dépenses sur plusieurs années
 * avec un line chart ECharts.
 * 
 * Features:
 * - Courbes Recettes et Dépenses
 * - Axe Y en milliards d'euros
 * - Tooltip avec détails
 * - Responsive: légende en haut sur mobile, symboles plus grands pour touch
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

export interface YearlyBudget {
  year: number;
  recettes: number;
  depenses: number;
  solde: number;
}

interface EvolutionChartProps {
  /** Données par année */
  data: YearlyBudget[];
  /** Hauteur du graphique en pixels */
  height?: number;
  /** Année actuellement sélectionnée (pour highlight) */
  selectedYear?: number;
  /** Callback au clic sur une année */
  onYearClick?: (year: number) => void;
}

/**
 * Formate un nombre en milliards
 */
function formatBillions(value: number): string {
  const billions = value / 1_000_000_000;
  return `${billions.toFixed(1)} Md€`;
}

/**
 * Formate en milliards version courte pour mobile
 */
function formatBillionsMobile(value: number): string {
  const billions = value / 1_000_000_000;
  return `${billions.toFixed(0)}Md`;
}

export default function EvolutionChart({
  data,
  height = 350,
  selectedYear,
  onYearClick,
}: EvolutionChartProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  // Trier par année
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year);
  }, [data]);

  const years = sortedData.map(d => d.year.toString());
  const recettes = sortedData.map(d => d.recettes);
  const depenses = sortedData.map(d => d.depenses);

  // Hauteur adaptative
  const chartHeight = isMobile ? Math.min(height, 280) : height;

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      confine: true, // Keep within bounds on mobile
      textStyle: {
        color: '#f1f5f9',
        fontSize: isMobile ? 11 : 12,
      },
      formatter: (params: unknown) => {
        const items = params as Array<{
          name: string;
          seriesName: string;
          value: number;
          color: string;
        }>;
        if (!items?.length) return '';
        
        const year = items[0].name;
        const yearData = sortedData.find(d => d.year.toString() === year);
        
        let html = `<div style="font-weight: 600; margin-bottom: 6px; font-size: ${isMobile ? '13px' : '14px'};">${year}</div>`;
        
        items.forEach(item => {
          html += `
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '10px' : '16px'}; margin: 3px 0; font-size: ${isMobile ? '11px' : '12px'};">
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${item.color};"></span>
                ${item.seriesName}
              </span>
              <span style="font-weight: 500;">${formatEuroCompact(item.value)}</span>
            </div>
          `;
        });
        
        if (yearData) {
          const soldeColor = yearData.solde >= 0 ? '#10b981' : '#ef4444';
          html += `
            <div style="border-top: 1px solid rgba(148, 163, 184, 0.2); margin-top: 6px; padding-top: 6px;">
              <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '10px' : '16px'}; font-size: ${isMobile ? '11px' : '12px'};">
                <span>Solde</span>
                <span style="font-weight: 600; color: ${soldeColor};">
                  ${yearData.solde >= 0 ? '+' : ''}${formatEuroCompact(yearData.solde)}
                </span>
              </div>
            </div>
          `;
        }
        
        return html;
      },
    },
    legend: {
      data: ['Recettes', 'Dépenses'],
      // Mobile: légende en haut, Desktop: en bas
      ...(isMobile ? { top: 0 } : { bottom: 0 }),
      textStyle: {
        color: '#94a3b8',
        fontSize: isMobile ? 11 : 12,
      },
      itemWidth: isMobile ? 16 : 20,
      itemHeight: isMobile ? 8 : 10,
      itemGap: isMobile ? 12 : 20,
    },
    grid: {
      left: isMobile ? '2%' : '3%',
      right: isMobile ? '3%' : '4%',
      top: isMobile ? '18%' : '10%',
      bottom: isMobile ? '8%' : '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: years,
      axisLine: {
        lineStyle: { color: '#475569' },
      },
      axisLabel: {
        color: '#94a3b8',
        fontSize: isMobile ? 10 : 12,
        fontWeight: 500,
        // Rotation sur mobile si beaucoup d'années
        rotate: isMobile && years.length > 5 ? 45 : 0,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: isMobile ? 9 : 11,
        formatter: (value: number) => isMobile ? formatBillionsMobile(value) : formatBillions(value),
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(71, 85, 105, 0.3)',
          type: 'dashed',
        },
      },
    },
    series: [
      {
        name: 'Recettes',
        type: 'line',
        data: recettes,
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 10 : 8, // Plus grand pour touch
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: '#10b981',
        },
        itemStyle: {
          color: '#10b981',
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ],
          },
        },
      },
      {
        name: 'Dépenses',
        type: 'line',
        data: depenses,
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 10 : 8, // Plus grand pour touch
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: '#a855f7',
        },
        itemStyle: {
          color: '#a855f7',
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(168, 85, 247, 0.2)' },
              { offset: 1, color: 'rgba(168, 85, 247, 0.02)' },
            ],
          },
        },
      },
    ],
    animation: true,
    animationDuration: isMobile ? 500 : 800, // Plus rapide sur mobile
    animationEasing: 'cubicOut',
  }), [years, recettes, depenses, sortedData, isMobile]);

  // Gestion du clic sur un point
  const handleClick = (params: { name?: string }) => {
    if (params.name && onYearClick) {
      onYearClick(parseInt(params.name, 10));
    }
  };

  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: `${chartHeight}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{ click: handleClick }}
      />
    </div>
  );
}
