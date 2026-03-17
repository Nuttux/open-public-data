'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCityBudgetSankey, loadCityBudgetIndex } from '@/lib/api/villesData';
import { loadCityEvolution } from '@/lib/api/villesData';
import type { BudgetData } from '@/lib/formatters';
import type { CityEvolutionYear } from '@/lib/types/villes';
import type { YearIndex } from '@/lib/types/villes';
import BudgetSankey from '@/components/BudgetSankey';
import { formatEuroCompact } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';
import SourceLinks from '@/components/villes/SourceLinks';
import ExportBar from '@/components/shared/ExportBar';
import { KpiGridSkeleton, SankeySkeleton, TableSkeleton } from '@/components/villes/VillesSkeleton';
import type { CsvColumn } from '@/lib/export';

export default function CityBudgetPage({
  params,
}: {
  params: Promise<{ 'city-slug': string }>;
}) {
  const { 'city-slug': slug } = use(params);
  const t = useT();
  const city = getCityBySlug(slug);

  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [yearIndex, setYearIndex] = useState<YearIndex | null>(null);
  const [evolution, setEvolution] = useState<CityEvolutionYear[] | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'annuel' | 'tendances'>('annuel');

  // Load index
  const loadData = useCallback(() => {
    setError(null);
    loadCityBudgetIndex(slug)
      .then((idx) => {
        setYearIndex(idx);
        if (idx.latestYear) setSelectedYear(idx.latestYear);
        else if (idx.availableYears.length > 0) setSelectedYear(idx.availableYears[0]);
      })
      .catch(() => setError(t('villes.erreur_chargement')));

    loadCityEvolution(slug)
      .then(setEvolution)
      .catch(() => {});
  }, [slug, t]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load sankey for selected year
  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);
    loadCityBudgetSankey(slug, selectedYear)
      .then(setBudgetData)
      .catch(() => {
        setBudgetData(null);
        setError(t('villes.erreur_chargement'));
      })
      .finally(() => setLoading(false));
  }, [slug, selectedYear, t]);

  if (!city) return null;

  // CSV columns for evolution export
  const evolutionCsvColumns: CsvColumn<Record<string, unknown>>[] = [
    { key: 'year', label: t('villes.annee') },
    { key: 'recettes_totales', label: t('villes.recettes'), format: (v) => v != null ? String(v) : '' },
    { key: 'depenses_totales', label: t('villes.depenses'), format: (v) => v != null ? String(v) : '' },
    { key: 'solde', label: t('villes.solde'), format: (v) => v != null ? String(v) : '' },
    { key: 'epargne_brute', label: t('villes.epargne_brute'), format: (v) => v != null ? String(v) : '' },
  ];

  const evolutionData = evolution
    ? [...evolution].sort((a, b) => b.year - a.year).map(row => ({
        year: row.year,
        recettes_totales: row.recettes_totales,
        depenses_totales: row.depenses_totales,
        solde: row.solde,
        epargne_brute: row.epargne_brute,
      } as Record<string, unknown>))
    : [];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('annuel')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'annuel' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('villes.annuel')}
        </button>
        <button
          onClick={() => setActiveTab('tendances')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'tendances' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('villes.tendances')}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-center h-32 rounded-xl bg-rose-900/10 border border-rose-500/20">
          <div className="text-center">
            <p className="text-rose-400 text-sm mb-2">{error}</p>
            <button
              onClick={loadData}
              className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {t('villes.reessayer')}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'annuel' && (
        <>
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
                      y === selectedYear
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* KPI cards */}
          {loading ? (
            <KpiGridSkeleton count={3} />
          ) : budgetData ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">{t('villes.recettes')}</div>
                <div className="text-lg font-bold text-emerald-400">
                  {formatEuroCompact(budgetData.totals.recettes)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">{t('villes.depenses')}</div>
                <div className="text-lg font-bold text-rose-400">
                  {formatEuroCompact(budgetData.totals.depenses)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">{t('villes.solde')}</div>
                <div className={`text-lg font-bold ${budgetData.totals.solde >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatEuroCompact(budgetData.totals.solde)}
                </div>
              </div>
            </div>
          ) : null}

          {/* Sankey */}
          {loading ? (
            <SankeySkeleton />
          ) : budgetData ? (
            <BudgetSankey data={budgetData} />
          ) : !error ? (
            <div className="flex items-center justify-center h-64 text-slate-500">
              {t('villes.no_data')}
            </div>
          ) : null}
        </>
      )}

      {activeTab === 'tendances' && (
        <div className="space-y-4">
          {evolution ? (
            <>
              <ExportBar
                csvData={evolutionData}
                csvColumns={evolutionCsvColumns}
                filename={`budget-evolution-${slug}`}
              />
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6">
                <h3 className="text-base font-semibold text-slate-200 mb-4">
                  {t('villes.evolution_budgetaire')} — {city.name}
                </h3>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="min-w-[500px] px-4 sm:px-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-700/50">
                          <th className="text-left py-2 pr-4">{t('villes.annee')}</th>
                          <th className="text-right py-2 px-2">{t('villes.recettes')}</th>
                          <th className="text-right py-2 px-2">{t('villes.depenses')}</th>
                          <th className="text-right py-2 px-2">{t('villes.solde')}</th>
                          <th className="text-right py-2 pl-2">{t('villes.epargne_brute')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...evolution].sort((a, b) => b.year - a.year).map((row) => (
                          <tr key={row.year} className="border-b border-slate-700/30">
                            <td className="py-2 pr-4 font-medium text-slate-200">{row.year}</td>
                            <td className="py-2 px-2 text-right text-emerald-400">
                              {row.recettes_totales ? formatEuroCompact(row.recettes_totales) : '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-rose-400">
                              {row.depenses_totales ? formatEuroCompact(row.depenses_totales) : '—'}
                            </td>
                            <td className={`py-2 px-2 text-right ${(row.solde ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {row.solde != null ? formatEuroCompact(row.solde) : '—'}
                            </td>
                            <td className="py-2 pl-2 text-right text-blue-400">
                              {row.epargne_brute != null ? formatEuroCompact(row.epargne_brute) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <TableSkeleton rows={5} />
          )}
        </div>
      )}

      <SourceLinks sources={['dgfip', 'ofgl']} />
    </div>
  );
}
