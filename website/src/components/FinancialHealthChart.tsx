'use client';

/**
 * FinancialHealthChart - Graphique des métriques de santé financière
 * 
 * Affiche l'évolution de:
 * - Épargne brute (capacité d'autofinancement)
 * - Surplus/Déficit financier (hors emprunts)
 * 
 * Features:
 * - Bar chart pour épargne brute (toujours positive = bonne santé)
 * - Line chart pour surplus/déficit (peut être négatif)
 * - Axe zéro visible
 * - Responsive
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

export interface FinancialYearData {
  year: number;
  epargne_brute: number;      // Recettes fonct - Dépenses fonct
  surplus_deficit: number;    // Recettes propres - Dépenses
  recettes_propres?: number;  // Recettes - Emprunts
  emprunts?: number;
}

interface FinancialHealthChartProps {
  /** Données par année */
  data: FinancialYearData[];
  /** Hauteur du graphique en pixels */
  height?: number;
  /** Année actuellement sélectionnée */
  selectedYear?: number;
  /** Callback au clic sur une année */
  onYearClick?: (year: number) => void;
}

/**
 * Formate un montant en millions d'euros
 */
function formatMillions(value: number): string {
  const millions = value / 1_000_000;
  if (Math.abs(millions) >= 1000) {
    return `${(millions / 1000).toFixed(1)} Md€`;
  }
  return `${millions.toFixed(0)} M€`;
}

/**
 * Version courte pour mobile
 */
function formatMillionsMobile(value: number): string {
  const millions = value / 1_000_000;
  if (Math.abs(millions) >= 1000) {
    return `${(millions / 1000).toFixed(0)}Md`;
  }
  return `${millions.toFixed(0)}M`;
}

export default function FinancialHealthChart({
  data,
  height = 350,
  selectedYear: _selectedYear,
  onYearClick,
}: FinancialHealthChartProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  
  // Trier par année
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year);
  }, [data]);

  const years = sortedData.map(d => d.year.toString());
  const epargne = sortedData.map(d => d.epargne_brute);
  const surplus = sortedData.map(d => d.surplus_deficit);

  // Hauteur adaptative
  const chartHeight = isMobile ? Math.min(height, 280) : height;

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      confine: true,
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
        
        let html = `<div style="font-weight: 600; margin-bottom: 8px; font-size: ${isMobile ? '13px' : '14px'};">${year}</div>`;
        
        items.forEach(item => {
          const valueColor = item.value >= 0 ? '#10b981' : '#ef4444';
          html += `
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '10px' : '20px'}; margin: 4px 0; font-size: ${isMobile ? '11px' : '12px'};">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 10px; height: 10px; border-radius: 2px; background: ${item.color};"></span>
                ${item.seriesName}
              </span>
              <span style="font-weight: 600; color: ${valueColor};">
                ${item.value >= 0 ? '+' : ''}${formatEuroCompact(item.value)}
              </span>
            </div>
          `;
        });
        
        // Emprunts si disponible
        if (yearData?.emprunts) {
          html += `
            <div style="border-top: 1px solid rgba(148, 163, 184, 0.2); margin-top: 8px; padding-top: 6px; font-size: ${isMobile ? '10px' : '11px'}; color: #94a3b8;">
              Emprunts comptabilisés : ${formatEuroCompact(yearData.emprunts)}
            </div>
          `;
        }
        
        return html;
      },
    },
    legend: {
      data: ['Épargne brute', 'Surplus/Déficit'],
      ...(isMobile ? { top: 0 } : { bottom: 0 }),
      textStyle: {
        color: '#94a3b8',
        fontSize: isMobile ? 10 : 12,
      },
      itemWidth: isMobile ? 16 : 20,
      itemHeight: isMobile ? 8 : 10,
      itemGap: isMobile ? 10 : 20,
    },
    grid: {
      left: isMobile ? '2%' : '3%',
      right: isMobile ? '3%' : '4%',
      top: isMobile ? '18%' : '12%',
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
        formatter: (value: number) => isMobile ? formatMillionsMobile(value) : formatMillions(value),
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(71, 85, 105, 0.3)',
          type: 'dashed',
        },
      },
      // Ligne de zéro plus visible
      splitNumber: 5,
    },
    series: [
      {
        name: 'Épargne brute',
        type: 'bar',
        data: epargne,
        barMaxWidth: isMobile ? 30 : 40,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#22c55e' },
              { offset: 1, color: '#15803d' },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(34, 197, 94, 0.4)',
          },
        },
      },
      {
        name: 'Surplus/Déficit',
        type: 'line',
        data: surplus,
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 10 : 8,
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: '#f97316',
        },
        itemStyle: {
          color: (params) => {
            // Rouge si négatif, orange si positif
            const value = params.value as number;
            return value >= 0 ? '#f97316' : '#ef4444';
          },
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
              { offset: 0, color: 'rgba(249, 115, 22, 0.15)' },
              { offset: 1, color: 'rgba(249, 115, 22, 0.02)' },
            ],
          },
        },
        // Marquer le zéro
        markLine: {
          silent: true,
          lineStyle: {
            color: '#64748b',
            type: 'solid',
            width: 1,
          },
          data: [{ yAxis: 0 }],
          label: { show: false },
          symbol: ['none', 'none'],
        },
      },
    ],
    animation: true,
    animationDuration: isMobile ? 500 : 800,
    animationEasing: 'cubicOut',
  }), [years, epargne, surplus, sortedData, isMobile]);

  // Gestion du clic
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
