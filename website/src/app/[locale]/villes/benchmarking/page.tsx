'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/localeContext';
import { loadBenchmarking } from '@/lib/api/villesData';
import type { BenchmarkingData, CityKPIs } from '@/lib/types/villes';
import { CITIES } from '@/lib/constants/cities';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import BenchmarkingBars from '@/components/villes/BenchmarkingBars';
import Link from 'next/link';
import { useLocale } from '@/lib/localeContext';

const PER_CAPITA_METRICS: { key: keyof CityKPIs; labelKey: string; color: string; suffix: string }[] = [
  { key: 'recettes_par_hab', labelKey: 'villes.recettes_par_hab', color: '#10b981', suffix: ' €' },
  { key: 'depenses_par_hab', labelKey: 'villes.depenses_par_hab', color: '#f43f5e', suffix: ' €' },
  { key: 'dette_par_hab', labelKey: 'villes.dette_par_hab', color: '#f59e0b', suffix: ' €' },
  { key: 'investissement_par_hab', labelKey: 'villes.invest_par_hab', color: '#8b5cf6', suffix: ' €' },
  { key: 'personnel_par_hab', labelKey: 'villes.personnel_par_hab', color: '#3b82f6', suffix: ' €' },
  { key: 'fiscalite_par_hab', labelKey: 'villes.fiscalite_par_hab', color: '#14b8a6', suffix: ' €' },
];

const RATIO_METRICS: { key: keyof CityKPIs; labelKey: string; suffix: string }[] = [
  { key: 'taux_epargne_brute', labelKey: 'villes.taux_epargne', suffix: ' %' },
  { key: 'pct_personnel', labelKey: 'villes.pct_personnel', suffix: ' %' },
  { key: 'ratio_dette_recettes', labelKey: 'villes.ratio_dette', suffix: ' %' },
];

export default function BenchmarkingPage() {
  const t = useT();
  const { locale } = useLocale();
  const [data, setData] = useState<BenchmarkingData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    loadBenchmarking().then((d) => {
      setData(d);
      if (d.latest_year) setSelectedYear(d.latest_year);
    }).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64 text-slate-500">Chargement...</div>
      </div>
    );
  }

  // Get KPIs for selected year
  const getCityKPIs = (slug: string): CityKPIs | null => {
    const city = data.cities.find(c => c.slug === slug);
    if (!city || !selectedYear) return null;
    return city.years[String(selectedYear)] ?? null;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-2">
        <Link href={`/${locale}/villes`} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
          ← {t('villes.retour_villes')}
        </Link>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-2">
        {t('villes.benchmarking.title')}
      </h1>
      <p className="text-slate-400 mb-6">{t('villes.benchmarking.subtitle')}</p>

      {/* Year selector */}
      <div className="flex items-center gap-2 mb-8">
        <span className="text-sm text-slate-400">Année :</span>
        <div className="flex gap-1 flex-wrap">
          {data.available_years.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                y === selectedYear ? 'bg-teal-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6 mb-6 overflow-x-auto">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Vue d&apos;ensemble</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700/50">
              <th className="text-left py-2 pr-4">Ville</th>
              <th className="text-right py-2 px-2">Pop.</th>
              <th className="text-right py-2 px-2">Recettes/hab</th>
              <th className="text-right py-2 px-2">Dépenses/hab</th>
              <th className="text-right py-2 px-2">Dette/hab</th>
              <th className="text-right py-2 px-2">Invest./hab</th>
              <th className="text-right py-2 pl-2">Épargne</th>
            </tr>
          </thead>
          <tbody>
            {[...CITIES]
              .sort((a, b) => {
                const ka = getCityKPIs(a.slug);
                const kb = getCityKPIs(b.slug);
                return (kb?.recettes_par_hab ?? 0) - (ka?.recettes_par_hab ?? 0);
              })
              .map((city) => {
              const kpis = getCityKPIs(city.slug);
              const cityData = data.cities.find(c => c.slug === city.slug);
              return (
                <tr key={city.slug} className="border-b border-slate-700/30">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: city.color }} />
                      <Link
                        href={`/${locale}/villes/${city.slug}/budget`}
                        className="text-slate-200 hover:text-teal-400 transition-colors font-medium"
                      >
                        {city.name}
                      </Link>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right text-slate-400">
                    {formatNumber(cityData?.population ?? city.population)}
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-400">
                    {kpis?.recettes_par_hab != null ? `${formatNumber(kpis.recettes_par_hab, 0)} €` : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-rose-400">
                    {kpis?.depenses_par_hab != null ? `${formatNumber(kpis.depenses_par_hab, 0)} €` : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-amber-400">
                    {kpis?.dette_par_hab != null ? `${formatNumber(kpis.dette_par_hab, 0)} €` : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-violet-400">
                    {kpis?.investissement_par_hab != null ? `${formatNumber(kpis.investissement_par_hab, 0)} €` : '—'}
                  </td>
                  <td className="py-2 pl-2 text-right text-blue-400">
                    {kpis?.taux_epargne_brute != null ? `${kpis.taux_epargne_brute.toFixed(1)} %` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-capita bar charts — sorted by value */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {PER_CAPITA_METRICS.map((metric) => {
          const sorted = [...CITIES]
            .map((city) => {
              const kpis = getCityKPIs(city.slug);
              return { city, value: (kpis?.[metric.key] as number) ?? 0 };
            })
            .sort((a, b) => b.value - a.value);
          const maxValue = sorted[0]?.value ?? 0;

          return (
            <div key={metric.key} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-sm text-slate-400 mb-3">{t(metric.labelKey)}</h3>
              <div className="space-y-2">
                {sorted.map(({ city, value }) => (
                  <div key={city.slug}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">{city.name}</span>
                      <span className="text-slate-400 font-medium">
                        {value ? `${formatNumber(value, 0)}${metric.suffix}` : '—'}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: value && maxValue > 0 ? `${(value / maxValue) * 100}%` : '0%',
                          backgroundColor: city.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ratios — sorted by value */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Ratios financiers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {RATIO_METRICS.map((metric) => {
            const sorted = [...CITIES]
              .map((city) => {
                const kpis = getCityKPIs(city.slug);
                return { city, value: (kpis?.[metric.key] as number) ?? null };
              })
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

            return (
              <div key={metric.key}>
                <h3 className="text-sm text-slate-400 mb-3">{t(metric.labelKey)}</h3>
                <div className="space-y-2">
                  {sorted.map(({ city, value }) => (
                    <div key={city.slug} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: city.color }} />
                        <span className="text-slate-300">{city.name}</span>
                      </div>
                      <span className="text-slate-200 font-medium">
                        {value != null ? `${value.toFixed(1)}${metric.suffix}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Absolute values bar chart */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-200 mb-4">{t('villes.valeurs_absolues')}</h2>
        <BenchmarkingBars data={data} selectedYear={selectedYear} />
      </div>

      <p className="text-xs text-slate-500 text-center">{t('villes.source_nationale')}</p>
    </div>
  );
}
