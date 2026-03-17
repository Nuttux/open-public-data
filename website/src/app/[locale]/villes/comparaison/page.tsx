'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useT, useLocale } from '@/lib/localeContext';
import { CITIES } from '@/lib/constants/cities';
import type { CityMeta } from '@/lib/constants/cities';
import { loadBenchmarking } from '@/lib/api/villesData';
import type { BenchmarkingData, CityKPIs } from '@/lib/types/villes';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import SourceLinks from '@/components/villes/SourceLinks';
import ExportBar from '@/components/shared/ExportBar';
import GlossaryTip from '@/components/villes/GlossaryTip';
import type { CsvColumn } from '@/lib/export';

// ── Metrics definition ──────────────────────────────────────────────────────

interface MetricDef {
  key: keyof CityKPIs;
  labelKey: string;
  fallbackLabel: string;
  glossaryKey?: string;
  format: (v: number) => string;
  /** higher is better? (false = lower is better, e.g. dette) */
  higherIsBetter: boolean;
  /** true if this metric is a ratio (not per-hab euro) — used for radar normalization */
  isRatio?: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: 'recettes_par_hab',
    labelKey: 'villes.comparaison.metric_recettes',
    fallbackLabel: 'Recettes/hab',
    format: (v) => formatEuroCompact(v),
    higherIsBetter: true,
  },
  {
    key: 'depenses_par_hab',
    labelKey: 'villes.comparaison.metric_depenses',
    fallbackLabel: 'Depenses/hab',
    format: (v) => formatEuroCompact(v),
    higherIsBetter: false,
  },
  {
    key: 'dette_par_hab',
    labelKey: 'villes.comparaison.metric_dette',
    fallbackLabel: 'Dette/hab',
    glossaryKey: 'villes.glossaire.dette_par_hab',
    format: (v) => formatEuroCompact(v),
    higherIsBetter: false,
  },
  {
    key: 'investissement_par_hab',
    labelKey: 'villes.comparaison.metric_invest',
    fallbackLabel: 'Invest./hab',
    format: (v) => formatEuroCompact(v),
    higherIsBetter: true,
  },
  {
    key: 'personnel_par_hab',
    labelKey: 'villes.comparaison.metric_personnel',
    fallbackLabel: 'Personnel/hab',
    format: (v) => formatEuroCompact(v),
    higherIsBetter: false,
  },
  {
    key: 'taux_epargne_brute',
    labelKey: 'villes.comparaison.metric_epargne',
    fallbackLabel: 'Taux epargne',
    glossaryKey: 'villes.glossaire.taux_epargne_brute',
    format: (v) => `${v.toFixed(1)} %`,
    higherIsBetter: true,
    isRatio: true,
  },
  {
    key: 'ratio_dette_recettes',
    labelKey: 'villes.comparaison.metric_ratio_dette',
    fallbackLabel: 'Ratio dette',
    glossaryKey: 'villes.glossaire.ratio_dette_recettes',
    format: (v) => `${v.toFixed(1)} %`,
    higherIsBetter: false,
    isRatio: true,
  },
];

// Radar uses a subset (only per-hab metrics, not ratios) for better visual
const RADAR_METRICS = METRICS.filter((m) => !m.isRatio);

// ── CSV types ───────────────────────────────────────────────────────────────

