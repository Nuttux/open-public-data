'use client';

/**
 * DebtStockChart — Encours total de la dette financière de Paris
 *
 * Affiche un bar chart ECharts montrant l'évolution du stock de dette
 * au fil des années, avec distinction visuelle entre :
 *   - Données réelles (issues du bilan comptable) → barres pleines
 *   - Données estimées (dernier bilan + flux votés) → barres semi-transparentes à bordure pointillée
 *
 * Le tooltip indique la source (bilan vs estimation) et affiche les
 * emprunts / remboursements de l'année pour contextualiser la variation.
 *
 * Responsive : tailles adaptées pour mobile/desktop.
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { PALETTE } from '@/lib/colors';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebtStockYearData {
  year: number;
  /** Encours de dettes financières en fin d'année (en €) */
  dettes_financieres: number;
  /** True si le montant est estimé (pas de bilan réel) */
  estimated?: boolean;
  /** Emprunts contractés dans l'année (en €, optionnel, pour le tooltip) */
  emprunts?: number;
  /** Remboursement du principal dans l'année (en €, optionnel, pour le tooltip) */
  remboursement_principal?: number;
}

interface DebtStockChartProps {
  /** Données par année */
  data: DebtStockYearData[];
  /** Hauteur du graphique en pixels (défaut : 320) */
  height?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DebtStockChart({
  data,
  height = 320,
}: DebtStockChartProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);

  /** Données triées chronologiquement */
  const sortedData = useMemo(() => [...data].sort((a, b) => a.year - b.year), [data]);

  const years = sortedData.map(d => d.year.toString());

  /** Indique si au moins une année est estimée */
  const hasEstimated = sortedData.some(d => d.estimated);

  /** Couleur principale de la dette (rouge, cohérent avec le design system) */
  const DEBT_COLOR = PALETTE.red;

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
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

        /* Variation par rapport à l'année précédente */
        const prev = idx > 0 ? sortedData[idx - 1] : null;
        const delta = prev ? d.dettes_financieres - prev.dettes_financieres : null;
        const deltaPct = prev && prev.dettes_financieres > 0
          ? ((d.dettes_financieres - prev.dettes_financieres) / prev.dettes_financieres) * 100
          : null;

        let html = `<div style="padding: 4px;">`;
        html += `<div style="font-weight: 600; margin-bottom: 6px;">`;
        html += d.year;
        if (d.estimated) {
          html += `<span style="font-weight: 400; font-size: 10px; color: #94a3b8; margin-left: 6px; vertical-align: middle; border: 1px solid #475569; border-radius: 3px; padding: 1px 4px;">estimé</span>`;
        }
        html += `</div>`;

        /* Montant principal */
        html += `<div style="font-size: 16px; font-weight: 700; color: ${DEBT_COLOR};">`;
        html += formatEuroCompact(d.dettes_financieres);
        html += `</div>`;

        /* Variation vs N-1 */
        if (delta !== null && deltaPct !== null) {
          const sign = delta >= 0 ? '+' : '';
          const color = delta >= 0 ? PALETTE.red : PALETTE.emerald;
          html += `<div style="font-size: 11px; color: ${color}; margin-top: 2px;">`;
          html += `${sign}${formatEuroCompact(delta)} (${sign}${deltaPct.toFixed(1)}%)`;
          html += `</div>`;
        }

        /* Détail flux si disponible */
        if (d.emprunts != null || d.remboursement_principal != null) {
          html += `<div style="border-top: 1px solid rgba(148,163,184,0.2); margin-top: 6px; padding-top: 4px; font-size: 10px; color: #64748b;">`;
          if (d.emprunts != null) {
            html += `Emprunts : +${formatEuroCompact(d.emprunts)}`;
          }
          if (d.remboursement_principal != null) {
            html += ` · Remb. : −${formatEuroCompact(d.remboursement_principal)}`;
          }
          html += `</div>`;
        }

        if (d.estimated) {
          html += `<div style="font-size: 9px; color: #64748b; margin-top: 4px; font-style: italic;">`;
          html += `Estimation : bilan 2024 + flux votés`;
          html += `</div>`;
        }

        html += `</div>`;
        return html;
      },
    },
    grid: {
      left: isMobile ? '2%' : '3%',
      right: isMobile ? '4%' : '4%',
      top: isMobile ? '8%' : '6%',
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
      axisLine: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: isMobile ? 9 : 11,
        formatter: (value: number) => formatEuroCompact(value),
      },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.3)', type: 'dashed' } },
      /* Ne pas partir de 0 — sinon les barres seraient trop tassées */
      scale: true,
    },
    series: [
      {
        type: 'bar',
        data: sortedData.map(d => ({
          value: d.dettes_financieres,
          itemStyle: {
            color: DEBT_COLOR,
            opacity: d.estimated ? 0.45 : 0.85,
            borderRadius: [3, 3, 0, 0],
            ...(d.estimated ? { borderColor: '#94a3b8', borderWidth: 1.5, borderType: 'dashed' as const } : {}),
          },
        })),
        barMaxWidth: isMobile ? 40 : 55,
        /* Valeur affichée au sommet de chaque barre */
        label: {
          show: !isMobile,
          position: 'top',
          color: '#94a3b8',
          fontSize: 10,
          formatter: (params: { dataIndex: number }) => {
            const d = sortedData[params.dataIndex];
            return formatEuroCompact(d.dettes_financieres);
          },
        },
      },
    ],
    animation: true,
    animationDuration: isMobile ? 400 : 600,
    animationEasing: 'cubicOut',
  }), [sortedData, years, isMobile, DEBT_COLOR]);

  return (
    <div className="w-full">
      <ReactECharts
        option={option}
        style={{ height: `${height}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      {hasEstimated && (
        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-slate-500" />
          * Estimation : encours 2024 (bilan audité) + emprunts − remboursements (budget voté)
        </p>
      )}
    </div>
  );
}
