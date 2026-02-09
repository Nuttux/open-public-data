'use client';

/**
 * SubventionsTendancesTab — Onglet "Tendances" de /subventions.
 *
 * Un sélecteur de breakdown (Thématique) pilote DEUX charts :
 *   1. Stacked bar chart : montant par année, ventilé par la dimension choisie
 *   2. Horizontal bar ranking : variation entre première et dernière année
 *
 * Même pattern UX que Travaux Tendances et Logements Tendances.
 *
 * Source : /public/data/subventions/index.json + treemap_{year}.json
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import YearRangeSelector from '@/components/YearRangeSelector';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TreemapThematique { thematique: string; montant_total: number; pct_total: number; nb_beneficiaires: number; }
interface SubventionYearData { year: number; total_montant: number; nb_subventions: number; thematiques: TreemapThematique[]; }
interface SubventionsIndex { available_years: number[]; totals_by_year: Record<string, { montant_total: number; nb_subventions: number }>; }

type BreakdownDim = 'thematique';
interface BreakdownOption { id: BreakdownDim; label: string; icon: string; }

const BREAKDOWN_OPTIONS: BreakdownOption[] = [
  { id: 'thematique', label: 'Thématique', icon: '🎯' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatVariation(value: number): string {
  const m = value / 1_000_000;
  const s = value >= 0 ? '+' : '';
  return Math.abs(m) >= 1000 ? `${s}${(m / 1000).toFixed(1)} Md€` : `${s}${m.toFixed(0)} M€`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsTendancesTab() {
  const [data, setData] = useState<SubventionYearData[]>([]);
  const [startYear, setStartYear] = useState(2018);
  const [endYear, setEndYear] = useState(2024);
  const [breakdown, setBreakdown] = useState<BreakdownDim>('thematique');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    (async () => {
      try {
        const indexRes = await fetch('/data/subventions/index.json');
        if (!indexRes.ok) throw new Error('Index non trouvé');
        const index: SubventionsIndex = await indexRes.json();
        const years = index.available_years.filter(y => y !== 2020 && y !== 2021).sort((a, b) => a - b);
        const yearData: SubventionYearData[] = await Promise.all(years.map(async (year) => {
          try {
            const res = await fetch(`/data/subventions/treemap_${year}.json`);
            if (!res.ok) throw new Error();
            const treemap = await res.json();
            return { year, total_montant: index.totals_by_year[String(year)]?.montant_total || treemap.total_montant || 0, nb_subventions: index.totals_by_year[String(year)]?.nb_subventions || 0, thematiques: treemap.data || [] };
          } catch { return { year, total_montant: index.totals_by_year[String(year)]?.montant_total || 0, nb_subventions: index.totals_by_year[String(year)]?.nb_subventions || 0, thematiques: [] }; }
        }));
        setData(yearData);
        if (yearData.length >= 2) { setStartYear(yearData[0].year); setEndYear(yearData[yearData.length - 1].year); }
      } catch (err) { console.error(err); setError('Données de tendances non disponibles'); }
      finally { setIsLoading(false); }
    })();
  }, []);

  const availableYears = useMemo(() => data.map(d => d.year).sort((a, b) => a - b), [data]);
  const filteredYears = useMemo(() => data.filter(d => d.year >= startYear && d.year <= endYear).sort((a, b) => a.year - b.year), [data, startYear, endYear]);

  // ── Groups driven by breakdown ──
  const getGroupKey = (t: TreemapThematique): string => t.thematique;
  const getGroupColor = (key: string): string => getThematiqueColor(key);

  const groupsOrdered = useMemo(() => {
    if (filteredYears.length === 0) return [];
    const totals: Record<string, number> = {};
    for (const y of filteredYears) for (const t of y.thematiques) { const k = getGroupKey(t); totals[k] = (totals[k] || 0) + t.montant_total; }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([l]) => l);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredYears, breakdown]);

  // ── Stacked bar chart ──
  const chartOption = useMemo((): EChartsOption | null => {
    if (filteredYears.length === 0 || groupsOrdered.length === 0) return null;
    const years = filteredYears.map(y => y.year.toString());
    const series = groupsOrdered.slice(0, 10).map((label) => ({
      name: label, type: 'bar' as const, stack: 'subv', barMaxWidth: isMobile ? 40 : 60,
      emphasis: { focus: 'series' as const },
      itemStyle: { color: getGroupColor(label), borderRadius: 0 },
      data: filteredYears.map(y => { let v = 0; for (const t of y.thematiques) if (getGroupKey(t) === label) v += t.montant_total; return v; }),
    }));
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.2)', textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{ seriesName: string; value: number; color: string; dataIndex: number }>;
          if (!items?.length) return '';
          const yd = filteredYears[items[0].dataIndex]; const total = yd?.total_montant || 0;
          let h = `<div style="font-weight:600;margin-bottom:6px">${yd?.year} — ${formatEuroCompact(total)}</div>`;
          for (const it of [...items].sort((a, b) => (b.value || 0) - (a.value || 0))) { if (it.value > 0) { const pct = total > 0 ? ((it.value / total) * 100).toFixed(1) : '0'; h += `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="width:8px;height:8px;border-radius:2px;background:${it.color};flex-shrink:0"></span><span style="flex:1">${it.seriesName}</span><span style="font-weight:500">${formatEuroCompact(it.value)}</span><span style="color:#94a3b8;font-size:11px">(${pct}%)</span></div>`; } }
          return h;
        },
      },
      legend: { bottom: 0, left: 'center', textStyle: { color: '#94a3b8', fontSize: 11 }, itemWidth: 12, itemHeight: 12, itemGap: isMobile ? 6 : 12, type: isMobile ? 'scroll' : 'plain' },
      grid: { top: 30, right: isMobile ? 10 : 20, bottom: isMobile ? 80 : 60, left: isMobile ? 10 : 20, containLabel: true },
      xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: 12 }, axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md€` : `${(v / 1e6).toFixed(0)} M€` }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series,
    };
  }, [filteredYears, groupsOrdered, isMobile, breakdown]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    if (filteredYears.length < 2) return null;
    const latest = filteredYears[filteredYears.length - 1]; const earliest = filteredYears[0]; const prev = filteredYears[filteredYears.length - 2];
    const avg = filteredYears.reduce((s, y) => s + y.total_montant, 0) / filteredYears.length;
    const yoyPct = prev.total_montant > 0 ? ((latest.total_montant - prev.total_montant) / prev.total_montant) * 100 : 0;
    const periodPct = earliest.total_montant > 0 ? ((latest.total_montant - earliest.total_montant) / earliest.total_montant) * 100 : 0;
    return { latestYear: latest.year, earliestYear: earliest.year, latestTotal: latest.total_montant, latestNbSub: latest.nb_subventions, avg, yoyPct, periodPct };
  }, [filteredYears]);

  // ── Variation ranking (same dimension) ──
  const variationItems = useMemo(() => {
    if (filteredYears.length < 2) return [];
    const latest = filteredYears[filteredYears.length - 1]; const earliest = filteredYears[0];
    const items = groupsOrdered.slice(0, 12).map(label => {
      let lv = 0, ev = 0;
      for (const t of latest.thematiques) if (getGroupKey(t) === label) lv += t.montant_total;
      for (const t of earliest.thematiques) if (getGroupKey(t) === label) ev += t.montant_total;
      const diff = lv - ev;
      return { label, latestVal: lv, earliestVal: ev, diff, diffPct: ev > 0 ? (diff / ev) * 100 : 0 };
    });
    const h = items.filter(i => i.diff >= 0).sort((a, b) => b.diff - a.diff);
    const b = items.filter(i => i.diff < 0).sort((a, b) => a.diff - b.diff);
    return [...h, ...b];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredYears, groupsOrdered, breakdown]);

  // ── Variation chart option ──
  const variationChartOption = useMemo((): EChartsOption | null => {
    if (variationItems.length === 0) return null;
    const cats = variationItems.map(d => d.label); const vals = variationItems.map(d => d.diff); const pcts = variationItems.map(d => d.diffPct);
    const mx = Math.max(...vals.map(Math.abs), 1);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.2)', borderWidth: 1, textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 12 },
        formatter: (p: unknown) => { const a = p as Array<{ dataIndex: number }>; if (!a?.length) return ''; const it = variationItems[a[0].dataIndex]; const c = it.diff >= 0 ? PALETTE.emerald : PALETTE.red; return `<div style="font-weight:600;margin-bottom:6px">${it.label}</div><div style="display:flex;justify-content:space-between;gap:20px"><span>${startYear} :</span><span>${formatEuroCompact(it.earliestVal)}</span></div><div style="display:flex;justify-content:space-between;gap:20px"><span>${endYear} :</span><span>${formatEuroCompact(it.latestVal)}</span></div><div style="border-top:1px solid rgba(148,163,184,0.3);margin-top:6px;padding-top:6px"><span style="color:${c};font-weight:600">${formatVariation(it.diff)} (${it.diffPct >= 0 ? '+' : ''}${it.diffPct.toFixed(1)}%)</span></div>`; },
      },
      grid: { left: isMobile ? '5%' : '3%', right: isMobile ? '18%' : '14%', top: 5, bottom: 5, containLabel: true },
      xAxis: { type: 'value', min: -mx * 1.15, max: mx * 1.15, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: 'rgba(71,85,105,0.2)', type: 'dashed' } } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: isMobile ? 10 : 12, width: isMobile ? 100 : 160, overflow: 'truncate', ellipsis: '...' } },
      series: [{ type: 'bar', barMaxWidth: isMobile ? 18 : 22,
        data: vals.map(v => ({ value: v, itemStyle: { color: v >= 0 ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: PALETTE.emerald }, { offset: 1, color: '#059669' }] } : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#dc2626' }, { offset: 1, color: PALETTE.red }] }, borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
        label: { show: true, position: 'right', formatter: (pr) => { const p = pr as { dataIndex: number; value: number }; const pct = pcts[p.dataIndex]; return isMobile ? `{a|${formatVariation(p.value)}}` : `{a|${formatVariation(p.value)}} {b|(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)}`; }, rich: { a: { color: '#e2e8f0', fontSize: isMobile ? 10 : 11, fontWeight: 500 }, b: { color: '#64748b', fontSize: isMobile ? 9 : 10 } } },
      }],
      animation: true, animationDuration: 600, animationEasing: 'cubicOut',
    };
  }, [variationItems, startYear, endYear, isMobile]);

  const variationChartHeight = useMemo(() => Math.max(150, variationItems.length * (isMobile ? 34 : 38) + 20), [variationItems.length, isMobile]);

  if (isLoading) return <div className="flex justify-center py-16"><div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6"><div className="text-center py-12"><span className="text-4xl mb-4 block">⚠️</span><p className="text-sm text-slate-400">{error}</p></div></div>;

  return (
    <div className="space-y-6">
      {/* ── Header: title + breakdown + year range ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Tendances des subventions</h3>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
            {BREAKDOWN_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setBreakdown(opt.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${breakdown === opt.id ? 'bg-purple-500/20 text-purple-300 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
              ><span>{opt.icon}</span>{opt.label}</button>
            ))}
          </div>
        </div>
        <YearRangeSelector availableYears={availableYears} startYear={startYear} endYear={endYear} onStartYearChange={setStartYear} onEndYearChange={setEndYear} />
      </div>

      {/* ── KPIs ── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Subventions {kpis.latestYear}</p>
            <p className="text-xl sm:text-2xl font-bold text-purple-400">{formatEuroCompact(kpis.latestTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatNumber(kpis.latestNbSub)} subventions</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Variation annuelle</p>
            <p className={`text-xl sm:text-2xl font-bold ${kpis.yoyPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{kpis.yoyPct >= 0 ? '+' : ''}{kpis.yoyPct.toFixed(1)}%</p>
            <p className="text-xs text-slate-500 mt-1">vs {kpis.latestYear - 1}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Évolution {kpis.earliestYear}→{kpis.latestYear}</p>
            <p className={`text-xl sm:text-2xl font-bold ${kpis.periodPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{kpis.periodPct >= 0 ? '+' : ''}{kpis.periodPct.toFixed(1)}%</p>
            <p className="text-xs text-slate-500 mt-1">sur {filteredYears.length} exercices</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Moyenne annuelle</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100">{formatEuroCompact(kpis.avg)}</p>
            <p className="text-xs text-slate-500 mt-1">par an</p>
          </div>
        </div>
      )}

      {/* ── Stacked Bar Chart ── */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Subventions par {BREAKDOWN_OPTIONS.find(o => o.id === breakdown)?.label.toLowerCase()}</h3>
        {chartOption && <ReactECharts option={chartOption} style={{ height: isMobile ? 320 : 400, width: '100%' }} opts={{ renderer: 'svg' }} />}
        <p className="text-[10px] text-slate-500 mt-2">Source : Open Data Paris — Subventions associations votées. Données absentes pour 2020-2021.</p>
      </div>

      {/* ── Variation Ranking ── */}
      {variationChartOption && kpis && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-8 rounded-full bg-purple-500" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Évolution par {BREAKDOWN_OPTIONS.find(o => o.id === breakdown)?.label.toLowerCase()} ({kpis.earliestYear} → {kpis.latestYear})</h4>
              <p className="text-xs text-slate-500">Quelles {BREAKDOWN_OPTIONS.find(o => o.id === breakdown)?.label.toLowerCase()}s ont le plus évolué</p>
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
          <li>Les données proviennent des <strong className="text-slate-400">subventions aux associations votées</strong> par le Conseil de Paris.</li>
          <li>Les années <strong className="text-slate-400">2020 et 2021</strong> ne sont pas disponibles dans la source OpenData.</li>
          <li>Les montants représentent le top 500 bénéficiaires par année, couvrant plus de 95% du total.</li>
        </ul>
      </div>
    </div>
  );
}
