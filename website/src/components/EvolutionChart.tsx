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
 * - Responsive
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';

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

export default function EvolutionChart({
  data,
  height = 350,
  selectedYear,
  onYearClick,
}: EvolutionChartProps) {
  // Trier par année
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year);
  }, [data]);

  const years = sortedData.map(d => d.year.toString());
  const recettes = sortedData.map(d => d.recettes);
  const depenses = sortedData.map(d => d.depenses);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      textStyle: {
        color: '#f1f5f9',
        fontSize: 12,
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
        
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">${year}</div>`;
        
        items.forEach(item => {
          html += `
            <div style="display: flex; justify-content: space-between; gap: 16px; margin: 4px 0;">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
                ${item.seriesName}
              </span>
              <span style="font-weight: 500;">${formatEuroCompact(item.value)}</span>
            </div>
          `;
        });
        
        if (yearData) {
          const soldeColor = yearData.solde >= 0 ? '#10b981' : '#ef4444';
          html += `
            <div style="border-top: 1px solid rgba(148, 163, 184, 0.2); margin-top: 8px; padding-top: 8px;">
              <div style="display: flex; justify-content: space-between; gap: 16px;">
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
      bottom: 0,
      textStyle: {
        color: '#94a3b8',
        fontSize: 12,
      },
      itemWidth: 20,
      itemHeight: 10,
      itemGap: 20,
    },
    grid: {
      left: '3%',
      right: '4%',
      top: '10%',
      bottom: '15%',
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
        fontSize: 12,
        fontWeight: 500,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatBillions(value),
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
        symbolSize: 8,
        lineStyle: {
          width: 3,
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
        symbolSize: 8,
        lineStyle: {
          width: 3,
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
    animationDuration: 800,
    animationEasing: 'cubicOut',
  }), [years, recettes, depenses, sortedData]);

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
        style={{ height: `${height}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{ click: handleClick }}
      />
    </div>
  );
}
