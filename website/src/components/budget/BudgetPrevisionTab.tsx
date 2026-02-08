'use client';

/**
 * BudgetPrevisionTab — Tab "Voté vs Exécuté" de la page /budget.
 *
 * Contenu : ExecutionRateCards, VoteVsExecuteChart, ExecutionRateChart,
 *           EcartRanking + note méthodologique.
 *
 * Objectif : évaluer la fiabilité des prévisions budgétaires sur 6 ans
 * (2019-2024) et contextualiser les budgets 2025-2026.
 *
 * Fixes appliqués :
 * - Axe X chronologique (2019 → 2024, gauche à droite)
 * - Bar chart : uniquement les années de comparaison (pas 2025-2026)
 * - COVID 2020-2021 marqué visuellement
 * - Ecart ranking : outliers cappés, petits postes filtrés
 * - Suppression des tableaux confus (estimation, détail thématique)
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

/** COVID years for visual markers */
const COVID_YEARS = [2020, 2021];

/** Min total vote to appear in ecart ranking (filters noise) */
const MIN_VOTE_TOTAL = 50_000_000;

/** Max absolute ecart % to display on axis (caps outliers visually) */
const MAX_ECART_DISPLAY = 60;

/**
 * Filter to comparison years only, sorted chronologically (2019 → 2024)
 */
function comparisonRates(rates: GlobalRate[]): GlobalRate[] {
  return [...rates]
    .filter((r) => r.type === 'comparaison' && r.taux_global !== null)
    .sort((a, b) => a.annee - b.annee);
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

/** 3 KPI cards showing execution rates for the latest comparison year */
function ExecutionRateCards({ rates }: { rates: GlobalRate[] }) {
  const comp = comparisonRates(rates);
  const latest = comp[comp.length - 1];
  if (!latest) return null;

  const cards = [
    {
      label: "Taux global d'exécution",
      value: latest.taux_global,
      sub: `${latest.annee} — Toutes dépenses`,
      color: 'text-blue-400',
    },
    {
      label: 'Fonctionnement',
      value: latest.taux_fonct,
      sub: `${formatEuroCompact(latest.execute_fonct || 0)} exécuté / ${formatEuroCompact(latest.vote_fonct)} voté`,
      color: 'text-emerald-400',
    },
    {
      label: 'Investissement',
      value: latest.taux_inves,
      sub: `${formatEuroCompact(latest.execute_inves || 0)} exécuté / ${formatEuroCompact(latest.vote_inves)} voté`,
      color: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1 font-medium">{card.label}</p>
          <p className={`text-3xl font-bold ${card.color}`}>
            {card.value !== null ? `${card.value.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Vote vs Execute Bar Chart (comparison years only, chronological) ────────

/** Grouped bar chart: Voté vs Exécuté. Only comparison years. */
function VoteVsExecuteChart({ rates, height = 350 }: { rates: GlobalRate[]; height?: number }) {
  const isMobile = useIsMobile();

  const option: EChartsOption = useMemo(() => {
    const comp = comparisonRates(rates);
    const years = comp.map((r) => String(r.annee));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string; value: number | null; marker: string; axisValueLabel: string;
          }>;
          const year = items[0]?.axisValueLabel;
          const isCovid = COVID_YEARS.includes(Number(year));
          let html = `<strong>${year}</strong>${isCovid ? ' <span style="color:#fbbf24">(COVID)</span>' : ''}<br/>`;
          for (const item of items) {
            if (item.value !== null && item.value !== undefined) {
              html += `${item.marker} ${item.seriesName}: <strong>${formatEuroCompact(item.value)}</strong><br/>`;
            }
          }
          const r = comp.find((x) => String(x.annee) === year);
          if (r?.taux_global) {
            html += `<br/>Taux d'exécution: <strong>${r.taux_global.toFixed(1)}%</strong>`;
          }
          return html;
        },
      },
      legend: {
        data: ['Budget Voté (BP)', 'Budget Exécuté (CA)'],
        top: 0,
        textStyle: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 },
      },
      grid: { left: isMobile ? 10 : 20, right: 20, top: 40, bottom: 30, containLabel: true },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: {
          color: '#94a3b8',
          formatter: (v: string) => COVID_YEARS.includes(Number(v)) ? `${v}*` : v,
        },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#94a3b8', formatter: (v: number) => formatEuroCompact(v) },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      series: [
        {
          name: 'Budget Voté (BP)', type: 'bar',
          data: comp.map((r) => r.depenses_vote),
          itemStyle: { color: PALETTE.orange, borderRadius: [4, 4, 0, 0] },
          barGap: '10%', barMaxWidth: 40,
        },
        {
          name: 'Budget Exécuté (CA)', type: 'bar',
          data: comp.map((r) => r.depenses_execute),
          itemStyle: { color: PALETTE.blue, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 40,
        },
      ],
    };
  }, [rates, isMobile]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        Voté vs Exécuté — Dépenses totales
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        <span className="text-orange-400">■ Orange</span> = budget voté (BP) ·{' '}
        <span className="text-blue-400">■ Bleu</span> = budget exécuté (CA). * = années COVID.
      </p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

