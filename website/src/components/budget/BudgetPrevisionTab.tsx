'use client';

/**
 * BudgetPrevisionTab — Tab "Prévision" de la page /budget.
 *
 * Contenu : ExecutionRateCards, VoteVsExecuteChart, ExecutionRateChart,
 *           EcartRanking, EstimationSummary, DetailThematiqueTable.
 * Migré depuis l'ancien /prevision/page.tsx.
 *
 * Objectif : évaluer la fiabilité des prévisions budgétaires et
 * estimer les dépenses réelles 2025-2026.
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
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

interface EstimationSummaryYear {
  annee: number;
  total_vote: number;
  total_estime: number;
  taux_global_estime: number | null;
  sections: Record<string, {
    vote: number;
    estime: number;
    taux_estime: number | null;
    nb_postes: number;
  }>;
}

interface DetailThematique {
  thematique: string;
  vote_moyen: number;
  execute_moyen: number;
  taux_execution: number | null;
  ecart_moyen: number;
  annees_comparees: number[];
  par_annee: Array<{ annee: number; vote: number; execute: number }>;
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
  estimation_summary: Record<string, EstimationSummaryYear>;
  detail_thematique: DetailThematique[];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** 3 KPI cards for execution rates */
function ExecutionRateCards({ rates }: { rates: GlobalRate[] }) {
  const latest = rates.find(r => r.type === 'comparaison' && r.taux_global !== null);
  if (!latest) return null;

  const cards = [
    { label: "Taux global d'exécution", value: latest.taux_global, sub: `${latest.annee} — Dépenses ventilées`, color: 'blue' },
    { label: 'Fonctionnement', value: latest.taux_fonct, sub: `${formatEuroCompact(latest.execute_fonct || 0)} exécuté / ${formatEuroCompact(latest.vote_fonct)} voté`, color: 'emerald' },
    { label: 'Investissement', value: latest.taux_inves, sub: `${formatEuroCompact(latest.execute_inves || 0)} exécuté / ${formatEuroCompact(latest.vote_inves)} voté`, color: 'amber' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1 font-medium">{card.label}</p>
          <p className={`text-3xl font-bold text-${card.color}-400`}>
            {card.value !== null ? `${card.value.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

/** Line chart: execution rates by section across years */
function ExecutionRateChart({ rates, height = 350 }: { rates: GlobalRate[]; height?: number }) {
  const isMobile = useIsMobile();

  const option: EChartsOption = useMemo(() => {
    const compRates = rates.filter(r => r.taux_global !== null);
    const years = compRates.map(r => String(r.annee));
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ seriesName: string; value: number | null; marker: string; axisValueLabel: string }>;
          let html = `<strong>${items[0]?.axisValueLabel}</strong><br/>`;
          for (const item of items) {
            if (item.value !== null && item.value !== undefined) {
              html += `${item.marker} ${item.seriesName}: <strong>${item.value.toFixed(1)}%</strong><br/>`;
            }
          }
          return html;
        },
      },
      legend: { data: ['Global', 'Fonctionnement', 'Investissement'], top: 0, textStyle: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 } },
      grid: { left: isMobile ? 45 : 55, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', min: 80, max: 120, axisLabel: { color: '#94a3b8', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [
        { name: 'Global', type: 'line', data: compRates.map(r => r.taux_global), lineStyle: { color: '#60a5fa', width: 3 }, itemStyle: { color: '#60a5fa' }, symbolSize: isMobile ? 10 : 8, markLine: { silent: true, data: [{ yAxis: 100 }], lineStyle: { color: '#475569', type: 'solid', width: 1 }, label: { formatter: '100%', color: '#64748b', fontSize: 10 } } },
        { name: 'Fonctionnement', type: 'line', data: compRates.map(r => r.taux_fonct), lineStyle: { color: '#34d399', width: 2, type: 'dashed' }, itemStyle: { color: '#34d399' }, symbolSize: isMobile ? 10 : 8 },
        { name: 'Investissement', type: 'line', data: compRates.map(r => r.taux_inves), lineStyle: { color: '#fbbf24', width: 2, type: 'dashed' }, itemStyle: { color: '#fbbf24' }, symbolSize: isMobile ? 10 : 8 },
      ],
    };
  }, [rates, isMobile]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">Taux d&apos;exécution par année</h3>
      <p className="text-xs text-slate-400 mb-4">100% = le budget voté est intégralement exécuté. Au-dessus = sur-exécution.</p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

/** Horizontal bar chart: écart voté → exécuté by post */
function EcartRanking({ ranking }: { ranking: EcartRow[] }) {
  const isMobile = useIsMobile();
  const depenseRanking = useMemo(() => ranking.filter(r => r.sens_flux === 'Dépense').slice(0, 15), [ranking]);

  const option: EChartsOption = useMemo(() => {
    const sorted = [...depenseRanking].sort((a, b) => a.ecart_moyen_pct - b.ecart_moyen_pct);
    const labels = sorted.map(r => `${r.thematique} (${r.section.slice(0, 5)})`);
    const values = sorted.map(r => r.ecart_moyen_pct);
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number }>;
          const item = items[0];
          const row = sorted.find(r => `${r.thematique} (${r.section.slice(0, 5)})` === item.name);
          if (!row) return '';
          const status = row.ecart_moyen_pct > 0 ? 'Sur-exécuté' : 'Sous-exécuté';
          return `<strong>${row.thematique}</strong> (${row.section})<br/>${status}: <strong>${row.ecart_moyen_pct > 0 ? '+' : ''}${row.ecart_moyen_pct.toFixed(1)}%</strong><br/>Voté: ${formatEuroCompact(row.vote_total)} → Exécuté: ${formatEuroCompact(row.execute_total)}`;
        },
      },
      grid: { left: isMobile ? 130 : 200, right: 30, top: 10, bottom: 30 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%` }, splitLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8', fontSize: isMobile ? 9 : 11, width: isMobile ? 120 : 190, overflow: 'truncate' } },
      series: [{
        type: 'bar',
        data: values.map(v => ({ value: v, itemStyle: { color: v > 0 ? '#f87171' : '#34d399', borderRadius: v > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
        barMaxWidth: 18,
        label: { show: !isMobile, position: 'right', formatter: (p: unknown) => { const val = (p as { value: number }).value; return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`; }, color: '#94a3b8', fontSize: 10 },
      }],
    };
  }, [depenseRanking, isMobile]);

  const chartHeight = Math.max(300, depenseRanking.length * 28 + 60);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">Écart Voté → Exécuté par poste</h3>
      <p className="text-xs text-slate-400 mb-4">
        <span className="text-red-400">Rouge</span> = dépense plus que voté (sur-exécuté) · <span className="text-emerald-400">Vert</span> = dépense moins que voté (sous-exécuté). Moyenne sur les années comparables.
      </p>
      <ReactECharts option={option} style={{ height: chartHeight }} notMerge />
    </div>
  );
}

/** Grouped bar chart: Voté vs Exécuté by year */
function VoteVsExecuteChart({ rates, height = 300 }: { rates: GlobalRate[]; height?: number }) {
  const isMobile = useIsMobile();
  const option: EChartsOption = useMemo(() => {
    const years = rates.map(r => String(r.annee));
    return {
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ seriesName: string; value: number | null; marker: string; axisValueLabel: string }>;
          let html = `<strong>${items[0]?.axisValueLabel}</strong><br/>`;
          for (const item of items) {
            if (item.value !== null && item.value !== undefined) html += `${item.marker} ${item.seriesName}: <strong>${formatEuroCompact(item.value)}</strong><br/>`;
          }
          return html;
        },
      },
      legend: { data: ['Budget Voté (BP)', 'Budget Exécuté (CA)'], top: 0, textStyle: { color: '#94a3b8', fontSize: isMobile ? 10 : 12 } },
      grid: { left: isMobile ? 10 : 20, right: 20, top: 40, bottom: 30, containLabel: true },
      xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', formatter: (v: number) => formatEuroCompact(v) }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [
        { name: 'Budget Voté (BP)', type: 'bar', data: rates.map(r => r.depenses_vote), itemStyle: { color: '#fb923c', borderRadius: [4, 4, 0, 0] }, barGap: '10%', barMaxWidth: 40 },
        { name: 'Budget Exécuté (CA)', type: 'bar', data: rates.map(r => r.depenses_execute), itemStyle: { color: '#60a5fa', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 40 },
      ],
    };
  }, [rates, isMobile]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">Voté vs Exécuté — Dépenses totales</h3>
      <p className="text-xs text-slate-400 mb-4">
        <span className="text-orange-400">Orange</span> = budget voté (BP) · <span className="text-blue-400">Bleu</span> = budget exécuté (CA). 2025-2026 n&apos;ont que le voté.
      </p>
      <ReactECharts option={option} style={{ height }} notMerge />
    </div>
  );
}

/** Table: estimation dépenses réelles 2025-2026 */
function EstimationSummary({ summary }: { summary: Record<string, EstimationSummaryYear> }) {
  const years = Object.values(summary).sort((a, b) => a.annee - b.annee);
  if (years.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">Estimation des dépenses réelles</h3>
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-4">
        <p className="text-xs text-amber-300">
          Ces estimations sont basées sur le taux d&apos;exécution moyen historique (2023-2024). Le budget voté est un plafond, pas une prédiction exacte.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 text-slate-400 font-medium">Année</th>
              <th className="text-left py-2 text-slate-400 font-medium">Section</th>
              <th className="text-right py-2 text-slate-400 font-medium"><span className="inline-flex items-center gap-1">Voté (BP)<span className="inline-block w-2 h-2 rounded-full bg-orange-400" /></span></th>
              <th className="text-right py-2 text-slate-400 font-medium"><span className="inline-flex items-center gap-1">Estimé<span className="inline-block w-2 h-2 rounded-full bg-slate-400" /></span></th>
              <th className="text-right py-2 text-slate-400 font-medium">Taux</th>
            </tr>
          </thead>
          <tbody>
            {years.map(year =>
              ['Fonctionnement', 'Investissement'].map((section, idx) => {
                const s = year.sections[section];
                if (!s) return null;
                return (
                  <tr key={`${year.annee}-${section}`} className="border-b border-slate-800/50">
                    {idx === 0 && <td rowSpan={2} className="py-2.5 text-slate-200 font-semibold align-top">{year.annee}</td>}
                    <td className="py-2.5 text-slate-300">{section}</td>
                    <td className="py-2.5 text-right text-orange-400 font-mono">{formatEuroCompact(s.vote)}</td>
                    <td className="py-2.5 text-right text-slate-300 font-mono">{s.estime > 0 ? formatEuroCompact(s.estime) : '—'}</td>
                    <td className="py-2.5 text-right text-slate-400">{s.taux_estime ? `${s.taux_estime}%` : '—'}</td>
                  </tr>
                );
              })
            )}
            {years.map(year => (
              <tr key={`total-${year.annee}`} className="border-t border-slate-600">
                <td className="py-2.5 text-slate-200 font-bold">{year.annee}</td>
                <td className="py-2.5 text-slate-200 font-bold">Total dépenses</td>
                <td className="py-2.5 text-right text-orange-400 font-mono font-bold">{formatEuroCompact(year.total_vote)}</td>
                <td className="py-2.5 text-right text-slate-200 font-mono font-bold">{year.total_estime > 0 ? formatEuroCompact(year.total_estime) : '—'}</td>
                <td className="py-2.5 text-right text-slate-300 font-bold">{year.taux_global_estime ? `${year.taux_global_estime}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SortField = 'thematique' | 'vote_moyen' | 'execute_moyen' | 'taux_execution' | 'ecart_moyen';

/** Sortable table: execution detail by thematique */
function DetailThematiqueTable({ data }: { data: DetailThematique[] }) {
  const [sortField, setSortField] = useState<SortField>('vote_moyen');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (typeof va === 'string' && typeof vb === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [data, sortField, sortAsc]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return <span className="text-slate-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortAsc ? '↑' : '↓'}</span>;
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">Détail par thématique (dépenses)</h3>
      <p className="text-xs text-slate-400 mb-4">Moyenne sur les années comparables (2023-2024). Cliquez sur une colonne pour trier.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none" onClick={() => toggleSort('thematique')}>Thématique{sortIcon('thematique')}</th>
              <th className="text-right py-2 text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none" onClick={() => toggleSort('vote_moyen')}>Voté moy.{sortIcon('vote_moyen')}</th>
              <th className="text-right py-2 text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none" onClick={() => toggleSort('execute_moyen')}>Exécuté moy.{sortIcon('execute_moyen')}</th>
              <th className="text-right py-2 text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none" onClick={() => toggleSort('taux_execution')}>Taux exec.{sortIcon('taux_execution')}</th>
              <th className="text-right py-2 text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none" onClick={() => toggleSort('ecart_moyen')}>Écart{sortIcon('ecart_moyen')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const taux = row.taux_execution;
              const tauxColor = taux === null ? 'text-slate-500' : taux > 105 ? 'text-red-400' : taux < 95 ? 'text-emerald-400' : 'text-slate-300';
              return (
                <tr key={row.thematique} className="border-b border-slate-800/50 hover:bg-slate-700/20 transition-colors">
                  <td className="py-2.5 text-slate-200 font-medium">{row.thematique}</td>
                  <td className="py-2.5 text-right text-orange-400 font-mono text-xs">{formatEuroCompact(row.vote_moyen)}</td>
                  <td className="py-2.5 text-right text-blue-400 font-mono text-xs">{formatEuroCompact(row.execute_moyen)}</td>
                  <td className={`py-2.5 text-right font-mono text-xs ${tauxColor}`}>{taux !== null ? `${taux.toFixed(1)}%` : '—'}</td>
                  <td className="py-2.5 text-right text-slate-400 font-mono text-xs">{row.ecart_moyen > 0 ? '+' : ''}{formatEuroCompact(row.ecart_moyen)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function BudgetPrevisionTab() {
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

  const sortedRates = useMemo(() => data?.global_rates?.sort((a, b) => b.annee - a.annee) ?? [], [data]);

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
      {/* Coverage badges */}
      <div className="flex flex-wrap gap-2 text-xs">
        {data.coverage.comparison_years.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Comparaison : {data.coverage.comparison_years.join(', ')}
          </span>
        )}
        {data.coverage.forecast_years.filter(y => !data.coverage.comparison_years.includes(y)).length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/15 text-orange-400 border border-orange-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            Prévisionnel : {data.coverage.forecast_years.filter(y => !data.coverage.comparison_years.includes(y)).join(', ')}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 text-slate-400 border border-slate-600/30 rounded-full">
          Opérations ventilées uniquement
        </span>
      </div>

      {/* KPI Cards */}
      <ExecutionRateCards rates={sortedRates} />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <VoteVsExecuteChart rates={data.global_rates} />
        <ExecutionRateChart rates={data.global_rates} />
      </div>

      {/* Ecart Ranking */}
      <EcartRanking ranking={data.ecart_ranking} />

      {/* Estimation Summary */}
      <EstimationSummary summary={data.estimation_summary} />

      {/* Detail Thematique Table */}
      <DetailThematiqueTable data={data.detail_thematique} />

      {/* Methodology note */}
      <div className="bg-slate-900/60 border border-slate-700/30 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">Méthodologie et périmètre</h4>
        <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
          <p><strong className="text-slate-300">Source Budget Voté :</strong> Extraction automatisée des PDFs Éditique BG publiés par la Ville de Paris.</p>
          <p><strong className="text-slate-300">Source Budget Exécuté :</strong> Comptes Administratifs publiés sur <a href="https://opendata.paris.fr/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Open Data Paris</a>.</p>
          <p><strong className="text-slate-300">Périmètre :</strong> {data.coverage.note_perimeter}</p>
          <p><strong className="text-slate-300">Estimations :</strong> Calculées en appliquant le taux d&apos;exécution moyen historique au montant voté.</p>
        </div>
      </div>
    </div>
  );
}
