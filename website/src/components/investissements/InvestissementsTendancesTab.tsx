'use client';

/**
 * InvestissementsTendancesTab — Onglet "Tendances" de /investissements (Travaux).
 *
 * Affiche l'évolution de l'investissement réel de la Ville de Paris (2019-2024)
 * à partir des Comptes Administratifs — Budget Principal (M57).
 *
 * L'utilisateur choisit une plage d'années (début → fin) via YearRangeSelector.
 * Tous les KPIs, le stacked bar chart et le variation ranking se recalculent
 * dynamiquement en fonction de la période choisie.
 *
 * Visualisations :
 *   1. KPI cards : total, variation annuelle, évolution sur la plage, top secteur
 *   2. Stacked bar chart : dépenses d'investissement par chapitre fonctionnel
 *   3. Horizontal bar ranking : variation par secteur (hausse/baisse), style VariationRankChart
 *
 * Source : /public/data/investissement_tendances.json
 *          (généré depuis OpenData Paris — CA Budgets Principaux)
 */

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import YearRangeSelector from '@/components/YearRangeSelector';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Données par chapitre fonctionnel */
interface ChapitreData {
  label: string;
  depenses: number;
  recettes: number;
}

/** Données par année */
interface TendancesYear {
  year: number;
  depenses_total: number;
  recettes_total: number;
  depenses_hors_dette: number;
  par_chapitre: ChapitreData[];
}

/** Structure du fichier JSON */
interface TendancesData {
  generated_at: string;
  source: string;
  note_perimetre: string;
  years: TendancesYear[];
}

// ─── Couleurs par chapitre — alignées sur THEMATIQUE_COLORS du design system ──
// Ref: docs/architecture-frontend.md §6.2, src/lib/colors.ts

const CHAPITRE_COLORS: Record<string, string> = {
  'Aménagement & Habitat': PALETTE.cyan,      // Aménagement → Cyan #06b6d4
  'Culture & Sport': PALETTE.purple,           // Culture & Sport → Purple #a855f7
  'Transports': PALETTE.amber,                 // Transports → Amber #f59e0b
  'Services Généraux': PALETTE.slate,          // Administration → Slate #64748b
  'Enseignement': PALETTE.blue,                // Éducation → Blue #3b82f6
  'Environnement': PALETTE.green,              // Environnement → Green #22c55e
  'Santé & Social': PALETTE.pink,              // Action Sociale → Pink #ec4899
  'Action Économique': PALETTE.orange,         // Économie → Orange #f97316
  'Sécurité': PALETTE.red,                     // Sécurité → Red #ef4444
  'Rsa': PALETTE.teal,                         // Santé → Teal #14b8a6
};

/** Couleur par défaut si le chapitre n'est pas dans la palette */
function getChapColor(label: string): string {
  return CHAPITRE_COLORS[label] || PALETTE.gray;
}

// ─── Variation formatting ─────────────────────────────────────────────────────

