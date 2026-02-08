'use client';

/**
 * VariationRankChart - Bar charts bidirectionnels des variations budgétaires (Option B: empilés)
 * 
 * Affiche DEUX charts empilés verticalement:
 * - DÉPENSES: par thématique (où va l'argent: Social, Éducation, Transport...)
 * - RECETTES: par source (d'où vient l'argent: Impôts, Emprunts, Dotations...)
 * 
 * Cette distinction est importante car les classifications sont différentes:
 * - Pour les dépenses, on veut savoir "où" l'argent est dépensé
 * - Pour les recettes, on veut savoir "d'où" l'argent vient
 * 
 * Features:
 * - Barres horizontales triées par variation absolue
 * - Couleur verte pour hausse, rouge pour baisse
 * - Labels avec montant € et pourcentage %
 * - Responsive
 * 
 * Props:
 * - data: Structure variations_6ans du JSON evolution_budget.json
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

/** Structure d'un poste avec variation */
export interface VariationItem {
  label: string;  // Thématique pour dépenses, Source pour recettes
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
  classifications?: {
    depenses: string;
    recettes: string;
  };
}

interface VariationRankChartProps {
  /** Données de variation */
  data: VariationsData;
  /** Nombre maximum de postes à afficher par chart */
  maxItems?: number;
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

/**
 * Single variation bar chart
 */
interface SingleChartProps {
  items: VariationItem[];
  periode: { debut: number; fin: number };
  isMobile: boolean;
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
}

function SingleVariationChart({ 
  items, 
  periode, 
  isMobile, 
  title, 
  subtitle, 
  icon,
  accentColor,
}: SingleChartProps) {
  // Séparer hausses et baisses pour le tri visuel
  const sortedData = useMemo(() => {
    const hausses = items.filter(item => item.variation_euros >= 0)
      .sort((a, b) => b.variation_euros - a.variation_euros);
    const baisses = items.filter(item => item.variation_euros < 0)
      .sort((a, b) => a.variation_euros - b.variation_euros);
    return [...hausses, ...baisses];
  }, [items]);

  // Hauteur adaptative basée sur le nombre d'items
  const chartHeight = useMemo(() => {
    const itemHeight = isMobile ? 32 : 36;
    const minHeight = 150;
    const computed = sortedData.length * itemHeight + 40;
    return Math.max(minHeight, computed);
  }, [sortedData.length, isMobile]);

  const option: EChartsOption = useMemo(() => {
    const categories = sortedData.map(d => d.label);
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
          const paramsArray = params as Array<{ name: string; value: number; dataIndex: number }>;
          if (!paramsArray?.length) return '';
          
          const item = sortedData[paramsArray[0].dataIndex];
          const color = item.variation_euros >= 0 ? PALETTE.emerald : PALETTE.red;
          
          return `
            <div style="font-weight: 600; margin-bottom: 6px;">${item.label}</div>
            <div style="display: flex; justify-content: space-between; gap: 20px;">
              <span>${periode.debut}:</span>
              <span>${formatEuroCompact(item.montant_debut)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 20px;">
              <span>${periode.fin}:</span>
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
        top: 5,
        bottom: 5,
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
          width: isMobile ? 90 : 140,
          overflow: 'truncate',
          ellipsis: '...',
        },
      },
      series: [
        {
          type: 'bar',
          data: values.map((val) => ({
            value: val,
            itemStyle: {
              color: val >= 0 
                ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                    { offset: 0, color: PALETTE.emerald },
                    { offset: 1, color: '#059669' }  // emerald-600 (darker shade)
                  ]}
                : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                    { offset: 0, color: '#dc2626' },  // red-600 (darker shade)
                    { offset: 1, color: PALETTE.red }
                  ]},
              borderRadius: val >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
            },
          })),
          barMaxWidth: isMobile ? 18 : 22,
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
  }, [sortedData, periode, isMobile]);

  if (sortedData.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-8 rounded-full bg-${accentColor}-500`}></span>
        <div>
          <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span>{icon}</span>
            {title}
          </h4>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>

      {/* Chart */}
      <ReactECharts
        option={option}
        style={{ height: `${chartHeight}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}

export default function VariationRankChart({
  data,
  maxItems = 8,
}: VariationRankChartProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);

  // Filter out "Autre"/"Autres" and limit items
  const filteredDepenses = useMemo(() => {
    return data.depenses
      .filter(item => item.label !== 'Autre' && item.label !== 'Autres')
      .slice(0, maxItems);
  }, [data.depenses, maxItems]);

  const filteredRecettes = useMemo(() => {
    return data.recettes
      .filter(item => item.label !== 'Autre' && item.label !== 'Autres')
      .slice(0, maxItems);
  }, [data.recettes, maxItems]);

  return (
    <div className="w-full">
      {/* Main header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span>📊</span>
          Évolution {data.periode.debut} → {data.periode.fin}
        </h3>
        <p className="text-sm text-slate-400">
          Où l&apos;argent est dépensé et d&apos;où il vient — postes qui ont le plus évolué
        </p>
      </div>

      {/* Légende globale */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500"></span>
          <span>Hausse</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500"></span>
          <span>Baisse</span>
        </div>
      </div>

      {/* DÉPENSES Chart */}
      <SingleVariationChart
        items={filteredDepenses}
        periode={data.periode}
        isMobile={isMobile}
        title="Dépenses — par destination"
        subtitle="Où l'argent est dépensé (Social, Éducation, Transport...)"
        icon="📉"
        accentColor="purple"
      />

      {/* Séparateur */}
      <div className="border-t border-slate-700/50 my-4"></div>

      {/* RECETTES Chart */}
      <SingleVariationChart
        items={filteredRecettes}
        periode={data.periode}
        isMobile={isMobile}
        title="Recettes — par source"
        subtitle="D'où vient l'argent (Impôts, Emprunts, Dotations...)"
        icon="📈"
        accentColor="emerald"
      />

      {/* Note */}
      <p className="text-xs text-slate-500 mt-2">
        * Hors catégories &quot;Autre&quot; (agrégats de postes mineurs)
      </p>
    </div>
  );
}