interface CsvRow extends Record<string, unknown> {
  metric: string;
  [city: string]: unknown;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ComparaisonPage() {
  const t = useT();
  const { locale } = useLocale();

  const [data, setData] = useState<BenchmarkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadBenchmarking()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setSelectedYear(d.latest_year);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── City toggle ─────────────────────────────────────────────────────────

  const toggleCity = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, slug];
    });
  }, []);

  // ── Selected city metadata & KPIs ───────────────────────────────────────

  const selectedCities: (CityMeta & { kpis: CityKPIs | null })[] = useMemo(() => {
    if (!data || !selectedYear) return [];
    return selectedSlugs
      .map((slug) => {
        const meta = CITIES.find((c) => c.slug === slug);
        const cityData = data.cities.find((c) => c.slug === slug);
        const kpis = cityData?.years[String(selectedYear)] ?? null;
        return meta ? { ...meta, kpis } : null;
      })
      .filter(Boolean) as (CityMeta & { kpis: CityKPIs | null })[];
  }, [data, selectedYear, selectedSlugs]);

  const canCompare = selectedCities.length >= 2;

  // ── Best value per metric ───────────────────────────────────────────────

  const bestValues = useMemo(() => {
    if (!canCompare) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const metric of METRICS) {
      const values = selectedCities
        .map((c) => (c.kpis?.[metric.key] as number) ?? null)
        .filter((v): v is number => v !== null);
      if (values.length === 0) continue;
      const best = metric.higherIsBetter ? Math.max(...values) : Math.min(...values);
      map.set(metric.key, best);
    }
    return map;
  }, [canCompare, selectedCities]);

  // ── Radar chart option ──────────────────────────────────────────────────

  const radarOption: EChartsOption = useMemo(() => {
    if (!canCompare || !selectedYear) return {};

    const maxValues = RADAR_METRICS.map((metric) =>
      Math.max(
        ...selectedCities.map((c) => (c.kpis?.[metric.key] as number) ?? 0),
        1,
      ),
    );

    const indicator = RADAR_METRICS.map((metric, i) => ({
      name: metric.fallbackLabel,
      max: maxValues[i] * 1.15,
    }));

    const series = selectedCities.map((city) => ({
      name: city.name,
      value: RADAR_METRICS.map((m) => (city.kpis?.[m.key] as number) ?? 0),
      lineStyle: { color: city.color, width: 2.5 },
      areaStyle: { color: city.color, opacity: 0.08 },
      itemStyle: { color: city.color },
      symbol: 'circle' as const,
      symbolSize: 6,
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8,
        data: selectedCities.map((c) => c.name),
      },
      radar: {
        indicator,
        shape: 'polygon',
        radius: '62%',
        center: ['50%', '45%'],
        splitNumber: 4,
        axisName: { color: '#94a3b8', fontSize: 11 },
        splitArea: { areaStyle: { color: ['transparent'] } },
        splitLine: { lineStyle: { color: '#334155' } },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      series: [{ type: 'radar', data: series }],
    };
  }, [canCompare, selectedYear, selectedCities]);

  // ── CSV export data ─────────────────────────────────────────────────────

  const csvRows: CsvRow[] = useMemo(() => {
    if (!canCompare) return [];
    return METRICS.map((metric) => {
      const row: CsvRow = { metric: metric.fallbackLabel };
      for (const city of selectedCities) {
        const val = city.kpis?.[metric.key] as number | null;
        row[city.name] = val != null ? metric.format(val) : '—';
      }
      return row;
    });
  }, [canCompare, selectedCities]);

  const csvColumns: CsvColumn<CsvRow>[] = useMemo(() => {
    const cols: CsvColumn<CsvRow>[] = [{ key: 'metric', label: 'Indicateur' }];
    for (const city of selectedCities) {
      cols.push({ key: city.name, label: city.name });
    }
    return cols;
  }, [selectedCities]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse text-slate-400">{t('common.loading')}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-slate-400">Erreur de chargement</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400 mb-6">
        <Link href={`/${locale}/villes`} className="hover:text-teal-400 transition-colors">
          {t('villes.breadcrumb_villes')}
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200">{t('villes.comparaison.title')}</span>
      </nav>

      {/* ── Title ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-2">
          {t('villes.comparaison.title')}
        </h1>
        <p className="text-slate-400 text-sm sm:text-base">
          {t('villes.comparaison.subtitle')}
        </p>
      </div>

      {/* ── Year selector ─────────────────────────────────────────────── */}
      {data.available_years.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-slate-500 font-medium mr-1">{t('common.year')}</span>
          <div className="flex flex-wrap gap-1.5">
            {data.available_years
              .slice()
              .sort((a, b) => b - a)
              .map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                    selectedYear === yr
                      ? 'bg-teal-600/20 border-teal-500/40 text-teal-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {yr}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── City selector ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-slate-300 mb-3">
          {t('villes.comparaison.selectionner')}
          <span className="text-slate-500 font-normal ml-2">
            ({selectedSlugs.length}/3)
          </span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {CITIES.map((city) => {
            const isSelected = selectedSlugs.includes(city.slug);
            const isDisabled = !isSelected && selectedSlugs.length >= 3;
            return (
              <button
                key={city.slug}
                type="button"
                onClick={() => toggleCity(city.slug)}
                disabled={isDisabled}
                className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-all duration-200 ${
                  isSelected
                    ? 'border-current bg-slate-800 text-slate-100 ring-1 ring-current'
                    : isDisabled
                      ? 'border-slate-700/30 bg-slate-900/30 text-slate-600 cursor-not-allowed'
                      : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-slate-600 hover:text-slate-100'
                }`}
                style={isSelected ? { borderColor: city.color, '--tw-ring-color': city.color } as React.CSSProperties : undefined}
              >
                {/* Color dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: city.color }}
                />
                <span className="truncate font-medium">{city.name}</span>
                {/* Check icon */}
                {isSelected && (
                  <svg
                    className="w-4 h-4 ml-auto flex-shrink-0"
                    style={{ color: city.color }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Comparison content (only if >= 2 cities) ──────────────────── */}
      {!canCompare ? (
        <div className="py-16 text-center">
          <p className="text-slate-500 text-sm">{t('villes.comparaison.aucune')}</p>
        </div>
      ) : (
        <>
          {/* Export bar */}
          <ExportBar
            csvData={csvRows}
            csvColumns={csvColumns}
            filename={`comparaison-${selectedCities.map((c) => c.slug).join('-')}-${selectedYear}`}
          />

          {/* ── KPI Comparison Table ────────────────────────────────────── */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t('common.indicator') || 'Indicateur'}
                    </th>
                    {selectedCities.map((city) => (
                      <th key={city.slug} className="text-right px-4 py-3 min-w-[120px]">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: city.color }}
                          />
                          <span className="text-xs font-medium text-slate-300">{city.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((metric, idx) => (
                    <tr
                      key={metric.key}
                      className={`border-b border-slate-700/30 ${idx % 2 === 0 ? 'bg-slate-800/20' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-300 font-medium whitespace-nowrap">
                        <span className="flex items-center">
                          {t(metric.labelKey) || metric.fallbackLabel}
                          {metric.glossaryKey && <GlossaryTip termKey={metric.glossaryKey} />}
                        </span>
                      </td>
                      {selectedCities.map((city) => {
                        const val = city.kpis?.[metric.key] as number | null;
                        const isBest = val != null && val === bestValues.get(metric.key);
                        return (
                          <td
                            key={city.slug}
                            className={`px-4 py-3 text-right font-mono text-sm tabular-nums ${
                              isBest
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-200'
                            }`}
                          >
                            {val != null ? metric.format(val) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Radar Chart ─────────────────────────────────────────────── */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6 mb-8">
            <h2 className="text-base font-semibold text-slate-200 mb-4">
              {t('villes.benchmarking.radar_title') || 'Profil comparatif'}
            </h2>
            <ReactECharts
              option={radarOption}
              style={{ height: '400px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>

          {/* ── Source Links ────────────────────────────────────────────── */}
          <SourceLinks sources={['dgfip', 'ofgl']} />
        </>
      )}
    </div>
  );
}
