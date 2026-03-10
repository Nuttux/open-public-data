'use client';

import { useEffect, useState, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCityBilan, loadCityBilanIndex } from '@/lib/api/villesData';
import type { CityBilanData, YearIndex } from '@/lib/types/villes';
import { formatEuroCompact, formatPercent } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';

export default function CityPatrimoinePage({
  params,
}: {
  params: Promise<{ 'city-slug': string }>;
}) {
  const { 'city-slug': slug } = use(params);
  const t = useT();
  const city = getCityBySlug(slug);

  const [bilanData, setBilanData] = useState<CityBilanData | null>(null);
  const [yearIndex, setYearIndex] = useState<YearIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCityBilanIndex(slug)
      .then((idx) => {
        setYearIndex(idx);
        if (idx.availableYears.length > 0) setSelectedYear(idx.availableYears[0]);
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    loadCityBilan(slug, selectedYear)
      .then(setBilanData)
      .catch(() => setBilanData(null))
      .finally(() => setLoading(false));
  }, [slug, selectedYear]);

  if (!city) return null;

  return (
    <div className="space-y-6">
      {/* Year selector */}
      {yearIndex && yearIndex.availableYears.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Année :</span>
          <div className="flex gap-1 flex-wrap">
            {yearIndex.availableYears.map((y) => (
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

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-500">Chargement...</div>
      ) : bilanData ? (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {bilanData.totals.actif_total != null && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Actif total</div>
                <div className="text-lg font-bold text-emerald-400">{formatEuroCompact(bilanData.totals.actif_total)}</div>
              </div>
            )}
            {bilanData.totals.dette_financiere != null && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Dette financière</div>
                <div className="text-lg font-bold text-amber-400">{formatEuroCompact(bilanData.totals.dette_financiere)}</div>
              </div>
            )}
            {bilanData.totals.fonds_propres != null && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Fonds propres</div>
                <div className="text-lg font-bold text-blue-400">{formatEuroCompact(bilanData.totals.fonds_propres)}</div>
              </div>
            )}
            {bilanData.kpis.dette_par_hab != null && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Dette / habitant</div>
                <div className="text-lg font-bold text-amber-400">{formatEuroCompact(bilanData.kpis.dette_par_hab)}</div>
              </div>
            )}
          </div>

          {/* Ratios */}
          {(bilanData.kpis.ratio_endettement != null || bilanData.kpis.pct_fonds_propres != null) && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Ratios financiers</h3>
              <div className="grid grid-cols-2 gap-4">
                {bilanData.kpis.ratio_endettement != null && (
                  <div>
                    <div className="text-xs text-slate-400">Ratio d&apos;endettement</div>
                    <div className="text-base font-medium text-slate-200">{bilanData.kpis.ratio_endettement.toFixed(1)} %</div>
                  </div>
                )}
                {bilanData.kpis.pct_fonds_propres != null && (
                  <div>
                    <div className="text-xs text-slate-400">Part fonds propres</div>
                    <div className="text-base font-medium text-slate-200">{bilanData.kpis.pct_fonds_propres.toFixed(1)} %</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-500">{t('villes.no_data')}</div>
      )}

      <p className="text-xs text-slate-500">{t('villes.source_nationale')}</p>
    </div>
  );
}
