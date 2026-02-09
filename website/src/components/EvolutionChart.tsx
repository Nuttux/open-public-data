'use client';

/**
 * EvolutionChart - Graphique d'évolution du budget
 * 
 * Affiche l'évolution des recettes et dépenses sur plusieurs années
 * avec un line chart ECharts.
 * 
 * Features:
 * - Courbes Recettes et Dépenses
 * - Barres "Déficit" en fond (vert si excédent, rouge si déficit)
 * - Axe Y en milliards d'euros
 * - Tooltip avec détails
 * - Responsive: légende en haut sur mobile, symboles plus grands pour touch
 * - Pointillés pour les années avec budget voté (prévisionnel)
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { FLUX_COLORS } from '@/lib/colors';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

export interface YearlyBudget {
  year: number;
  recettes: number;
  depenses: number;
  solde: number;
  /** "execute" pour budget exécuté (réel), "vote" pour budget voté (prévisionnel) */
  type_budget?: 'execute' | 'vote';
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
  const soldes = sortedData.map(d => d.solde);

  /** Index du premier point "voté" (prévisionnel) — utilisé pour séparer trait plein / pointillé */
  const firstVotedIdx = useMemo(() => {
    const idx = sortedData.findIndex(d => d.type_budget === 'vote');
    return idx >= 0 ? idx : -1;
  }, [sortedData]);

  /** Indique si le graphique contient des années prévisionnelles */
  const hasVotedYears = firstVotedIdx >= 0;

  /**
   * Sépare un tableau de valeurs en deux séries :
   * - executedValues : valeurs réelles (les points votés sont `null` SAUF le point de jonction)
   * - votedValues : valeurs votées (les points exécutés sont `null` SAUF le point de jonction)
   * Le point de jonction (dernier exécuté) apparaît dans les deux pour assurer la continuité.
   */
  const splitSeries = useMemo(() => {
    if (!hasVotedYears) return null;

    // Le point juste avant le premier voté = jonction
    const junctionIdx = firstVotedIdx - 1;

    const executedRecettes = sortedData.map((d, i) =>
      i <= junctionIdx ? d.recettes : null
    );
    const executedDepenses = sortedData.map((d, i) =>
      i <= junctionIdx ? d.depenses : null
    );
    const votedRecettes = sortedData.map((d, i) =>
      i >= junctionIdx && d.type_budget === 'vote' || i === junctionIdx ? d.recettes : null
    );
    const votedDepenses = sortedData.map((d, i) =>
      i >= junctionIdx && d.type_budget === 'vote' || i === junctionIdx ? d.depenses : null
    );

    return { executedRecettes, executedDepenses, votedRecettes, votedDepenses };
  }, [sortedData, firstVotedIdx, hasVotedYears]);

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
        const isVoted = yearData?.type_budget === 'vote';
        
        let html = `<div style="font-weight: 600; margin-bottom: 6px; font-size: ${isMobile ? '13px' : '14px'};">`;
        html += year;
        if (isVoted) {
          html += `<span style="font-weight: 400; font-size: 10px; color: #94a3b8; margin-left: 6px; vertical-align: middle; border: 1px solid #475569; border-radius: 3px; padding: 1px 4px;">voté</span>`;
        }
        html += `</div>`;
        
        // Afficher Recettes et Dépenses (exclure Déficit car affiché séparément)
        items
          .filter(item => item.seriesName !== 'Déficit')
          .forEach(item => {
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
        
        // Ligne séparée pour le déficit/excédent
        if (yearData) {
          const soldeColor = yearData.solde >= 0 ? FLUX_COLORS.solde.positif : FLUX_COLORS.solde.negatif;
          const soldeLabel = yearData.solde >= 0 ? 'Excédent' : 'Déficit';
          html += `
            <div style="border-top: 1px solid rgba(148, 163, 184, 0.2); margin-top: 6px; padding-top: 6px;">
              <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '10px' : '16px'}; font-size: ${isMobile ? '11px' : '12px'};">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 4px; border-radius: 1px; background: ${soldeColor};"></span>
                  ${soldeLabel}
                </span>
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
      data: ['Recettes', 'Dépenses', 'Déficit'],
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
        // Astérisque pour les années avec budget voté
        formatter: (value: string) => {
          const yearNum = parseInt(value, 10);
          const d = sortedData.find(item => item.year === yearNum);
          return d?.type_budget === 'vote' ? `${value}*` : value;
        },
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
      // ── Recettes (trait plein = exécuté) ──
      {
        name: 'Recettes',
        type: 'line',
        data: splitSeries ? splitSeries.executedRecettes : recettes,
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 10 : 8,
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: FLUX_COLORS.recettes,
        },
        itemStyle: {
          color: FLUX_COLORS.recettes,
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ],
          },
        },
      },
      // ── Dépenses (trait plein = exécuté) ──
      {
        name: 'Dépenses',
        type: 'line',
        data: splitSeries ? splitSeries.executedDepenses : depenses,
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 10 : 8,
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: FLUX_COLORS.depenses,
        },
        itemStyle: {
          color: FLUX_COLORS.depenses,
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 63, 94, 0.2)' },
              { offset: 1, color: 'rgba(244, 63, 94, 0.02)' },
            ],
          },
        },
      },
      // ── Recettes votées (trait pointillé = prévisionnel) ──
      ...(splitSeries ? [{
        name: 'Recettes',
        type: 'line' as const,
        data: splitSeries.votedRecettes,
        smooth: true,
        symbol: 'diamond',
        symbolSize: isMobile ? 10 : 8,
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: FLUX_COLORS.recettes,
          type: 'dashed' as const,
        },
        itemStyle: {
          color: FLUX_COLORS.recettes,
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.08)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.01)' },
            ],
          },
        },
      }] : []),
      // ── Dépenses votées (trait pointillé = prévisionnel) ──
      ...(splitSeries ? [{
        name: 'Dépenses',
        type: 'line' as const,
        data: splitSeries.votedDepenses,
        smooth: true,
        symbol: 'diamond',
        symbolSize: isMobile ? 10 : 8,
        lineStyle: {
          width: isMobile ? 2.5 : 3,
          color: FLUX_COLORS.depenses,
          type: 'dashed' as const,
        },
        itemStyle: {
          color: FLUX_COLORS.depenses,
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 63, 94, 0.08)' },
              { offset: 1, color: 'rgba(244, 63, 94, 0.01)' },
            ],
          },
        },
      }] : []),
      // ── Barres Déficit / Excédent (fond) ──
      {
        name: 'Déficit',
        type: 'bar',
        itemStyle: {
          color: FLUX_COLORS.solde.negatif,
        },
        data: soldes.map((s, i) => ({
          value: s,
          itemStyle: {
            color: s >= 0 ? FLUX_COLORS.solde.positif : FLUX_COLORS.solde.negatif,
            // Opacité réduite pour les années votées
            opacity: sortedData[i]?.type_budget === 'vote' ? 0.12 : 0.25,
            borderRadius: s >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2],
            // Bordure pointillée pour barres votées
            ...(sortedData[i]?.type_budget === 'vote' ? {
              borderColor: s >= 0 ? FLUX_COLORS.solde.positif : FLUX_COLORS.solde.negatif,
              borderWidth: 1,
              borderType: 'dashed' as const,
            } : {}),
          },
        })),
        barWidth: isMobile ? '30%' : '40%',
        z: 0,
      },
    ],
    animation: true,
    animationDuration: isMobile ? 500 : 800, // Plus rapide sur mobile
    animationEasing: 'cubicOut',
  }), [years, recettes, depenses, soldes, sortedData, isMobile, splitSeries]);

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
