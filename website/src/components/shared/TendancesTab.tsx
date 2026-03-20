'use client';

/**
 * TendancesTab — Composant partagé pour les onglets "Tendances".
 *
 * Utilisé par Subventions, Investissements et Logements.
 * Chaque page passe sa configuration (breakdowns, couleurs, formatters, textes)
 * et soit un dataUrl (fetch) soit des data directes.
 *
 * Pattern :
 *   1. Breakdown selector + Year range selector
 *   2. 4 KPI cards (KPI3 et KPI4 customisables)
 *   3. Stacked bar chart par dimension sélectionnée
 *   4. Horizontal bar ranking : variation entre première et dernière année
 *   5. Data quality note
 */

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { PALETTE } from '@/lib/colors';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import YearRangeSelector from '@/components/YearRangeSelector';
import ExportBar from '@/components/shared/ExportBar';
import { useT } from '@/lib/localeContext';

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface GroupItem { label: string; value: number; }

export interface TendancesYear {
  year: number;
  total: number;
  subCount?: number;
  groups: Record<string, GroupItem[]>;
}

export interface BreakdownOption {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface KpiCard {
  label: string;
  value: string;
  valueClass?: string;
  sub: string;
}

// ─── Theme ───────────────────────────────────────────────────────────────────

type ThemeColor = 'purple' | 'amber' | 'emerald' | 'teal';

const THEME = {
  purple: {
    spinner: 'border-purple-500',
    kpi1Value: 'text-purple-400',
    activeBtn: 'bg-purple-500/20 text-purple-300 shadow-sm',
    variationBar: 'bg-purple-500',
  },
  amber: {
    spinner: 'border-amber-500',
    kpi1Value: 'text-slate-100',
    activeBtn: 'bg-amber-500/20 text-amber-300 shadow-sm',
    variationBar: 'bg-rose-500',
  },
  emerald: {
    spinner: 'border-emerald-500',
    kpi1Value: 'text-emerald-400',
    activeBtn: 'bg-emerald-500/20 text-emerald-300 shadow-sm',
    variationBar: 'bg-emerald-500',
  },
  teal: {
    spinner: 'border-teal-500',
    kpi1Value: 'text-teal-400',
    activeBtn: 'bg-teal-500/20 text-teal-300 shadow-sm',
    variationBar: 'bg-teal-500',
  },
} as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface KpiContext {
  filteredYears: TendancesYear[];
  earliest: TendancesYear;
  latest: TendancesYear;
  breakdown: string;
  topName: string;
  topValue: number;
  topPct: number;
}

export interface TendancesTabProps {
  // Data — provide EITHER dataUrl+parseData (fetch) OR data (direct)
  dataUrl?: string;
  parseData?: (json: unknown) => TendancesYear[];
  data?: TendancesYear[];

  // Breakdowns
  breakdowns: BreakdownOption[];
  getGroupColor: (label: string, dim: string, idx: number) => string;
  /** Limit groups shown per dimension (return undefined = no limit) */
  groupLimit?: (dim: string) => number | undefined;

  // Theme
  theme: ThemeColor;

  // Value formatting
  /** Format a value for display (tooltip items, KPI1 default) */
  formatValue: (v: number) => string;
  /** Tooltip header line, e.g. "2024 — 1,2 Md€" */
  tooltipHeader: (year: number, total: number) => string;
  /** Variation bar label, e.g. "+120 M€" */
  formatVariationDiff: (diff: number) => string;
  /** Show % alongside variation diff? (default true) */
  showVariationPct?: boolean;
  /** Variation tooltip value formatter (for start/end year values) */
  formatVariationTooltipValue?: (v: number) => string;

  // Titles
  title: string;
  chartTitle: (dimLabel: string) => string;
  variationTitle: (dimLabel: string) => string;
  variationSubtitle: (dimLabel: string) => string;
  yAxisFormatter: (v: number) => string;
  sourceNote: string;
  qualityNotes: React.ReactNode;