/** Formate un montant en millions avec signe (style VariationRankChart) */
function formatVariation(value: number): string {
  const millions = value / 1_000_000;
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(millions) >= 1000) {
    return `${sign}${(millions / 1000).toFixed(1)} Md€`;
  }
  return `${sign}${millions.toFixed(0)} M€`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvestissementsTendancesTab() {
  const [data, setData] = useState<TendancesData | null>(null);
  const [startYear, setStartYear] = useState<number>(2019);
  const [endYear, setEndYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // ── Chargement des données ──
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/data/investissement_tendances.json');
        if (!res.ok) throw new Error('Fichier non trouvé');
        const json: TendancesData = await res.json();
        setData(json);
        // Initialise la plage sur l'étendue complète des données
        if (json.years.length >= 2) {
          const sorted = [...json.years].sort((a, b) => a.year - b.year);
          setStartYear(sorted[0].year);
          setEndYear(sorted[sorted.length - 1].year);
        }
      } catch (err) {
        console.error('Error loading investment trends:', err);
        setError('Données de tendances non disponibles');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  /** Toutes les années disponibles (triées asc) */
  const availableYears = useMemo(() => {
    if (!data) return [];
    return data.years.map(y => y.year).sort((a, b) => a - b);
  }, [data]);

  /** Années filtrées par la plage sélectionnée */
  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.years
      .filter(y => y.year >= startYear && y.year <= endYear)
      .sort((a, b) => a.year - b.year);
  }, [data, startYear, endYear]);

  // ── Chapitres ordonnés (par montant total décroissant sur la plage) ──
  const chapitresOrdered = useMemo(() => {
    if (filteredYears.length === 0) return [];
    const totals: Record<string, number> = {};
    for (const y of filteredYears) {
      for (const c of y.par_chapitre) {
        totals[c.label] = (totals[c.label] || 0) + c.depenses;
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label);
  }, [filteredYears]);

  // ── ECharts option : stacked bar chart ──
  const chartOption = useMemo((): EChartsOption | null => {
    if (filteredYears.length === 0 || chapitresOrdered.length === 0) return null;

    const years = filteredYears.map(y => y.year.toString());

    // Build series: one per chapitre, stacked
    const series = chapitresOrdered.map((label) => ({
      name: label,
      type: 'bar' as const,
      stack: 'invest',
      barMaxWidth: isMobile ? 40 : 60,
      emphasis: { focus: 'series' as const },
      itemStyle: {
        color: getChapColor(label),
        borderRadius: 0,
      },
      data: filteredYears.map(y => {
        const chap = y.par_chapitre.find(c => c.label === label);
        return chap ? chap.depenses : 0;
      }),
    }));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.2)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: number;
            color: string;
          }>;
          if (!items || items.length === 0) return '';
          const yearData = filteredYears[items[0] ? (items[0] as unknown as { dataIndex: number }).dataIndex : 0];
          const total = yearData?.depenses_hors_dette || 0;

          let html = `<div style="font-weight:600;margin-bottom:6px">${yearData?.year} — ${formatEuroCompact(total)}</div>`;
          const sorted = [...items].sort((a, b) => (b.value || 0) - (a.value || 0));
          for (const item of sorted) {
            if (item.value > 0) {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
              html += `<div style="display:flex;gap:6px;align-items:center;margin:2px 0">`;
              html += `<span style="width:8px;height:8px;border-radius:2px;background:${item.color};flex-shrink:0"></span>`;
              html += `<span style="flex:1">${item.seriesName}</span>`;
              html += `<span style="font-weight:500">${formatEuroCompact(item.value)}</span>`;
              html += `<span style="color:#94a3b8;font-size:11px">(${pct}%)</span>`;
              html += `</div>`;
            }
          }
          return html;
        },
      },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 12,
        itemGap: isMobile ? 6 : 12,
        type: isMobile ? 'scroll' : 'plain',
      },
      grid: {
        top: 30,
        right: isMobile ? 10 : 20,
        bottom: isMobile ? 80 : 60,
        left: isMobile ? 10 : 20,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { color: '#94a3b8', fontSize: 12 },
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
          formatter: (v: number) => `${(v / 1e9).toFixed(1)} Md€`,
        },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
      },
      series,
    };
  }, [filteredYears, chapitresOrdered, isMobile]);

  // ── KPI calculations (réactif à la plage sélectionnée) ──
  const kpis = useMemo(() => {
    if (filteredYears.length < 2) return null;
    const latest = filteredYears[filteredYears.length - 1];
    const earliest = filteredYears[0];
    const prev = filteredYears[filteredYears.length - 2];

    const yoyPct = prev.depenses_hors_dette > 0
      ? ((latest.depenses_hors_dette - prev.depenses_hors_dette) / prev.depenses_hors_dette) * 100
      : 0;

    const periodPct = earliest.depenses_hors_dette > 0
      ? ((latest.depenses_hors_dette - earliest.depenses_hors_dette) / earliest.depenses_hors_dette) * 100
      : 0;

    const topSecteur = latest.par_chapitre[0];

    return {
      latestYear: latest.year,
      earliestYear: earliest.year,
      latestTotal: latest.depenses_hors_dette,
      yoyPct,
      periodPct,
      topSecteur: topSecteur?.label || '',
      topSecteurMontant: topSecteur?.depenses || 0,
      topSecteurPct: latest.depenses_hors_dette > 0
        ? (topSecteur?.depenses || 0) / latest.depenses_hors_dette * 100
        : 0,
    };
  }, [filteredYears]);

  // ── Variation data for horizontal bar ranking ──
  const variationItems = useMemo(() => {
    if (filteredYears.length < 2) return [];
    const latest = filteredYears[filteredYears.length - 1];
    const earliest = filteredYears[0];

    const items = chapitresOrdered.map(label => {
      const latestChap = latest.par_chapitre.find(c => c.label === label);
      const earliestChap = earliest.par_chapitre.find(c => c.label === label);
      const latestVal = latestChap?.depenses || 0;
      const earliestVal = earliestChap?.depenses || 0;
      const diff = latestVal - earliestVal;
      const diffPct = earliestVal > 0 ? (diff / earliestVal) * 100 : 0;
      return { label, latestVal, earliestVal, diff, diffPct };
    });

    // Sort: hausses first (desc), then baisses (asc) — same pattern as VariationRankChart
    const hausses = items.filter(i => i.diff >= 0).sort((a, b) => b.diff - a.diff);
    const baisses = items.filter(i => i.diff < 0).sort((a, b) => a.diff - b.diff);
    return [...hausses, ...baisses];
  }, [filteredYears, chapitresOrdered]);

  // ── ECharts option: horizontal bar ranking (variation chart) ──
  const variationChartOption = useMemo((): EChartsOption | null => {
    if (variationItems.length === 0) return null;

    const categories = variationItems.map(d => d.label);
    const values = variationItems.map(d => d.diff);
    const pcts = variationItems.map(d => d.diffPct);
    const maxVal = Math.max(...values.map(Math.abs));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.2)',
        borderWidth: 1,
        textStyle: { color: '#f1f5f9', fontSize: isMobile ? 11 : 12 },
        formatter: (params: unknown) => {
          const paramsArray = params as Array<{ dataIndex: number }>;
          if (!paramsArray?.length) return '';
          const item = variationItems[paramsArray[0].dataIndex];
          const color = item.diff >= 0 ? PALETTE.emerald : PALETTE.red;
          return `
            <div style="font-weight:600;margin-bottom:6px">${item.label}</div>
            <div style="display:flex;justify-content:space-between;gap:20px">
              <span>${startYear} :</span>
              <span>${formatEuroCompact(item.earliestVal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px">
              <span>${endYear} :</span>
              <span>${formatEuroCompact(item.latestVal)}</span>
            </div>
            <div style="border-top:1px solid rgba(148,163,184,0.3);margin-top:6px;padding-top:6px">
              <span style="color:${color};font-weight:600">
                ${formatVariation(item.diff)} (${item.diffPct >= 0 ? '+' : ''}${item.diffPct.toFixed(1)}%)
              </span>
            </div>
          `;
        },
      },
      grid: {
        left: isMobile ? '5%' : '3%',
        right: isMobile ? '18%' : '14%',
        top: 5,
        bottom: 5,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        min: -maxVal * 1.15,
        max: maxVal * 1.15,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: {
          lineStyle: { color: 'rgba(71,85,105,0.2)', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#94a3b8',
          fontSize: isMobile ? 10 : 12,
          width: isMobile ? 100 : 160,
          overflow: 'truncate',
          ellipsis: '...',
        },
      },
      series: [
        {
          type: 'bar',
          data: values.map((val) => ({
            value: val,
            itemStyle: {
              color: val >= 0
                ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                    { offset: 0, color: PALETTE.emerald },
                    { offset: 1, color: '#059669' },
                  ]}
                : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [
                    { offset: 0, color: '#dc2626' },
                    { offset: 1, color: PALETTE.red },
                  ]},
              borderRadius: val >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
            },
          })),
          barMaxWidth: isMobile ? 18 : 22,
          label: {
            show: true,
            position: 'right',
            formatter: (params) => {
              const p = params as { dataIndex: number; value: number };
              const pct = pcts[p.dataIndex];
              if (isMobile) {
                return `{a|${formatVariation(p.value)}}`;
              }
              return `{a|${formatVariation(p.value)}} {b|(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)}`;
            },
            rich: {
              a: { color: '#e2e8f0', fontSize: isMobile ? 10 : 11, fontWeight: 500 },
              b: { color: '#64748b', fontSize: isMobile ? 9 : 10 },
            },
          },
        },
      ],
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicOut',
    };
  }, [variationItems, startYear, endYear, isMobile]);

  /** Hauteur du variation chart (adaptative au nombre d'items) */
  const variationChartHeight = useMemo(() => {
    const itemH = isMobile ? 34 : 38;
    return Math.max(150, variationItems.length * itemH + 20);
  }, [variationItems.length, isMobile]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
        <div className="text-center py-12">
          <span className="text-4xl mb-4 block">⚠️</span>
          <p className="text-sm text-slate-400">{error || 'Données non disponibles'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Year Range Selector ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-slate-200">
          Tendances d&apos;investissement
        </h3>
        <YearRangeSelector
          availableYears={availableYears}
          startYear={startYear}
          endYear={endYear}
          onStartYearChange={setStartYear}
          onEndYearChange={setEndYear}
        />
      </div>

      {/* ── KPI Cards ── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total investissement */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Investissement {kpis.latestYear}</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100">
              {formatEuroCompact(kpis.latestTotal)}
            </p>
            <p className="text-xs text-slate-500 mt-1">hors opérations financières</p>
          </div>

          {/* Variation YoY */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">Variation annuelle</p>
            <p className={`text-xl sm:text-2xl font-bold ${kpis.yoyPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {kpis.yoyPct >= 0 ? '+' : ''}{kpis.yoyPct.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">vs {kpis.latestYear - 1}</p>
          </div>

          {/* Évolution période */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">
              Évolution {kpis.earliestYear}→{kpis.latestYear}
            </p>
            <p className={`text-xl sm:text-2xl font-bold ${kpis.periodPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {kpis.periodPct >= 0 ? '+' : ''}{kpis.periodPct.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">sur {filteredYears.length} exercices</p>
          </div>

          {/* Top secteur */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 mb-1">1er secteur</p>
            <p className="text-base sm:text-lg font-bold text-slate-100 truncate">
              {kpis.topSecteur}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatEuroCompact(kpis.topSecteurMontant)} ({kpis.topSecteurPct.toFixed(0)}%)
            </p>
          </div>
        </div>
      )}

      {/* ── Stacked Bar Chart ── */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">
          Dépenses d&apos;investissement par secteur
        </h3>
        {chartOption && (
          <ReactECharts
            option={chartOption}
            style={{ height: isMobile ? 320 : 400, width: '100%' }}
            opts={{ renderer: 'svg' }}
          />
        )}
        <p className="text-[10px] text-slate-500 mt-2">
          Source : Comptes Administratifs — Budget Principal (M57 Ville-Département). Hors opérations de dette et dotations.
        </p>
      </div>

      {/* ── Variation Ranking (horizontal bars) ── */}
      {variationChartOption && kpis && (
        <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
          {/* Header — same style as VariationRankChart */}
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-8 rounded-full bg-rose-500" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">
                Évolution par secteur ({kpis.earliestYear} → {kpis.latestYear})
              </h4>
              <p className="text-xs text-slate-500">
                Quels secteurs d&apos;investissement ont le plus évolué
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500" />
              <span>Hausse</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-500" />
              <span>Baisse</span>
            </div>
          </div>

          {/* Chart */}
          <ReactECharts
            option={variationChartOption}
            style={{ height: variationChartHeight, width: '100%' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>
      )}

      {/* ── Data Quality Note ── */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
        <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
          <span>ℹ️</span> À propos de ces données
        </h4>
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>
            Ces tendances proviennent du <strong className="text-slate-400">Budget Principal</strong> (Comptes Administratifs M57),
            qui reflète les dépenses <em>réellement exécutées</em> chaque année (2019-2024).
          </li>
          <li>
            Les opérations de dette (emprunts, remboursements) et dotations sont exclues pour refléter
            l&apos;investissement « réel » en équipements et infrastructures.
          </li>
          <li>
            L&apos;onglet « Explorer » utilise une source plus granulaire (Annexe Investissements Localisés + AP OpenData)
            qui détaille les projets individuels, mais avec un périmètre plus restreint.
          </li>
        </ul>
      </div>
    </div>
  );
}
