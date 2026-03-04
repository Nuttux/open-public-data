'use client';

/**
 * BudgetExecutionSection — Section "Exécution budgétaire" intégrée au tab Tendances.
 *
 * Charge /data/vote_vs_execute.json et affiche :
 * - ExecutionRateCards : 3 KPIs (taux global, fonctionnement, investissement)
 * - ExecutionRateChart : Line chart taux d'exécution par section (+ COVID markers)
 * - EcartRanking : Horizontal bar chart écarts moyens par thématique
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GlobalRate {
  annee: number;
  type: 'comparaison' | 'previsionnel';
  depenses_vote: number;
  depenses_execute: number | null;
  taux_global: number | null;
  vote_fonct: number;
  execute_fonct: number | null;
  taux_fonct: number | null;
  vote_inves: number;
  execute_inves: number | null;
  taux_inves: number | null;
}

interface EcartRow {
  thematique: string;
  section: string;
  sens_flux: string;
  ecart_moyen_pct: number;
  vote_total: number;
  execute_total: number;
  taux_execution: number | null;
  nb_annees: number;
}

interface VoteExecuteData {
  generated_at: string;
  coverage: {
    comparison_years: number[];
    forecast_years: number[];
    note_perimeter: string;
  };
  global_rates: GlobalRate[];
  ecart_ranking: EcartRow[];
  estimation_summary: Record<string, unknown>;
  detail_thematique: unknown[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COVID_YEARS = [2020, 2021];
const MIN_VOTE_TOTAL = 50_000_000;
const MAX_ECART_DISPLAY = 60;

function comparisonRates(rates: GlobalRate[]): GlobalRate[] {
  return [...rates]
    .filter((r) => r.type === 'comparaison' && r.taux_global !== null)
    .sort((a, b) => a.annee - b.annee);
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function ExecutionRateCards({ rates }: { rates: GlobalRate[] }) {
  const comp = comparisonRates(rates);
  const latest = comp[comp.length - 1];
  if (!latest) return null;

  const cards = [
    {
      label: "Taux global d'exécution",
      value: latest.taux_global,
      sub: `${latest.annee} — Part du budget prévu réellement dépensée`,
      color: 'text-blue-600',
    },
    {
      label: 'Dépenses courantes',
      value: latest.taux_fonct,
      sub: `${formatEuroCompact(latest.execute_fonct || 0)} dépensé / ${formatEuroCompact(latest.vote_fonct)} prévu`,
      color: 'text-emerald-600',
    },
    {
      label: 'Grands projets',
      value: latest.taux_inves,
      sub: `${formatEuroCompact(latest.execute_inves || 0)} dépensé / ${formatEuroCompact(latest.vote_inves)} prévu`,
      color: 'text-amber-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1 font-medium">{card.label}</p>
          <p className={`text-3xl font-bold ${card.color}`}>
            {card.value !== null ? `${card.value.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Execution Rate Line Chart ───────────────────────────────────────────────

function ExecutionRateChart({ rates, height = 350 }: { rates: GlobalRate[]; height?: number }) {
  const isMobile = useIsMobile();

  const option: EChartsOption = useMemo(() => {
    const comp = comparisonRates(rates);
    const years = comp.map((r) => String(r.annee));

    const covidZones = COVID_YEARS
      .filter((y) => comp.some((r) => r.annee === y))
      .map((y) => [
        { xAxis: String(y), itemStyle: { color: 'rgba(251, 191, 36, 0.06)' } },
        { xAxis: String(y) },
      ] as [{ xAxis: string; itemStyle: { color: string } }, { xAxis: string }]);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#f1f5f9',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string; value: number | null; marker: string; axisValueLabel: string;
          }>;
          const year = items[0]?.axisValueLabel;
          const isCovid = COVID_YEARS.includes(Number(year));
          let html = `<strong>${year}</strong>${isCovid ? ' <span style="color:#fbbf24">(COVID)</span>' : ''}<br/>`;
          for (const item of items) {
            if (item.value !== null && item.value !== undefined) {
              html += `${item.marker} ${item.seriesName}: <strong>${item.value.toFixed(1)}%</strong><br/>`;
            }
          }
          return html;
        },
      },
      legend: {
        data: ['Global', 'Courant', 'Grands projets'],
        top: 0,
        textStyle: { color: '#64748b', fontSize: isMobile ? 10 : 12 },
      },
      grid: { left: isMobile ? 45 : 55, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: {
          color: '#64748b',
          formatter: (v: string) => COVID_YEARS.includes(Number(v)) ? `${v}*` : v,
        },
        axisLine: { lineStyle: { color: '#0f172a' } },
      },
      yAxis: {
        type: 'value',
        min: 65,
        max: 105,
        axisLabel: { color: '#64748b', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#ffffff' } },
      },
      series: [
        {
          name: 'Global', type: 'line',
          data: comp.map((r) => r.taux_global),
          lineStyle: { color: PALETTE.blue, width: 3 },
          itemStyle: { color: PALETTE.blue },
          symbolSize: isMobile ? 10 : 8,
          markLine: {
            silent: true,
            data: [{ yAxis: 100 }],
            lineStyle: { color: '#cbd5e1', type: 'solid', width: 1 },
            label: { formatter: '100%', color: '#64748b', fontSize: 10 },
          },
          ...(covidZones.length > 0 ? { markArea: { silent: true, data: covidZones } } : {}),
        },
        {
          name: 'Courant', type: 'line',
          data: comp.map((r) => r.taux_fonct),
          lineStyle: { color: PALETTE.emerald, width: 2, type: 'dashed' },
          itemStyle: { color: PALETTE.emerald },
          symbolSize: isMobile ? 10 : 8,
        },
        {
          name: 'Grands projets', type: 'line',
          data: comp.map((r) => r.taux_inves),
          lineStyle: { color: PALETTE.amber, width: 2, type: 'dashed' },
          itemStyle: { color: PALETTE.amber },
          symbolSize: isMobile ? 10 : 8,
        },
      ],
    };
  }, [rates, isMobile]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        Taux d&apos;exécution par année
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        100% = tout le budget prévu a été dépensé. Les grands projets sont souvent
        en dessous car ils s&apos;étalent sur plusieurs années. * = année COVID.
      </p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

// ─── Ecart Ranking ───────────────────────────────────────────────────────────

function EcartRanking({ ranking }: { ranking: EcartRow[] }) {
  const isMobile = useIsMobile();

  const depenseRanking = useMemo(() => {
    return ranking
      .filter((r) => r.sens_flux === 'Dépense')
      .filter((r) => r.vote_total >= MIN_VOTE_TOTAL)
      .slice(0, 15);
  }, [ranking]);

  const option: EChartsOption = useMemo(() => {
    const sorted = [...depenseRanking].sort((a, b) => a.ecart_moyen_pct - b.ecart_moyen_pct);
    const labels = sorted.map((r) => `${r.thematique} (${r.section.slice(0, 5)})`);
    const rawValues = sorted.map((r) => r.ecart_moyen_pct);
    const displayValues = sorted.map((r) =>
      Math.max(-MAX_ECART_DISPLAY, Math.min(MAX_ECART_DISPLAY, r.ecart_moyen_pct)),
    );

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#f1f5f9',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ dataIndex: number }>;
          const idx = items[0]?.dataIndex;
          const row = sorted[idx];
          if (!row) return '';
          const status = row.ecart_moyen_pct > 0 ? 'Sur-exécuté' : 'Sous-exécuté';
          return (
            `<strong>${row.thematique}</strong> (${row.section})<br/>` +
            `${status}: <strong>${row.ecart_moyen_pct > 0 ? '+' : ''}${row.ecart_moyen_pct.toFixed(1)}%</strong><br/>` +
            `Voté moy: ${formatEuroCompact(row.vote_total / row.nb_annees)} → ` +
            `Exécuté moy: ${formatEuroCompact(row.execute_total / row.nb_annees)}`
          );
        },
      },
      grid: { left: isMobile ? 130 : 200, right: 50, top: 10, bottom: 30 },
      xAxis: {
        type: 'value',
        min: -MAX_ECART_DISPLAY,
        max: MAX_ECART_DISPLAY,
        axisLabel: {
          color: '#64748b',
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`,
        },
        splitLine: { lineStyle: { color: '#ffffff' } },
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          color: '#64748b',
          fontSize: isMobile ? 9 : 11,
          width: isMobile ? 120 : 190,
          overflow: 'truncate',
        },
      },
      series: [{
        type: 'bar',
        data: displayValues.map((v, i) => ({
          value: v,
          itemStyle: {
            color: rawValues[i] > 0 ? PALETTE.red : PALETTE.emerald,
            borderRadius: rawValues[i] > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        barMaxWidth: 18,
        label: {
          show: !isMobile,
          position: 'right',
          formatter: (p: unknown) => {
            const idx = (p as { dataIndex: number }).dataIndex;
            const raw = rawValues[idx];
            return `${raw > 0 ? '+' : ''}${raw.toFixed(1)}%`;
          },
          color: '#64748b',
          fontSize: 10,
        },
      }],
    };
  }, [depenseRanking, isMobile]);

  const chartHeight = Math.max(300, depenseRanking.length * 28 + 60);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        Écart moyen entre prévu et réel par poste
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        <span className="text-red-600">Rouge</span> = dépensé plus que prévu ·{' '}
        <span className="text-emerald-600">Vert</span> = dépensé moins que prévu.
        Moyenne 2019-2024, postes &gt; 50 M€.
      </p>
      <ReactECharts option={option} style={{ height: chartHeight }} notMerge />
    </div>
  );
}

// ─── Main Section Component ──────────────────────────────────────────────────

export default function BudgetExecutionSection() {
  const [data, setData] = useState<VoteExecuteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/data/vote_vs_execute.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setData(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const chronoRates = useMemo(
    () => [...(data?.global_rates ?? [])].sort((a, b) => a.annee - b.annee),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Chargement exécution budgétaire...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500 text-sm">Données d&apos;exécution budgétaire non disponibles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ExecutionRateCards rates={chronoRates} />
      <ExecutionRateChart rates={chronoRates} />
      <EcartRanking ranking={data.ecart_ranking} />
    </div>
  );
}