  // KPIs
  kpi1Label: (year: number) => string;
  kpi1Sub?: (year: TendancesYear) => string;
  /** Override KPI3 (default: period evolution %) */
  kpi3?: (ctx: KpiContext) => KpiCard;
  /** Override KPI4 (default: top group from breakdown) */
  kpi4?: (ctx: KpiContext) => KpiCard;
  /** CSV export filename (optional, for future export bar) */
  csvFilename?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TendancesTab({
  dataUrl, parseData, data: directData,
  breakdowns, getGroupColor, groupLimit,
  theme,
  formatValue, tooltipHeader, formatVariationDiff,
  showVariationPct = true, formatVariationTooltipValue,
  title, chartTitle, variationTitle, variationSubtitle,
  yAxisFormatter, sourceNote, qualityNotes,
  kpi1Label, kpi1Sub, kpi3, kpi4,
  csvFilename,
}: TendancesTabProps) {
  const [fetchedData, setFetchedData] = useState<TendancesYear[]>([]);
  const [startYear, setStartYear] = useState(2018);
  const [endYear, setEndYear] = useState(2024);
  const [breakdown, setBreakdown] = useState(breakdowns[0].id);
  const [isLoading, setIsLoading] = useState(!directData);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const t = THEME[theme];
  const tr = useT();

  // Use direct data or fetched data
  const data = directData || fetchedData;

  // Fetch data if dataUrl is provided (skip if direct data)
  useEffect(() => {
    if (directData) return;
    if (!dataUrl || !parseData) return;
    (async () => {
      try {
        const res = await fetch(dataUrl);
        if (!res.ok) throw new Error('Fichier non trouvé');
        const json = await res.json();
        setFetchedData(parseData(json));
      } catch (err) { console.error(err); setError('Données de tendances non disponibles'); }
      finally { setIsLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUrl, !!directData]);

  // Init year range from data
  useEffect(() => {
    if (data.length >= 2) {
      const sorted = [...data].sort((a, b) => a.year - b.year);
      setStartYear(sorted[0].year);
      setEndYear(sorted[sorted.length - 1].year);
    }
  }, [data]);

  const availableYears = useMemo(() => data.map(y => y.year).sort((a, b) => a - b), [data]);
  const filteredYears = useMemo(() => data.filter(y => y.year >= startYear && y.year <= endYear).sort((a, b) => a.year - b.year), [data, startYear, endYear]);

  // ── Groups driven by breakdown ──
  const groupsOrdered = useMemo(() => {
    if (filteredYears.length === 0) return [];
    const totals: Record<string, number> = {};
    for (const y of filteredYears) {
      for (const g of (y.groups[breakdown] || [])) {
        totals[g.label] = (totals[g.label] || 0) + g.value;
      }
    }
    const all = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const limit = groupLimit?.(breakdown);
    return limit ? all.slice(0, limit) : all;
  }, [filteredYears, breakdown, groupLimit]);

  // ── Stacked bar chart ──
  const chartOption = useMemo((): EChartsOption | null => {
    if (filteredYears.length === 0 || groupsOrdered.length === 0) return null;
    const years = filteredYears.map(y => y.year.toString());
    const series = groupsOrdered.map((label, idx) => ({
      name: label, type: 'bar' as const, stack: 'main', barMaxWidth: isMobile ? 40 : 60,
      emphasis: { focus: 'series' as const },
      itemStyle: { color: getGroupColor(label, breakdown, idx), borderRadius: 0 },
      data: filteredYears.map(y => {
        let v = 0;
        for (const g of (y.groups[breakdown] || [])) if (g.label === label) v += g.value;
        return v;
      }),
    }));
    return {
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.2)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ seriesName: string; value: number; color: string; dataIndex: number }>;
          if (!items?.length) return '';
          const yd = filteredYears[items[0].dataIndex];
          const total = yd?.total || 0;
          let h = `<div style="font-weight:600;margin-bottom:6px">${tooltipHeader(yd?.year, total)}</div>`;
          for (const it of [...items].sort((a, b) => (b.value || 0) - (a.value || 0))) {
            if (it.value > 0) {
              const pct = total > 0 ? ((it.value / total) * 100).toFixed(1) : '0';
              h += `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="width:8px;height:8px;border-radius:2px;background:${it.color};flex-shrink:0"></span><span style="flex:1">${it.seriesName}</span><span style="font-weight:500">${formatValue(it.value)}</span><span style="color:#94a3b8;font-size:11px">(${pct}%)</span></div>`;
            }
          }
          return h;
        },
      },
      legend: { bottom: 0, left: 'center', textStyle: { color: '#94a3b8', fontSize: 11 }, itemWidth: 12, itemHeight: 12, itemGap: isMobile ? 6 : 12, type: isMobile ? 'scroll' : 'plain' },
      grid: { top: 30, right: isMobile ? 10 : 20, bottom: isMobile ? 80 : 60, left: isMobile ? 10 : 20, containLabel: true },
      xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: 12 }, axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 11, formatter: yAxisFormatter }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series,
    };
  }, [filteredYears, groupsOrdered, isMobile, breakdown, getGroupColor, yAxisFormatter, formatValue, tooltipHeader]);

  // ── KPIs ──
  const kpiCtx = useMemo(() => {
    if (filteredYears.length < 2) return null;
    const latest = filteredYears[filteredYears.length - 1];
    const earliest = filteredYears[0];
    const prev = filteredYears[filteredYears.length - 2];
    const yoyPct = prev.total > 0 ? ((latest.total - prev.total) / prev.total) * 100 : 0;
    const periodPct = earliest.total > 0 ? ((latest.total - earliest.total) / earliest.total) * 100 : 0;
    const latestGroups = latest.groups[breakdown] || [];
    const topGroup = latestGroups.reduce(
      (best, g) => g.value > (best?.value || 0) ? g : best,
      latestGroups[0]
    );
    return {
      latest, earliest, prev, yoyPct, periodPct,
      filteredYears, breakdown,
      topName: topGroup?.label || '',
      topValue: topGroup?.value || 0,
      topPct: latest.total > 0 ? (topGroup?.value || 0) / latest.total * 100 : 0,
    };
  }, [filteredYears, breakdown]);

  // ── Variation ranking ──
  const variationItems = useMemo(() => {
    if (filteredYears.length < 2) return [];
    const latest = filteredYears[filteredYears.length - 1];
    const earliest = filteredYears[0];
    const latestGroups = latest.groups[breakdown] || [];
    const earliestGroups = earliest.groups[breakdown] || [];
    const items = groupsOrdered.map(label => {
      let lv = 0, ev = 0;
      for (const g of latestGroups) if (g.label === label) lv += g.value;
      for (const g of earliestGroups) if (g.label === label) ev += g.value;
      const diff = lv - ev;
      return { label, latestVal: lv, earliestVal: ev, diff, diffPct: ev > 0 ? (diff / ev) * 100 : 0 };
    });
    const h = items.filter(i => i.diff >= 0).sort((a, b) => b.diff - a.diff);
    const b = items.filter(i => i.diff < 0).sort((a, b) => b.diff - a.diff);
    return [...h, ...b];
  }, [filteredYears, groupsOrdered, breakdown]);

  // ── Variation chart option ──
  const fmtVarTooltipVal = formatVariationTooltipValue || formatValue;
  const variationChartOption = useMemo((): EChartsOption | null => {
    if (variationItems.length === 0) return null;
    const cats = variationItems.map(d => d.label);
    const vals = variationItems.map(d => d.diff);
    const pcts = variationItems.map(d => d.diffPct);
    const mx = Math.max(...vals.map(Math.abs), 1);
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.2)', borderWidth: 1,
        textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 12 },
        formatter: (p: unknown) => {
          const a = p as Array<{ dataIndex: number }>;
          if (!a?.length) return '';
          const it = variationItems[a[0].dataIndex];
          const c = it.diff >= 0 ? PALETTE.emerald : PALETTE.red;
          return `<div style="font-weight:600;margin-bottom:6px">${it.label}</div><div style="display:flex;justify-content:space-between;gap:20px"><span>${startYear} :</span><span>${fmtVarTooltipVal(it.earliestVal)}</span></div><div style="display:flex;justify-content:space-between;gap:20px"><span>${endYear} :</span><span>${fmtVarTooltipVal(it.latestVal)}</span></div><div style="border-top:1px solid rgba(148,163,184,0.3);margin-top:6px;padding-top:6px"><span style="color:${c};font-weight:600">${formatVariationDiff(it.diff)}${showVariationPct ? ` (${it.diffPct >= 0 ? '+' : ''}${it.diffPct.toFixed(1)}%)` : ''}</span></div>`;
        },
      },
      grid: { left: isMobile ? '5%' : '3%', right: isMobile ? '18%' : '14%', top: 5, bottom: 5, containLabel: true },
      xAxis: { type: 'value', min: -mx * 1.15, max: mx * 1.15, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: 'rgba(71,85,105,0.2)', type: 'dashed' } } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: isMobile ? 10 : 12, width: isMobile ? 140 : 280, overflow: 'truncate', ellipsis: '...' } },
      series: [{
        type: 'bar', barMaxWidth: isMobile ? 18 : 22,
        data: vals.map(v => ({
          value: v,
          itemStyle: {
            color: v >= 0
              ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: PALETTE.emerald }, { offset: 1, color: '#059669' }] }
              : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#dc2626' }, { offset: 1, color: PALETTE.red }] },
            borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        label: {
          show: true, position: 'right',
          formatter: (pr) => {
            const p = pr as { dataIndex: number; value: number };
            const pct = pcts[p.dataIndex];
            if (!showVariationPct || isMobile) return `{a|${formatVariationDiff(p.value)}}`;
            return `{a|${formatVariationDiff(p.value)}} {b|(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)}`;
          },
          rich: { a: { color: '#e2e8f0', fontSize: isMobile ? 10 : 11, fontWeight: 500 }, b: { color: '#64748b', fontSize: isMobile ? 9 : 10 } },
        },
      }],
      animation: true, animationDuration: 600, animationEasing: 'cubicOut',
    };
  }, [variationItems, startYear, endYear, isMobile, formatVariationDiff, fmtVarTooltipVal, showVariationPct]);

  const variationChartHeight = useMemo(() => Math.max(150, variationItems.length * (isMobile ? 34 : 38) + 20), [variationItems.length, isMobile]);

  // ── CSV export data ──
  const { csvRows, csvColumns } = useMemo(() => {
    if (!csvFilename || filteredYears.length === 0) return { csvRows: [], csvColumns: [] };
    const cols: { key: string; label: string }[] = [
      { key: 'year', label: tr('csv.year') },
      { key: 'total', label: 'Total' },
      ...groupsOrdered.map(g => ({ key: g, label: g })),
    ];
    const rows = filteredYears.map(y => {
      const row: Record<string, unknown> = { year: y.year, total: y.total };
      for (const g of groupsOrdered) {
        let v = 0;
        for (const item of (y.groups[breakdown] || [])) if (item.label === g) v += item.value;
        row[g] = v;
      }
      return row;
    });
    return { csvRows: rows, csvColumns: cols };
  }, [csvFilename, filteredYears, groupsOrdered, breakdown]);

  // ── Default KPI3 / KPI4 ──
  const defaultKpi3 = kpiCtx ? {
    label: tr('ui.evolution_period').replace('{start}', String(kpiCtx.earliest.year)).replace('{end}', String(kpiCtx.latest.year)),
    value: `${kpiCtx.periodPct >= 0 ? '+' : ''}${kpiCtx.periodPct.toFixed(1)}%`,
    valueClass: kpiCtx.periodPct >= 0 ? 'text-emerald-400' : 'text-red-400',
    sub: tr('ui.over_n_years').replace('{n}', String(filteredYears.length)),
  } : null;

  const defaultKpi4 = kpiCtx ? {
    label: tr('ui.top_group'),
    value: kpiCtx.topName,
    sub: `${formatValue(kpiCtx.topValue)} (${kpiCtx.topPct.toFixed(0)}%)`,
  } : null;

  const kpi3Card = kpiCtx ? (kpi3 ? kpi3(kpiCtx) : defaultKpi3) : null;
  const kpi4Card = kpiCtx ? (kpi4 ? kpi4(kpiCtx) : defaultKpi4) : null;

  // ── Loading / Error ──
  if (isLoading) return <div className="flex justify-center py-16"><div className={`w-10 h-10 border-4 ${t.spinner} border-t-transparent rounded-full animate-spin`} /></div>;
  if (error || data.length === 0) return <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6"><div className="text-center py-12"><span className="text-4xl mb-4 block">⚠️</span><p className="text-sm text-slate-300">{error || tr('ui.data_unavailable')}</p></div></div>;

  const currentDim = breakdowns.find(o => o.id === breakdown);
  const currentDimLabel = currentDim?.label.toLowerCase() || '';

  return (
    <div className="space-y-6">
      {/* ── Export bar ── */}
      {csvFilename && csvRows.length > 0 && (
        <ExportBar
          csvData={csvRows}
          csvColumns={csvColumns}
          filename={`${csvFilename}_${startYear}-${endYear}`}
        />
      )}

      {/* ── Header: title + breakdown + year range ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            {breakdowns.map(opt => (
              <button key={opt.id} onClick={() => setBreakdown(opt.id)}
                className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${breakdown === opt.id ? t.activeBtn : 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/50'}`}
              ><span>{opt.icon}</span><span className={breakdowns.length > 1 ? 'hidden sm:inline' : ''}>{opt.label}</span></button>
            ))}
          </div>
        </div>
        <YearRangeSelector availableYears={availableYears} startYear={startYear} endYear={endYear} onStartYearChange={setStartYear} onEndYearChange={setEndYear} />
      </div>

      {/* ── KPIs ── */}
      {kpiCtx && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{kpi1Label(kpiCtx.latest.year)}</p>
            <p className={`text-2xl font-bold mt-1 ${t.kpi1Value}`}>{formatValue(kpiCtx.latest.total)}</p>
            {kpi1Sub && <p className="text-xs text-slate-400 mt-1">{kpi1Sub(kpiCtx.latest)}</p>}
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{tr('ui.yoy_variation')}</p>
            <p className={`text-2xl font-bold mt-1 ${kpiCtx.yoyPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{kpiCtx.yoyPct >= 0 ? '+' : ''}{kpiCtx.yoyPct.toFixed(1)}%</p>
            <p className="text-xs text-slate-400 mt-1">vs {kpiCtx.latest.year - 1}</p>
          </div>
          {kpi3Card && (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{kpi3Card.label}</p>
              <p className={`text-2xl font-bold mt-1 ${kpi3Card.valueClass || 'text-slate-100'}`}>{kpi3Card.value}</p>
              <p className="text-xs text-slate-400 mt-1">{kpi3Card.sub}</p>
            </div>
          )}
          {kpi4Card && (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{kpi4Card.label}</p>
              <p className="text-lg font-bold text-slate-100 mt-1 truncate">{kpi4Card.value}</p>
              <p className="text-xs text-slate-400 mt-1">{kpi4Card.sub}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Stacked Bar Chart ── */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">{chartTitle(currentDimLabel)}</h3>
        {chartOption && <ReactECharts option={chartOption} style={{ height: isMobile ? 320 : 400, width: '100%' }} opts={{ renderer: 'svg' }} />}
        <p className="text-[10px] text-slate-500 mt-2">{sourceNote}</p>
      </div>

      {/* ── Variation Ranking ── */}
      {variationChartOption && kpiCtx && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-1.5 h-8 rounded-full ${t.variationBar}`} />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">{variationTitle(currentDimLabel)} ({kpiCtx.earliest.year} → {kpiCtx.latest.year})</h4>
              <p className="text-xs text-slate-400">{variationSubtitle(currentDimLabel)}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mb-3 text-xs text-slate-300">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /><span>{tr('ui.hausse')}</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /><span>{tr('ui.baisse')}</span></div>
          </div>
          <ReactECharts option={variationChartOption} style={{ height: variationChartHeight, width: '100%' }} opts={{ renderer: 'canvas' }} />
        </div>
      )}

      {/* ── Data Quality Note ── */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
        <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><span>ℹ️</span> {tr('ui.about_data')}</h4>
        {qualityNotes}
      </div>
    </div>
  );
}
