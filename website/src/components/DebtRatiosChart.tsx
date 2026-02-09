'use client';

/**
 * DebtRatiosChart - Évolution des ratios de soutenabilité de la dette
 *
 * Deux métriques clés pour évaluer la santé financière d'une collectivité :
 * 1. Durée de désendettement (années) = Dettes financières / Épargne brute
 *    → En combien d'années Paris pourrait rembourser sa dette
 * 2. Taux d'autofinancement (%) = Épargne brute / Recettes de fonctionnement
 *    → Quelle part des recettes courantes est "mise de côté"
 *
 * Affiche deux mini-charts ECharts empilés verticalement, chacun avec :
 * - Son propre axe Y et ses seuils de référence (markLine)
 * - Des barres colorées dynamiquement selon les seuils
 *
 * Responsive : tailles adaptées pour mobile/desktop.
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { PALETTE } from '@/lib/colors';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

export interface DebtRatioYearData {
  year: number;
  /** Encours de dettes financières (en €) */
  dettes_financieres: number;
  /** Épargne brute = Recettes fonct. − Dépenses fonct. (en €) */
  epargne_brute: number;
  /** Recettes de fonctionnement (en €) */
  recettes_fonctionnement: number;
  /** True si dettes_financieres est estimé (pas de bilan réel) */
  estimated?: boolean;
}

interface DebtRatiosChartProps {
  /** Données par année */
  data: DebtRatioYearData[];
  /** Hauteur totale des deux charts en pixels */
  height?: number;
}

/**
 * Détermine la couleur d'une barre de durée selon les seuils collectivités
 * @param years - Durée de désendettement en années
 */
function getDurationColor(years: number): string {
  if (years <= 7) return PALETTE.emerald;
  if (years <= 12) return PALETTE.amber;
  return PALETTE.red;
}

/**
 * Détermine la couleur d'une barre de taux d'autofinancement
 * @param pct - Taux en pourcentage
 */
function getAutofinColor(pct: number): string {
  if (pct >= 15) return PALETTE.emerald;
  if (pct >= 8) return PALETTE.amber;
  return PALETTE.red;
}

/** Plafond d'affichage pour la durée (au-delà, la barre est tronquée avec un label) */
const MAX_DURATION_DISPLAY = 40;

