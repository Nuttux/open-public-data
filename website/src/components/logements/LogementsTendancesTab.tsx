'use client';

/**
 * LogementsTendancesTab — Onglet "Tendances" de /logements.
 *
 * Un sélecteur de breakdown (Type / Bailleur / Arrondissement) pilote DEUX charts :
 *   1. Stacked bar chart : nb logements par année, ventilé par la dimension choisie
 *   2. Horizontal bar ranking : variation entre première et dernière année
 *
 * Même pattern UX que Travaux Tendances et Subventions Tendances.
 *
 * Source : /public/data/map/logements_sociaux.json
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { LogementSocial } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import YearRangeSelector from '@/components/YearRangeSelector';

// ─── Types ───────────────────────────────────────────────────────────────────

type BreakdownDim = 'type' | 'bailleur' | 'arrondissement';
interface BreakdownOption { id: BreakdownDim; label: string; icon: string; }

const BREAKDOWN_OPTIONS: BreakdownOption[] = [
  { id: 'type', label: 'Type', icon: '🏠' },
  { id: 'bailleur', label: 'Bailleur', icon: '🏢' },
  { id: 'arrondissement', label: 'Arrondissement', icon: '📍' },
];

// ─── Colors ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  'PLAI (très social)': PALETTE.blue,
  'PLUS (social)': PALETTE.cyan,
  'PLS (intermédiaire)': PALETTE.violet,
};

const ARR_COLORS = [
  PALETTE.emerald, PALETTE.blue, PALETTE.amber, PALETTE.purple, PALETTE.rose,
  PALETTE.cyan, PALETTE.orange, PALETTE.green, PALETTE.pink, PALETTE.red,
  PALETTE.teal, PALETTE.violet, PALETTE.sky, PALETTE.lime, PALETTE.yellow,
  PALETTE.slate, PALETTE.amber, PALETTE.blue, PALETTE.rose, PALETTE.emerald,
];

const BAILLEUR_COLORS = [
  PALETTE.emerald, PALETTE.blue, PALETTE.amber, PALETTE.purple, PALETTE.cyan,
  PALETTE.orange, PALETTE.green, PALETTE.pink, PALETTE.teal, PALETTE.red,
];

function getGroupColor(key: string, dim: BreakdownDim, idx: number): string {
  if (dim === 'type') return TYPE_COLORS[key] || PALETTE.gray;
  if (dim === 'arrondissement') return ARR_COLORS[idx % ARR_COLORS.length];
  return BAILLEUR_COLORS[idx % BAILLEUR_COLORS.length];
}

function arrLabel(code: number): string { return code === 0 ? 'Centre' : `${code}e`; }

// ─── Component ───────────────────────────────────────────────────────────────

interface LogementsTendancesTabProps { allLogements: LogementSocial[]; }

export default function LogementsTendancesTab({ allLogements }: LogementsTendancesTabProps) {
  const [startYear, setStartYear] = useState(2010);
  const [endYear, setEndYear] = useState(2024);
  const [breakdown, setBreakdown] = useState<BreakdownDim>('type');
  const isMobile = useIsMobile();

  /** All available years (sorted) */
  const allYears = useMemo(() => [...new Set(allLogements.map(l => l.annee))].sort((a, b) => a - b), [allLogements]);

  useEffect(() => { if (allYears.length >= 2) { setStartYear(allYears[0]); setEndYear(allYears[allYears.length - 1]); } }, [allYears]);

  const filteredLogements = useMemo(() => allLogements.filter(l => l.annee >= startYear && l.annee <= endYear), [allLogements, startYear, endYear]);
  const filteredYearsSet = useMemo(() => [...new Set(filteredLogements.map(l => l.annee))].sort((a, b) => a - b), [filteredLogements]);

  /** Get group key for a logement based on current breakdown */
  const getGroupKey = useMemo(() => {
    switch (breakdown) {
      case 'type': return (_l: LogementSocial, type: 'plai' | 'plus' | 'pls') => {
        if (type === 'plai') return 'PLAI (très social)';
        if (type === 'plus') return 'PLUS (social)';
        return 'PLS (intermédiaire)';
      };
      case 'bailleur': return (l: LogementSocial) => l.bailleur || '(non renseigné)';
      case 'arrondissement': return (l: LogementSocial) => arrLabel(l.arrondissement);
    }
  }, [breakdown]);

  // ── Aggregate data by year × group ──
  const { yearGroupData, groupsOrdered } = useMemo(() => {
    // year → group → count
    const ygd: Record<number, Record<string, number>> = {};
    const groupTotals: Record<string, number> = {};

    for (const year of filteredYearsSet) ygd[year] = {};

    if (breakdown === 'type') {
      // Special: split each logement into PLAI/PLUS/PLS
      for (const l of filteredLogements) {
        const y = ygd[l.annee];
        if (!y) continue;
        const types = [
          { key: 'PLAI (très social)', val: l.nbPLAI || 0 },
          { key: 'PLUS (social)', val: l.nbPLUS || 0 },
          { key: 'PLS (intermédiaire)', val: l.nbPLS || 0 },
        ];
        for (const t of types) {
          y[t.key] = (y[t.key] || 0) + t.val;
          groupTotals[t.key] = (groupTotals[t.key] || 0) + t.val;
        }
      }
    } else {
      for (const l of filteredLogements) {
        const y = ygd[l.annee];
        if (!y) continue;
        const key = breakdown === 'bailleur' ? (l.bailleur || '(non renseigné)') : arrLabel(l.arrondissement);
        y[key] = (y[key] || 0) + l.nbLogements;
        groupTotals[key] = (groupTotals[key] || 0) + l.nbLogements;
      }
    }

    const ordered = Object.entries(groupTotals).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { yearGroupData: ygd, groupsOrdered: ordered };
  }, [filteredLogements, filteredYearsSet, breakdown]);

  /** Limit to top N groups for readability */
  const displayGroups = useMemo(() => {
    if (breakdown === 'type') return groupsOrdered; // always 3
    return groupsOrdered.slice(0, breakdown === 'bailleur' ? 8 : 20);
  }, [groupsOrdered, breakdown]);

  // ── Stacked bar chart ──
  const chartOption = useMemo((): EChartsOption | null => {
    if (filteredYearsSet.length === 0 || displayGroups.length === 0) return null;
    const years = filteredYearsSet.map(y => y.toString());
    const series = displayGroups.map((label, idx) => ({
      name: label, type: 'bar' as const, stack: 'log', barMaxWidth: isMobile ? 30 : 50,
      emphasis: { focus: 'series' as const },
      itemStyle: { color: getGroupColor(label, breakdown, idx), borderRadius: 0 },
      data: filteredYearsSet.map(y => yearGroupData[y]?.[label] || 0),
    }));
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.2)', textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ seriesName: string; value: number; color: string; dataIndex: number }>;
          if (!items?.length) return '';
          const year = filteredYearsSet[items[0].dataIndex];
          const total = items.reduce((s, i) => s + (i.value || 0), 0);
          let h = `<div style="font-weight:600;margin-bottom:6px">${year} — ${formatNumber(total)} logements</div>`;
          for (const it of [...items].sort((a, b) => (b.value || 0) - (a.value || 0))) { if (it.value > 0) { const pct = total > 0 ? ((it.value / total) * 100).toFixed(0) : '0'; h += `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="width:8px;height:8px;border-radius:2px;background:${it.color};flex-shrink:0"></span><span style="flex:1">${it.seriesName}</span><span style="font-weight:500">${formatNumber(it.value)}</span><span style="color:#94a3b8;font-size:11px">(${pct}%)</span></div>`; } }
          return h;
        },
      },
      legend: { bottom: 0, left: 'center', textStyle: { color: '#94a3b8', fontSize: 11 }, itemWidth: 12, itemHeight: 12, type: breakdown === 'type' ? 'plain' : 'scroll' },
      grid: { top: 30, right: isMobile ? 10 : 20, bottom: breakdown === 'type' ? 50 : (isMobile ? 80 : 60), left: isMobile ? 10 : 20, containLabel: true },
      xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: isMobile ? 10 : 12, rotate: isMobile ? 45 : 0 }, axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => formatNumber(v) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series,
    };
  }, [filteredYearsSet, displayGroups, yearGroupData, isMobile, breakdown]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    if (filteredYearsSet.length < 2) return null;
    const totalByYear = (y: number) => Object.values(yearGroupData[y] || {}).reduce((s, v) => s + v, 0);
    const latestY = filteredYearsSet[filteredYearsSet.length - 1];
    const earliestY = filteredYearsSet[0];
    const prevY = filteredYearsSet[filteredYearsSet.length - 2];
    const latestT = totalByYear(latestY);
    const earliestT = totalByYear(earliestY);
    const prevT = totalByYear(prevY);
    const totalCumul = filteredYearsSet.reduce((s, y) => s + totalByYear(y), 0);
    const avg = totalCumul / filteredYearsSet.length;
    const yoyPct = prevT > 0 ? ((latestT - prevT) / prevT) * 100 : 0;
    const periodPct = earliestT > 0 ? ((latestT - earliestT) / earliestT) * 100 : 0;
    return { latestYear: latestY, earliestYear: earliestY, latestTotal: latestT, avg, totalCumul, yoyPct, periodPct };
  }, [filteredYearsSet, yearGroupData]);

  // ── Variation ranking (same dimension as stacked chart) ──
  const variationItems = useMemo(() => {
    if (filteredYearsSet.length < 2) return [];
    const latestY = filteredYearsSet[filteredYearsSet.length - 1];
    const earliestY = filteredYearsSet[0];
    const items = displayGroups.map(label => {
      const lv = yearGroupData[latestY]?.[label] || 0;
      const ev = yearGroupData[earliestY]?.[label] || 0;
      const diff = lv - ev;
      return { label, latestVal: lv, earliestVal: ev, diff, diffPct: ev > 0 ? (diff / ev) * 100 : 0 };
    });
    const h = items.filter(i => i.diff >= 0).sort((a, b) => b.diff - a.diff);
    const b = items.filter(i => i.diff < 0).sort((a, b) => a.diff - b.diff);
    return [...h, ...b];
  }, [filteredYearsSet, displayGroups, yearGroupData]);

  // ── Variation chart option ──
  const variationChartOption = useMemo((): EChartsOption | null => {
    if (variationItems.length === 0) return null;
    const cats = variationItems.map(d => d.label); const vals = variationItems.map(d => d.diff);
    const mx = Math.max(...vals.map(Math.abs), 1);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.2)', textStyle: { color: '#f1f5f9', fontSize: 12 },
        formatter: (p: unknown) => { const a = p as Array<{ dataIndex: number }>; if (!a?.length) return ''; const it = variationItems[a[0].dataIndex]; const c = it.diff >= 0 ? PALETTE.emerald : PALETTE.red; return `<div style="font-weight:600;margin-bottom:6px">${it.label}</div><div>${startYear} : ${formatNumber(it.earliestVal)} logements</div><div>${endYear} : ${formatNumber(it.latestVal)} logements</div><div style="border-top:1px solid rgba(148,163,184,0.3);margin-top:4px;padding-top:4px;color:${c};font-weight:600">${it.diff >= 0 ? '+' : ''}${formatNumber(it.diff)} logements</div>`; },
      },
      grid: { left: isMobile ? '5%' : '3%', right: isMobile ? '18%' : '14%', top: 5, bottom: 5, containLabel: true },
      xAxis: { type: 'value', min: -mx * 1.15, max: mx * 1.15, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: 'rgba(71,85,105,0.2)', type: 'dashed' } } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: isMobile ? 10 : 12, width: isMobile ? 100 : 140, overflow: 'truncate', ellipsis: '...' } },
      series: [{ type: 'bar', barMaxWidth: isMobile ? 18 : 22,
        data: vals.map(v => ({ value: v, itemStyle: { color: v >= 0 ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: PALETTE.emerald }, { offset: 1, color: '#059669' }] } : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#dc2626' }, { offset: 1, color: PALETTE.red }] }, borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
        label: { show: true, position: 'right', formatter: (pr) => { const p = pr as { value: number }; return `{a|${p.value >= 0 ? '+' : ''}${formatNumber(p.value)}}`; }, rich: { a: { color: '#e2e8f0', fontSize: isMobile ? 10 : 11, fontWeight: 500 } } },
      }],
      animation: true, animationDuration: 600,
    };
  }, [variationItems, startYear, endYear, isMobile]);

  const variationChartHeight = useMemo(() => Math.max(150, variationItems.length * (isMobile ? 34 : 38) + 20), [variationItems.length, isMobile]);

  if (allYears.length === 0) return <div className="flex justify-center py-16"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  const breakdownLabel = BREAKDOWN_OPTIONS.find(o => o.id === breakdown)?.label.toLowerCase() || '';

  return (
    <div className="space-y-6">
      {/* ── Header: title + breakdown + year range ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Tendances des logements sociaux</h3>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            {BREAKDOWN_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setBreakdown(opt.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${breakdown === opt.id ? 'bg-emerald-500/20 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
              ><span>{opt.icon}</span>{opt.label}</button>
            ))}
          </div>
        </div>
        <YearRangeSelector availableYears={allYears} startYear={startYear} endYear={endYear} onStartYearChange={setStartYear} onEndYearChange={setEndYear} />
      </div>

      {/* ── KPIs ── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Production {kpis.latestYear}</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-400">{formatNumber(kpis.latestTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">logements</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Variation annuelle</p>
            <p className={`text-xl sm:text-2xl font-bold ${kpis.yoyPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{kpis.yoyPct >= 0 ? '+' : ''}{kpis.yoyPct.toFixed(1)}%</p>
            <p className="text-xs text-slate-500 mt-1">vs {kpis.latestYear - 1}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Cumul {kpis.earliestYear}→{kpis.latestYear}</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100">{kpis.totalCumul >= 1000 ? `${(kpis.totalCumul / 1000).toFixed(0)}k` : formatNumber(kpis.totalCumul)}</p>
            <p className="text-xs text-slate-500 mt-1">logements financés</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Moyenne annuelle</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100">{formatNumber(Math.round(kpis.avg))}</p>
            <p className="text-xs text-slate-500 mt-1">logements / an</p>
          </div>
        </div>
      )}

      {/* ── Stacked Bar Chart ── */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Production annuelle par {breakdownLabel}</h3>
        {chartOption && <ReactECharts option={chartOption} style={{ height: isMobile ? 320 : 400, width: '100%' }} opts={{ renderer: 'svg' }} />}
        <p className="text-[10px] text-slate-500 mt-2">Source : Open Data Paris — Logements sociaux financés à Paris.</p>
      </div>

      {/* ── Variation Ranking ── */}
      {variationChartOption && kpis && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-8 rounded-full bg-emerald-500" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Évolution par {breakdownLabel} ({kpis.earliestYear} → {kpis.latestYear})</h4>
              <p className="text-xs text-slate-500">Quels {breakdownLabel}s ont le plus évolué</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mb-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /><span>Hausse</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /><span>Baisse</span></div>
          </div>
          <ReactECharts option={variationChartOption} style={{ height: variationChartHeight, width: '100%' }} opts={{ renderer: 'canvas' }} />
        </div>
      )}

      {/* ── Data Quality Note ── */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
        <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5"><span>ℹ️</span> À propos de ces données</h4>
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>Données issues du jeu <strong className="text-slate-400">logements sociaux financés à Paris</strong> (OpenData Paris), couvrant 2010-2024.</li>
          <li>Chaque programme représente un financement validé ; la livraison effective intervient en général 2-4 ans plus tard.</li>
          <li>La répartition PLAI/PLUS/PLS peut varier selon les quotas réglementaires (loi SRU, PLU).</li>
        </ul>
      </div>
    </div>
  );
}
