'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useT } from '@/lib/localeContext';
import { CITIES } from '@/lib/constants/cities';
import { formatNumberCompact, formatEuroCompact } from '@/lib/formatters';
import { loadBenchmarking } from '@/lib/api/villesData';
import type { BenchmarkingData } from '@/lib/types/villes';

export default function VillesPage() {
  const { locale } = useLocale();
  const t = useT();
  const [benchmarking, setBenchmarking] = useState<BenchmarkingData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    loadBenchmarking()
      .then((d) => {
        setBenchmarking(d);
        if (d.latest_year) setSelectedYear(d.latest_year);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-2">
          {t('villes.title')}
        </h1>
        <p className="text-slate-400">
          {t('villes.subtitle')}
        </p>
      </div>

      {/* Benchmarking CTA */}
      <Link
        href={`/${locale}/villes/benchmarking`}
        className="block mb-8 p-4 sm:p-6 rounded-xl border border-teal-500/30 bg-teal-600/10 hover:bg-teal-600/20 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-teal-400 mb-1">
              {t('villes.benchmarking.title')}
            </h2>
            <p className="text-sm text-slate-400">
              {t('villes.benchmarking.subtitle')}
            </p>
          </div>
          <svg className="w-5 h-5 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>

      {/* Year selector */}
      {benchmarking && benchmarking.available_years.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-slate-400">Année :</span>
          <div className="flex gap-1 flex-wrap">
            {benchmarking.available_years.map((y) => (
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
      )}

      {/* City Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CITIES.map((city) => {
          const cityData = benchmarking?.cities.find(c => c.slug === city.slug);
          const yearData = selectedYear ? cityData?.years[String(selectedYear)] : null;

          return (
            <Link
              key={city.slug}
              href={`/${locale}/villes/${city.slug}/budget`}
              className="group p-5 rounded-xl border border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50 hover:bg-slate-800/80 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100 group-hover:text-white">
                    {city.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {formatNumberCompact(city.population)} {t('villes.population')}
                  </p>
                </div>
                <div
                  className="w-3 h-3 rounded-full mt-1.5"
                  style={{ backgroundColor: city.color }}
                />
              </div>

              {yearData ? (
                <div className="space-y-2">
                  <div className="text-xs text-slate-500 mb-1">
                    {t('villes.donnees')} {selectedYear}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('villes.recettes')}</span>
                    <span className="text-emerald-400 font-medium">
                      {yearData.recettes_fonctionnement ? formatEuroCompact(yearData.recettes_fonctionnement) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('villes.depenses')}</span>
                    <span className="text-rose-400 font-medium">
                      {yearData.depenses_fonctionnement ? formatEuroCompact(yearData.depenses_fonctionnement) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('villes.dette_par_hab')}</span>
                    <span className="text-amber-400 font-medium">
                      {yearData.dette_par_hab ? `${formatNumberCompact(yearData.dette_par_hab)} €` : '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 italic">
                  {t('villes.voir_budget')} →
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Source */}
      <p className="mt-8 text-xs text-slate-500 text-center">
        {t('villes.source_nationale')}
      </p>
    </div>
  );
}
