'use client';

/**
 * Page Prévision — Voté vs Exécuté
 *
 * Objectif: Évaluer la fiabilité des prévisions budgétaires sur 6 années
 * (2019-2024) et contextualiser les budgets 2025-2026 avant les municipales.
 *
 * Sections:
 * 1. KPI Cards (taux global, fonctionnement, investissement — dernière année)
 * 2. Vote vs Execute Bar Chart (comparaison years only, chronological)
 * 3. Execution Rate Line Chart (taux par section, with COVID markers)
 * 4. Ecart Ranking (horizontal bars, outliers capped, small posts filtered)
 *
 * Source: vote_vs_execute.json (exporté depuis mart_vote_vs_execute)
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Helpers
// =============================================================================

/** COVID years for visual markers on charts */
const COVID_YEARS = [2020, 2021];

/**
 * Sort rates chronologically (2019 → 2026) and filter to comparison only
 */
function comparisonRates(rates: GlobalRate[]): GlobalRate[] {
  return [...rates]
    .filter((r) => r.type === 'comparaison' && r.taux_global !== null)
    .sort((a, b) => a.annee - b.annee);
}

// =============================================================================
// KPI Cards
// =============================================================================

/**
 * Displays 3 key execution rate metrics from the latest comparison year
 */
function ExecutionRateCards({ rates }: { rates: GlobalRate[] }) {
  const comp = comparisonRates(rates);
  const latest = comp[comp.length - 1];
  if (!latest) return null;

  const cards = [
    {
      label: 'Taux global d\'exécution',
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
        <div
          key={card.label}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5"
        >
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

// =============================================================================
// Vote vs Execute Bar Chart (comparison years only, chronological)
// =============================================================================

/**
 * Grouped bar chart: Voté vs Exécuté by year.
 * Only shows years where both vote and execute exist.
 */
function VoteVsExecuteChart({
  rates,
  height = 350,
}: {
  rates: GlobalRate[];
  height?: number;
}) {
  const isMobile = useIsMobile();

  const option: EChartsOption = useMemo(() => {
    // Only comparison years, sorted chronologically
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
            seriesName: string;
            value: number | null;
            marker: string;
            axisValueLabel: string;
          }>;
          const year = items[0]?.axisValueLabel;
          const isCovid = COVID_YEARS.includes(Number(year));
          let html = `<strong>${year}</strong>${isCovid ? ' <span style="color:#fbbf24">(COVID)</span>' : ''}<br/>`;
          for (const item of items) {
            if (item.value !== null && item.value !== undefined) {
              html += `${item.marker} ${item.seriesName}: <strong>${formatEuroCompact(item.value)}</strong><br/>`;
            }
          }
          // Add execution rate
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
      grid: {
        left: isMobile ? 10 : 20,
        right: 20,
        top: 40,
        bottom: 30,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: {
          color: '#94a3b8',
          formatter: (v: string) =>
            COVID_YEARS.includes(Number(v)) ? `${v}*` : v,
        },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#94a3b8',
          formatter: (v: number) => formatEuroCompact(v),
        },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      series: [
        {
          name: 'Budget Voté (BP)',
          type: 'bar',
          data: comp.map((r) => r.depenses_vote),
          itemStyle: { color: '#fb923c', borderRadius: [4, 4, 0, 0] },
          barGap: '10%',
          barMaxWidth: 40,
        },
        {
          name: 'Budget Exécuté (CA)',
          type: 'bar',
          data: comp.map((r) => r.depenses_execute),
          itemStyle: { color: '#60a5fa', borderRadius: [4, 4, 0, 0] },
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
        <span className="text-orange-400">Orange</span> = budget voté (BP) ·{' '}
        <span className="text-blue-400">Bleu</span> = budget exécuté (CA).
        * = années COVID.
      </p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

// =============================================================================
// Execution Rate Line Chart (with COVID markers)
// =============================================================================

/**
 * Line chart showing execution rates by section across comparison years
 */
function ExecutionRateChart({
  rates,
  height = 350,
}: {
  rates: GlobalRate[];
  height?: number;
}) {
  const isMobile = useIsMobile();

  const option: EChartsOption = useMemo(() => {
    const comp = comparisonRates(rates);
    const years = comp.map((r) => String(r.annee));

    // COVID markArea zones
    const covidZones = COVID_YEARS.filter((y) =>
      comp.some((r) => r.annee === y),
    ).map((y) => [
      { xAxis: String(y), itemStyle: { color: 'rgba(251, 191, 36, 0.06)' } },
      { xAxis: String(y) },
    ]);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: number | null;
            marker: string;
            axisValueLabel: string;
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
      grid: {
        left: isMobile ? 45 : 55,
        right: 20,
        top: 40,
        bottom: 30,
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: {
          color: '#94a3b8',
          formatter: (v: string) =>
            COVID_YEARS.includes(Number(v)) ? `${v}*` : v,
        },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        min: 65,
        max: 105,
        axisLabel: {
          color: '#94a3b8',
          formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      series: [
        {
          name: 'Global',
          type: 'line',
          data: comp.map((r) => r.taux_global),
          lineStyle: { color: '#60a5fa', width: 3 },
          itemStyle: { color: '#60a5fa' },
          symbolSize: isMobile ? 10 : 8,
          markLine: {
            silent: true,
            data: [{ yAxis: 100 }],
            lineStyle: { color: '#475569', type: 'solid', width: 1 },
            label: {
              formatter: '100%',
              color: '#64748b',
              fontSize: 10,
            },
          },
          // COVID markers
          ...(covidZones.length > 0
            ? { markArea: { silent: true, data: covidZones } }
            : {}),
        },
        {
          name: 'Fonctionnement',
          type: 'line',
          data: comp.map((r) => r.taux_fonct),
          lineStyle: { color: '#34d399', width: 2, type: 'dashed' },
          itemStyle: { color: '#34d399' },
          symbolSize: isMobile ? 10 : 8,
        },
        {
          name: 'Investissement',
          type: 'line',
          data: comp.map((r) => r.taux_inves),
          lineStyle: { color: '#fbbf24', width: 2, type: 'dashed' },
          itemStyle: { color: '#fbbf24' },
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
        structurellement sous-exécuté (projets pluriannuels).
        * = années COVID.
      </p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

// =============================================================================
// Ecart Ranking (Horizontal Bars — outliers capped, small posts filtered)
// =============================================================================

/** Minimum total vote (6 years) to appear in the ranking */
const MIN_VOTE_TOTAL = 50_000_000;

/** Max absolute ecart % to display (cap outliers) */
const MAX_ECART_DISPLAY = 60;

/**
 * Horizontal bar chart ranking thematiques by average execution gap.
 * Filters out tiny posts and caps outliers for readability.
 */
function EcartRanking({ ranking }: { ranking: EcartRow[] }) {
  const isMobile = useIsMobile();

  const depenseRanking = useMemo(() => {
    return ranking
      .filter((r) => r.sens_flux === 'Dépense')
      .filter((r) => r.vote_total >= MIN_VOTE_TOTAL)
      .slice(0, 15);
  }, [ranking]);

  const option: EChartsOption = useMemo(() => {
    const sorted = [...depenseRanking].sort(
      (a, b) => a.ecart_moyen_pct - b.ecart_moyen_pct,
    );
    const labels = sorted.map((r) => `${r.thematique} (${r.section.slice(0, 5)})`);
    // Cap display values for readability
    const displayValues = sorted.map((r) =>
      Math.max(-MAX_ECART_DISPLAY, Math.min(MAX_ECART_DISPLAY, r.ecart_moyen_pct)),
    );
    const rawValues = sorted.map((r) => r.ecart_moyen_pct);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; dataIndex: number }>;
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
      grid: {
        left: isMobile ? 130 : 200,
        right: 50,
        top: 10,
        bottom: 30,
      },
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
      series: [
        {
          type: 'bar',
          data: displayValues.map((v, i) => ({
            value: v,
            itemStyle: {
              color: rawValues[i] > 0 ? '#f87171' : '#34d399',
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
        },
      ],
    };
  }, [depenseRanking, isMobile]);

  const chartHeight = Math.max(300, depenseRanking.length * 28 + 60);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        Écart moyen Voté → Exécuté par poste
      </h3>
      <p className="text-xs text-slate-400 mb-4">
        <span className="text-red-400">Rouge</span> = sur-exécuté (dépense
        plus que prévu) ·{' '}
        <span className="text-emerald-400">Vert</span> = sous-exécuté.
        Moyenne 2019-2024 (dépenses &gt; 50 M€).
      </p>
      <ReactECharts option={option} style={{ height: chartHeight }} notMerge />
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function PrevisionPage() {
  const [data, setData] = useState<VoteExecuteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load data from static JSON */
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/data/vote_vs_execute.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Rates sorted chronologically for cards (latest = last)
  const chronoRates = useMemo(
    () => [...(data?.global_rates ?? [])].sort((a, b) => a.annee - b.annee),
    [data],
  );

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chargement des données...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Erreur de chargement</p>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </main>
    );
  }

  const compYears = data.coverage.comparison_years;
  const forecastOnly = data.coverage.forecast_years.filter(
    (y) => !compYears.includes(y),
  );

  return (
    <main className="min-h-screen">
      {/* Header */}
      <section className="border-b border-slate-800 bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-3xl">🎯</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
                Prévision budgétaire
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Le budget voté est-il réellement exécuté ? Comparaison sur 6 ans
                entre le Budget Primitif (BP) et le Compte Administratif (CA).
              </p>
            </div>
          </div>

          {/* Coverage badges */}
          <div className="flex flex-wrap gap-2 text-xs">
            {compYears.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Comparaison : {compYears[0]}-{compYears[compYears.length - 1]}
              </span>
            )}
            {forecastOnly.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/15 text-orange-400 border border-orange-500/20 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                Prévisionnel : {forecastOnly.join(', ')}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
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
          <h4 className="text-sm font-semibold text-slate-300 mb-2">
            Méthodologie et périmètre
          </h4>
          <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
            <p>
              <strong className="text-slate-300">Source Budget Voté :</strong>{' '}
              Extraction automatisée des PDFs Éditique BG (Budget Général) publiés
              par la Ville de Paris (2020-2026) + CSV Open Data (2019). Chapitres
              fonctionnels ventilés (900-908, 930-938) et non ventilés (92x, 94x).
            </p>
            <p>
              <strong className="text-slate-300">Source Budget Exécuté :</strong>{' '}
              Comptes Administratifs publiés sur{' '}
              <a
                href="https://opendata.paris.fr/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Open Data Paris
              </a>
              , filtrés sur les opérations réelles (2019-2024).
            </p>
            <p>
              <strong className="text-slate-300">Périmètre :</strong>{' '}
              {data.coverage.note_perimeter}
            </p>
            <p>
              <strong className="text-slate-300">Années COVID :</strong>{' '}
              2020-2021 montrent une sous-exécution plus marquée, notamment en
              investissement (gel de projets, retards de chantiers).
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