// ─── Execution Rate Line Chart (with COVID markers) ──────────────────────────

/** Line chart: execution rates by section across comparison years */
function ExecutionRateChart({ rates, height = 350 }: { rates: GlobalRate[]; height?: number }) {
  const isMobile = useIsMobile();

  const option: EChartsOption = useMemo(() => {
    const comp = comparisonRates(rates);
    const years = comp.map((r) => String(r.annee));

    // COVID highlight zones (tuple assertion needed for ECharts MarkArea2DDataItemOption)
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
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
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
        data: ['Global', 'Fonctionnement', 'Investissement'],
        top: 0,
        textStyle: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 },
      },
      grid: { left: isMobile ? 45 : 55, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: {
          color: '#94a3b8',
          formatter: (v: string) => COVID_YEARS.includes(Number(v)) ? `${v}*` : v,
        },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        min: 65,
        max: 105,
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#1e293b' } },
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
            lineStyle: { color: '#475569', type: 'solid', width: 1 },
            label: { formatter: '100%', color: '#64748b', fontSize: 10 },
          },
          ...(covidZones.length > 0 ? { markArea: { silent: true, data: covidZones } } : {}),
        },
        {
          name: 'Fonctionnement', type: 'line',
          data: comp.map((r) => r.taux_fonct),
          lineStyle: { color: PALETTE.emerald, width: 2, type: 'dashed' },
          itemStyle: { color: PALETTE.emerald },
          symbolSize: isMobile ? 10 : 8,
        },
        {
          name: 'Investissement', type: 'line',
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
      <p className="text-xs text-slate-400 mb-4">
        100% = budget intégralement exécuté. L&apos;investissement est
        structurellement sous-exécuté (projets pluriannuels). * = COVID.
      </p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

// ─── Ecart Ranking (outliers capped, small posts filtered) ───────────────────

/** Horizontal bar chart: écart moyen voté → exécuté par thématique */
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
    // Cap display values so outliers don't crush the chart
    const displayValues = sorted.map((r) =>
      Math.max(-MAX_ECART_DISPLAY, Math.min(MAX_ECART_DISPLAY, r.ecart_moyen_pct)),
    );

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
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
          color: '#94a3b8',
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`,
        },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          color: '#94a3b8',
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
          color: '#94a3b8',
          fontSize: 10,
        },
      }],
    };
  }, [depenseRanking, isMobile]);

  const chartHeight = Math.max(300, depenseRanking.length * 28 + 60);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        Écart moyen Voté → Exécuté par poste
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        <span className="text-red-400">Rouge</span> = sur-exécuté (dépensé plus que prévu) ·{' '}
        <span className="text-emerald-400">Vert</span> = sous-exécuté.
        Moyenne 2019-2024, dépenses &gt; 50 M€.
      </p>
      <ReactECharts option={option} style={{ height: chartHeight }} notMerge />
    </div>
  );
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function BudgetPrevisionTab() {
  const [data, setData] = useState<VoteExecuteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load vote_vs_execute.json */
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

  // Chronological rates for all charts
  const chronoRates = useMemo(
    () => [...(data?.global_rates ?? [])].sort((a, b) => a.annee - b.annee),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-red-400 mb-2">Erreur de chargement</p>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <ExecutionRateCards rates={chronoRates} />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <VoteVsExecuteChart rates={chronoRates} />
        <ExecutionRateChart rates={chronoRates} />
      </div>

      {/* Ecart Ranking */}
      <EcartRanking ranking={data.ecart_ranking} />

      {/* Methodology note */}
      <div className="bg-slate-900/60 border border-slate-700/30 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">Méthodologie et périmètre</h4>
        <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-slate-300">Source Budget Voté :</strong>{' '}
            Extraction automatisée des PDFs Éditique BG (2020-2026) + CSV Open Data (2019).
          </p>
          <p>
            <strong className="text-slate-300">Source Budget Exécuté :</strong>{' '}
            Comptes Administratifs{' '}
            <a href="https://opendata.paris.fr/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Open Data Paris</a>{' '}
            (2019-2024).
          </p>
          <p>
            <strong className="text-slate-300">Années COVID :</strong>{' '}
            2020-2021 montrent une sous-exécution plus marquée, notamment en investissement (gel de projets).
          </p>
        </div>
      </div>
    </div>
  );
}