export default function DebtRatiosChart({
  data,
  height = 500,
}: DebtRatiosChartProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year);
  }, [data]);

  const years = sortedData.map(d => d.year.toString());

  /** Indique si au moins une année est estimée */
  const hasEstimated = sortedData.some(d => d.estimated);

  /** Durée de désendettement = dettes financières / épargne brute (en années) */
  const durees = useMemo(() => sortedData.map(d => {
    if (d.epargne_brute <= 0) return MAX_DURATION_DISPLAY;
    return d.dettes_financieres / d.epargne_brute;
  }), [sortedData]);

  /** Taux d'autofinancement = épargne brute / recettes fonctionnement × 100 */
  const taux = useMemo(() => sortedData.map(d => {
    if (d.recettes_fonctionnement <= 0) return 0;
    return (d.epargne_brute / d.recettes_fonctionnement) * 100;
  }), [sortedData]);

  /** Hauteur de chaque mini-chart */
  const singleHeight = isMobile ? Math.min(height / 2, 200) : height / 2;

  // ─── Chart 1 : Durée de désendettement ──────────────────────────────────

  const durationOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    title: {
      text: 'Durée de désendettement',
      textStyle: { color: '#e2e8f0', fontSize: isMobile ? 13 : 14, fontWeight: 600 },
      left: 0,
      top: 0,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      confine: true,
      textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 12 },
      formatter: (params: unknown) => {
        const items = params as Array<{ dataIndex: number; name: string }>;
        if (!items?.length) return '';
        const idx = items[0].dataIndex;
        const d = sortedData[idx];
        const rawDuree = d.epargne_brute > 0 ? d.dettes_financieres / d.epargne_brute : Infinity;
        const dureeLabel = rawDuree > MAX_DURATION_DISPLAY ? `> ${MAX_DURATION_DISPLAY} ans` : `${rawDuree.toFixed(1)} ans`;
        const color = getDurationColor(rawDuree);
        const qualif = rawDuree <= 7 ? '✅ Sain' : rawDuree <= 12 ? '⚠️ Vigilance' : '🔴 Critique';
        return `
          <div style="padding: 4px;">
            <div style="font-weight: 600; margin-bottom: 6px;">${items[0].name}</div>
            <div style="display: flex; justify-content: space-between; gap: 16px; align-items: center;">
              <span style="font-size: 16px; font-weight: 700; color: ${color};">${dureeLabel}</span>
              <span style="font-size: 10px; color: #94a3b8;">${qualif}</span>
            </div>
            <div style="border-top: 1px solid rgba(148,163,184,0.2); margin-top: 6px; padding-top: 4px; font-size: 10px; color: #64748b;">
              Dette : ${formatEuroCompact(d.dettes_financieres)}${d.estimated ? ' (est.)' : ''} · Épargne : ${formatEuroCompact(d.epargne_brute)}
            </div>
            <div style="font-size: 9px; color: #475569; margin-top: 4px;">Réf. : grille CRC / Cour des comptes</div>
          </div>
        `;
      },
    },
    grid: {
      left: isMobile ? '2%' : '3%',
      right: isMobile ? '4%' : '4%',
      top: isMobile ? '22%' : '18%',
      bottom: '5%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: years,
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: isMobile ? 10 : 12,
        fontWeight: 500,
        formatter: (value: string) => {
          const yr = parseInt(value, 10);
          const d = sortedData.find(item => item.year === yr);
          return d?.estimated ? `${value}*` : value;
        },
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: isMobile ? '' : 'Années',
      nameTextStyle: { color: '#64748b', fontSize: 10 },
      axisLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: isMobile ? 9 : 11 },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } },
      max: MAX_DURATION_DISPLAY,
      min: 0,
    },
    series: [
      {
        type: 'bar',
        data: durees.map((d, i) => {
          const isEstimated = sortedData[i]?.estimated;
          return {
            value: Math.min(d, MAX_DURATION_DISPLAY),
            itemStyle: {
              color: getDurationColor(d),
              opacity: isEstimated ? 0.55 : 1,
              borderRadius: [3, 3, 0, 0],
              ...(isEstimated ? { borderColor: '#94a3b8', borderWidth: 1, borderType: 'dashed' as const } : {}),
            },
            // Label au-dessus si tronqué
            ...(d > MAX_DURATION_DISPLAY ? {
              label: {
                show: true,
                position: 'top' as const,
                formatter: `${Math.round(d)}a`,
                fontSize: 9,
                color: PALETTE.red,
                fontWeight: 600,
              },
            } : {}),
          };
        }),
        barMaxWidth: isMobile ? 35 : 45,
        // Seuils de référence
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { type: 'dashed', width: 1 },
          label: { fontSize: isMobile ? 8 : 10, position: 'insideEndTop' },
          data: [
            {
              yAxis: 7,
              lineStyle: { color: PALETTE.emerald },
              label: { formatter: '7 ans', color: PALETTE.emerald },
            },
            {
              yAxis: 12,
              lineStyle: { color: PALETTE.amber },
              label: { formatter: '12 ans', color: PALETTE.amber },
            },
          ],
        },
      },
    ],
    animation: true,
    animationDuration: isMobile ? 400 : 600,
    animationEasing: 'cubicOut',
  }), [years, durees, sortedData, isMobile]);

  // ─── Chart 2 : Taux d'autofinancement ───────────────────────────────────

  const autofinOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    title: {
      text: 'Taux d\'autofinancement',
      textStyle: { color: '#e2e8f0', fontSize: isMobile ? 13 : 14, fontWeight: 600 },
      left: 0,
      top: 0,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      confine: true,
      textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 12 },
      formatter: (params: unknown) => {
        const items = params as Array<{ dataIndex: number; name: string }>;
        if (!items?.length) return '';
        const idx = items[0].dataIndex;
        const d = sortedData[idx];
        const tauxVal = d.recettes_fonctionnement > 0
          ? (d.epargne_brute / d.recettes_fonctionnement) * 100
          : 0;
        const color = getAutofinColor(tauxVal);
        const qualif = tauxVal >= 15 ? '✅ Confortable' : tauxVal >= 8 ? '⚠️ Correct' : '🔴 Fragile';
        return `
          <div style="padding: 4px;">
            <div style="font-weight: 600; margin-bottom: 6px;">${items[0].name}</div>
            <div style="display: flex; justify-content: space-between; gap: 16px; align-items: center;">
              <span style="font-size: 16px; font-weight: 700; color: ${color};">${tauxVal.toFixed(1)}%</span>
              <span style="font-size: 10px; color: #94a3b8;">${qualif}</span>
            </div>
            <div style="border-top: 1px solid rgba(148,163,184,0.2); margin-top: 6px; padding-top: 4px; font-size: 10px; color: #64748b;">
              Épargne : ${formatEuroCompact(d.epargne_brute)} · Rec. fonct. : ${formatEuroCompact(d.recettes_fonctionnement)}
            </div>
            <div style="font-size: 9px; color: #475569; margin-top: 4px;">Réf. : grille CRC / Cour des comptes</div>
          </div>
        `;
      },
    },
    grid: {
      left: isMobile ? '2%' : '3%',
      right: isMobile ? '4%' : '4%',
      top: isMobile ? '22%' : '18%',
      bottom: '5%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: years,
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: isMobile ? 10 : 12,
        fontWeight: 500,
        formatter: (value: string) => {
          const yr = parseInt(value, 10);
          const d = sortedData.find(item => item.year === yr);
          return d?.estimated ? `${value}*` : value;
        },
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: isMobile ? '' : '%',
      nameTextStyle: { color: '#64748b', fontSize: 10 },
      axisLine: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: isMobile ? 9 : 11,
        formatter: (value: number) => `${value}%`,
      },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } },
      min: 0,
    },
    series: [
      {
        type: 'bar',
        data: taux.map((t, i) => {
          const isEstimated = sortedData[i]?.estimated;
          return {
            value: t,
            itemStyle: {
              color: getAutofinColor(t),
              opacity: isEstimated ? 0.55 : 1,
              borderRadius: [3, 3, 0, 0],
              ...(isEstimated ? { borderColor: '#94a3b8', borderWidth: 1, borderType: 'dashed' as const } : {}),
            },
          };
        }),
        barMaxWidth: isMobile ? 35 : 45,
        // Seuils de référence
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { type: 'dashed', width: 1 },
          label: { fontSize: isMobile ? 8 : 10, position: 'insideEndTop' },
          data: [
            {
              yAxis: 8,
              lineStyle: { color: PALETTE.amber },
              label: { formatter: '8%', color: PALETTE.amber },
            },
            {
              yAxis: 15,
              lineStyle: { color: PALETTE.emerald },
              label: { formatter: '15%', color: PALETTE.emerald },
            },
          ],
        },
      },
    ],
    animation: true,
    animationDuration: isMobile ? 400 : 600,
    animationEasing: 'cubicOut',
  }), [years, taux, sortedData, isMobile]);

  return (
    <div className="w-full space-y-4">
      <ReactECharts
        option={durationOption}
        style={{ height: `${singleHeight}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      <ReactECharts
        option={autofinOption}
        style={{ height: `${singleHeight}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      {hasEstimated && (
        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-slate-500" />
          * Dette estimée : encours 2024 (bilan) +&nbsp;emprunts − remboursements (budget voté)
        </p>
      )}
    </div>
  );
}
