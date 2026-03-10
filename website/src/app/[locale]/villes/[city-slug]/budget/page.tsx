'use client';

import { useEffect, useState, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCityBudgetSankey, loadCityBudgetIndex } from '@/lib/api/villesData';
import { loadCityEvolution } from '@/lib/api/villesData';
import type { BudgetData } from '@/lib/formatters';
import type { CityEvolutionYear } from '@/lib/types/villes';
import type { YearIndex } from '@/lib/types/villes';
import BudgetSankey from '@/components/BudgetSankey';
import { formatEuroCompact } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';

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
  const [activeTab, setActiveTab] = useState<'annuel' | 'tendances'>('annuel');

  // Load index
  useEffect(() => {
    loadCityBudgetIndex(slug)
      .then((idx) => {
        setYearIndex(idx);
        if (idx.latestYear) setSelectedYear(idx.latestYear);
        else if (idx.availableYears.length > 0) setSelectedYear(idx.availableYears[0]);
      })
      .catch(() => {});

    loadCityEvolution(slug)
      .then(setEvolution)
      .catch(() => {});
  }, [slug]);

  // Load sankey for selected year
  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    loadCityBudgetSankey(slug, selectedYear)
      .then(setBudgetData)
      .catch(() => setBudgetData(null))
      .finally(() => setLoading(false));
  }, [slug, selectedYear]);

  if (!city) return null;

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
          Annuel
        </button>
        <button
          onClick={() => setActiveTab('tendances')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'tendances' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Tendances
        </button>
      </div>

      {activeTab === 'annuel' && (
        <>
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
          {budgetData && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Recettes</div>
                <div className="text-lg font-bold text-emerald-400">
                  {formatEuroCompact(budgetData.totals.recettes)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Dépenses</div>
                <div className="text-lg font-bold text-rose-400">
                  {formatEuroCompact(budgetData.totals.depenses)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-400 mb-1">Solde</div>
                <div className={`text-lg font-bold ${budgetData.totals.solde >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatEuroCompact(budgetData.totals.solde)}
                </div>
              </div>
            </div>
          )}

          {/* Sankey */}
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-500">
              Chargement...
            </div>
          ) : budgetData ? (
            <BudgetSankey data={budgetData} />
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-500">
              {t('villes.no_data')}
            </div>
          )}
        </>
      )}

      {activeTab === 'tendances' && evolution && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6">
            <h3 className="text-base font-semibold text-slate-200 mb-4">
              Évolution budgétaire — {city.name}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700/50">
                    <th className="text-left py-2 pr-4">Année</th>
                    <th className="text-right py-2 px-2">Recettes</th>
                    <th className="text-right py-2 px-2">Dépenses</th>
                    <th className="text-right py-2 px-2">Solde</th>
                    <th className="text-right py-2 pl-2">Épargne brute</th>
                  </tr>
                </thead>
                <tbody>
                  {evolution.sort((a, b) => b.year - a.year).map((row) => (
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
      )}

      {/* Source */}
      <p className="text-xs text-slate-500">{t('villes.source_nationale')}</p>
    </div>
  );
}
