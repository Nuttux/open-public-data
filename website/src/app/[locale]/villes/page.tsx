'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useLocale, useT } from '@/lib/localeContext';
import { CITIES } from '@/lib/constants/cities';
import { formatNumberCompact, formatEuroCompact } from '@/lib/formatters';
import { loadBenchmarking } from '@/lib/api/villesData';
import type { BenchmarkingData } from '@/lib/types/villes';
import SourceLinks from '@/components/villes/SourceLinks';

export default function VillesPage() {
  const { locale } = useLocale();
  const t = useT();
  const [benchmarking, setBenchmarking] = useState<BenchmarkingData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadBenchmarking()
      .then((d) => {
        setBenchmarking(d);
        if (d.latest_year) setSelectedYear(d.latest_year);
      })
      .catch(() => setError(t('villes.erreur_chargement')));
  }, [t]);

  // Filter cities by search
  const filteredCities = useMemo(() => {
    if (!search) return CITIES;
    const q = search.toLowerCase();
    return CITIES.filter(c => c.name.toLowerCase().includes(q));
  }, [search]);

  // Trend indicator: compare revenue to previous year
  const getTrend = (slug: string): 'up' | 'down' | null => {
    if (!benchmarking || !selectedYear) return null;
    const city = benchmarking.cities.find(c => c.slug === slug);
    if (!city) return null;
    const current = city.years[String(selectedYear)]?.recettes_fonctionnement;
    const previous = city.years[String(selectedYear - 1)]?.recettes_fonctionnement;
    if (current == null || previous == null || previous === 0) return null;
    return current > previous ? 'up' : 'down';
  };

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

      {/* CTAs: Benchmarking + Comparaison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          href={`/${locale}/villes/benchmarking`}
          className="p-4 sm:p-5 rounded-xl border border-teal-500/30 bg-teal-600/10 hover:bg-teal-600/20 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-teal-400 mb-1">
                {t('villes.benchmarking.title')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('villes.benchmarking.subtitle')}
              </p>
            </div>
            <svg className="w-5 h-5 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link
          href={`/${locale}/villes/comparaison`}
          className="p-4 sm:p-5 rounded-xl border border-violet-500/30 bg-violet-600/10 hover:bg-violet-600/20 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-violet-400 mb-1">
                {t('villes.comparaison.title')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('villes.comparaison.cta_subtitle')}
              </p>
            </div>
            <svg className="w-5 h-5 text-violet-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center h-32 mb-6 rounded-xl bg-rose-900/10 border border-rose-500/20">
          <div className="text-center">
            <p className="text-rose-400 text-sm mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {t('villes.reessayer')}
            </button>
          </div>
        </div>
      )}

      {/* Controls: Year selector + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        {benchmarking && benchmarking.available_years.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">{t('villes.annee')} :</span>
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
        <div className="sm:ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('villes.rechercher_ville')}
            className="w-full sm:w-56 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {!benchmarking && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-5 rounded-xl border border-slate-700/50 bg-slate-800/50 animate-pulse">
              <div className="h-5 w-28 bg-slate-700/50 rounded mb-2" />
              <div className="h-3 w-20 bg-slate-700/30 rounded mb-4" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-slate-700/30 rounded" />
                <div className="h-3 w-full bg-slate-700/30 rounded" />
                <div className="h-3 w-3/4 bg-slate-700/30 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* City Cards Grid */}
      {benchmarking && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCities.map((city) => {
            const cityData = benchmarking.cities.find(c => c.slug === city.slug);
            const yearData = selectedYear ? cityData?.years[String(selectedYear)] : null;
            const trend = getTrend(city.slug);

            return (
              <Link
                key={city.slug}
                href={`/${locale}/villes/${city.slug}/budget`}
                className="group p-5 rounded-xl border border-slate-700/50 bg-slate-800/50 hover:border-teal-500/30 hover:bg-slate-800/80 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100 group-hover:text-teal-400 transition-colors flex items-center gap-2">
                      {city.name}
                      {trend && (
                        <span className={`text-xs ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trend === 'up' ? '▲' : '▼'}
                        </span>
                      )}
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
                ) : null}

                {/* Clickable footer */}
                <div className="mt-3 pt-3 border-t border-slate-700/30 flex items-center justify-between">
                  <span className="text-xs text-slate-500 group-hover:text-teal-400 transition-colors">
                    {t('villes.voir_budget')}
                  </span>
                  <svg className="w-4 h-4 text-slate-600 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}

          {filteredCities.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500">
              {t('villes.no_data')}
            </div>
          )}
        </div>
      )}

      {/* Source */}
      <SourceLinks sources={['dgfip', 'ofgl', 'decp']} />
    </div>
  );
}
