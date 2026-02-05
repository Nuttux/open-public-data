'use client';

/**
 * VariationRankChart - Bar chart bidirectionnel des variations budgétaires
 * 
 * Affiche les postes qui ont le plus augmenté/diminué sur une période (ex: 2019→2024)
 * 
 * Features:
 * - Barres horizontales triées par variation absolue
 * - Couleur verte pour hausse, rouge pour baisse
 * - Labels avec montant € et pourcentage %
 * - Toggle Dépenses/Recettes
 * - Responsive
 * 
 * Props:
 * - data: Structure variations_6ans du JSON evolution_budget.json
 */

import { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

/** Structure d'un poste avec variation */
export interface VariationItem {
  thematique: string;
  montant_debut: number;
  montant_fin: number;
  variation_euros: number;
  variation_pct: number;
}

/** Structure des données de variation */
export interface VariationsData {
  periode: {
    debut: number;
    fin: number;
  };
  depenses: VariationItem[];
  recettes: VariationItem[];
}

interface VariationRankChartProps {
  /** Données de variation */
  data: VariationsData;
  /** Nombre maximum de postes à afficher */
  maxItems?: number;
  /** Hauteur du graphique */
  height?: number;
}

/**
 * Formate un montant en millions avec signe
 */
function formatVariation(value: number): string {
  const millions = value / 1_000_000;
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(millions) >= 1000) {
    return `${sign}${(millions / 1000).toFixed(1)} Md€`;
  }
  return `${sign}${millions.toFixed(0)} M€`;
}

export default function VariationRankChart({
  data,
  maxItems = 10,
  height = 400,
}: VariationRankChartProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const [viewType, setViewType] = useState<'depenses' | 'recettes'>('depenses');

  // Filtrer "Autre" et limiter le nombre d'items
  const filteredData = useMemo(() => {
    const items = viewType === 'depenses' ? data.depenses : data.recettes;
    return items
      .filter(item => item.thematique !== 'Autre')
      .slice(0, maxItems);
  }, [data, viewType, maxItems]);

  // Séparer hausses et baisses pour le tri visuel
  const { hausses, baisses } = useMemo(() => {
    const h = filteredData.filter(item => item.variation_euros >= 0)
      .sort((a, b) => b.variation_euros - a.variation_euros);
    const b = filteredData.filter(item => item.variation_euros < 0)
      .sort((a, b) => a.variation_euros - b.variation_euros);
    return { hausses: h, baisses: b };
  }, [filteredData]);

  // Combiner: hausses en haut, baisses en bas
  const sortedData = useMemo(() => {
    return [...hausses, ...baisses];
  }, [hausses, baisses]);

  // Hauteur adaptative basée sur le nombre d'items
  const chartHeight = useMemo(() => {
    const itemHeight = isMobile ? 35 : 40;
    const minHeight = 200;
    const computed = sortedData.length * itemHeight + 80;
    return Math.max(minHeight, Math.min(height, computed));
  }, [sortedData.length, isMobile, height]);

  const option: EChartsOption = useMemo(() => {
    const categories = sortedData.map(d => d.thematique);
    const values = sortedData.map(d => d.variation_euros);
    const pcts = sortedData.map(d => d.variation_pct);

    // Trouver le max pour l'échelle symétrique
    const maxVal = Math.max(...values.map(Math.abs));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number; dataIndex: number }>;
          if (!items?.length) return '';
          
          const item = sortedData[items[0].dataIndex];
          const color = item.variation_euros >= 0 ? '#10b981' : '#ef4444';
          
          return `
            <div style="font-weight: 600; margin-bottom: 6px;">${item.thematique}</div>
            <div style="display: flex; justify-content: space-between; gap: 20px;">
              <span>${data.periode.debut}:</span>
              <span>${formatEuroCompact(item.montant_debut)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 20px;">
              <span>${data.periode.fin}:</span>
              <span>${formatEuroCompact(item.montant_fin)}</span>
            </div>
            <div style="border-top: 1px solid rgba(148,163,184,0.3); margin-top: 6px; padding-top: 6px;">
              <span style="color: ${color}; font-weight: 600;">
                ${formatVariation(item.variation_euros)} (${item.variation_pct >= 0 ? '+' : ''}${item.variation_pct}%)
              </span>
            </div>
          `;
        },
      },
      grid: {
        left: isMobile ? '5%' : '3%',
        right: isMobile ? '15%' : '12%',
        top: 10,
        bottom: 10,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        min: -maxVal * 1.1,
        max: maxVal * 1.1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: {
          lineStyle: { color: 'rgba(71, 85, 105, 0.2)', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#94a3b8',
          fontSize: isMobile ? 10 : 12,
          width: isMobile ? 100 : 150,
          overflow: 'truncate',
          ellipsis: '...',
        },
      },
      series: [
        {
          type: 'bar',
          data: values.map((val, idx) => ({
            value: val,
            itemStyle: {
              color: val >= 0 
                ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                    { offset: 0, color: '#10b981' },
                    { offset: 1, color: '#059669' }
                  ]}
                : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                    { offset: 0, color: '#dc2626' },
                    { offset: 1, color: '#ef4444' }
                  ]},
              borderRadius: val >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
            },
          })),
          barMaxWidth: isMobile ? 20 : 24,
          label: {
            show: true,
            position: 'right',
            formatter: (params) => {
              const p = params as { dataIndex: number; value: number };
              const pct = pcts[p.dataIndex];
              const val = p.value;
              if (isMobile) {
                return `{a|${formatVariation(val)}}`;
              }
              return `{a|${formatVariation(val)}} {b|(${pct >= 0 ? '+' : ''}${pct}%)}`;
            },
            rich: {
              a: { color: '#e2e8f0', fontSize: isMobile ? 10 : 11, fontWeight: 500 },
              b: { color: '#64748b', fontSize: isMobile ? 9 : 10 },
            },
          },
        },
      ],
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicOut',
    };
  }, [sortedData, data.periode, isMobile]);

  return (
    <div className="w-full">
      {/* Header avec toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <span>📊</span>
            Évolution {data.periode.debut} → {data.periode.fin}
          </h3>
          <p className="text-sm text-slate-400">
            Postes qui ont le plus évolué sur 6 ans
          </p>
        </div>
        
        {/* Toggle Dépenses/Recettes */}
        <div className="inline-flex rounded-lg bg-slate-700/50 p-0.5 border border-slate-600/50">
          <button
            onClick={() => setViewType('depenses')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewType === 'depenses'
                ? 'bg-purple-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dépenses
          </button>
          <button
            onClick={() => setViewType('recettes')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewType === 'recettes'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Recettes
          </button>
        </div>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-4 mb-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500"></span>
          <span>Hausse</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500"></span>
          <span>Baisse</span>
        </div>
      </div>

      {/* Chart */}
      <ReactECharts
        option={option}
        style={{ height: `${chartHeight}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />

      {/* Note */}
      <p className="text-xs text-slate-500 mt-2">
        * Hors catégorie &quot;Autre&quot; (agrégat de postes mineurs)
      </p>
    </div>
  );
}
