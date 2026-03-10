'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCityBilan, loadCityBilanIndex } from '@/lib/api/villesData';
import type { CityBilanData, YearIndex } from '@/lib/types/villes';
import { formatEuroCompact } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';
import GlossaryTip from '@/components/villes/GlossaryTip';
import SourceLinks from '@/components/villes/SourceLinks';
import { KpiGridSkeleton } from '@/components/villes/VillesSkeleton';

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
  const [error, setError] = useState<string | null>(null);

  const loadIndex = useCallback(() => {
    setError(null);
    loadCityBilanIndex(slug)
      .then((idx) => {
        setYearIndex(idx);
        if (idx.availableYears.length > 0) setSelectedYear(idx.availableYears[0]);
      })
      .catch(() => setError(t('villes.erreur_chargement')));
  }, [slug, t]);

  useEffect(() => { loadIndex(); }, [loadIndex]);

  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);
    loadCityBilan(slug, selectedYear)
      .then(setBilanData)
      .catch(() => {
        setBilanData(null);
        setError(t('villes.erreur_chargement'));
      })
      .finally(() => setLoading(false));
  }, [slug, selectedYear, t]);

  if (!city) return null;

  return (
    <div className="space-y-6">
      {/* Year selector */}
      {yearIndex && yearIndex.availableYears.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">{t('villes.annee')} :</span>
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

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-center h-32 rounded-xl bg-rose-900/10 border border-rose-500/20">
          <div className="text-center">
            <p className="text-rose-400 text-sm mb-2">{error}</p>
            <button
              onClick={loadIndex}
              className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {t('villes.reessayer')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <KpiGridSkeleton count={4} />
      ) : bilanData ? (
        <div className="space-y-4">
          {/* KPIs — always render grid to avoid layout jank */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.actif_total')}</div>
              <div className="text-lg font-bold text-emerald-400">
                {bilanData.totals.actif_total != null ? formatEuroCompact(bilanData.totals.actif_total) : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1 flex items-center">
                {t('villes.dette_financiere')}
                <GlossaryTip termKey="villes.glossaire.dette_par_hab" />
              </div>
              <div className="text-lg font-bold text-amber-400">
                {bilanData.totals.dette_financiere != null ? formatEuroCompact(bilanData.totals.dette_financiere) : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1 flex items-center">
                {t('villes.fonds_propres')}
                <GlossaryTip termKey="villes.glossaire.fonds_propres" />
              </div>
              <div className="text-lg font-bold text-blue-400">
                {bilanData.totals.fonds_propres != null ? formatEuroCompact(bilanData.totals.fonds_propres) : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.dette_par_habitant')}</div>
              <div className="text-lg font-bold text-amber-400">
                {bilanData.kpis.dette_par_hab != null ? formatEuroCompact(bilanData.kpis.dette_par_hab) : '—'}
              </div>
            </div>
          </div>

          {/* Ratios */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('villes.ratios_financiers')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400 flex items-center">
                  {t('villes.ratio_endettement')}
                  <GlossaryTip termKey="villes.glossaire.ratio_endettement" />
                </div>
                <div className="text-base font-medium text-slate-200">
                  {bilanData.kpis.ratio_endettement != null ? `${bilanData.kpis.ratio_endettement.toFixed(1)} %` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 flex items-center">
                  {t('villes.part_fonds_propres')}
                  <GlossaryTip termKey="villes.glossaire.fonds_propres" />
                </div>
                <div className="text-base font-medium text-slate-200">
                  {bilanData.kpis.pct_fonds_propres != null ? `${bilanData.kpis.pct_fonds_propres.toFixed(1)} %` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !error ? (
        <div className="flex items-center justify-center h-64 text-slate-500">{t('villes.no_data')}</div>
      ) : null}

      <SourceLinks sources={['dgfip', 'ofgl']} />
    </div>
  );
}
