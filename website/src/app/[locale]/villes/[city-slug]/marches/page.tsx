'use client';

import { useEffect, useState, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCityMarches, loadCityMarchesIndex } from '@/lib/api/villesData';
import type { CityMarchesData, YearIndex } from '@/lib/types/villes';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';

export default function CityMarchesPage({
  params,
}: {
  params: Promise<{ 'city-slug': string }>;
}) {
  const { 'city-slug': slug } = use(params);
  const t = useT();
  const city = getCityBySlug(slug);

  const [marchesData, setMarchesData] = useState<CityMarchesData | null>(null);
  const [yearIndex, setYearIndex] = useState<YearIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCityMarchesIndex(slug)
      .then((idx) => {
        setYearIndex(idx);
        if (idx.availableYears.length > 0) setSelectedYear(idx.availableYears[0]);
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    loadCityMarches(slug, selectedYear)
      .then(setMarchesData)
      .catch(() => setMarchesData(null))
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
      ) : marchesData ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Montant total</div>
              <div className="text-lg font-bold text-orange-400">{formatEuroCompact(marchesData.total_montant)}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Nb marchés</div>
              <div className="text-lg font-bold text-slate-200">{formatNumber(marchesData.total_marches)}</div>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Par catégorie</h3>
            <div className="space-y-2">
              {marchesData.categories.map((cat) => {
                const pct = marchesData.total_montant > 0 ? ((cat.montant_total ?? 0) / marchesData.total_montant) * 100 : 0;
                return (
                  <div key={cat.categorie}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{cat.categorie}</span>
                      <span className="text-slate-400">
                        {cat.montant_total ? formatEuroCompact(cat.montant_total) : '—'} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top contracts */}
          {marchesData.top_marches.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Principaux marchés</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700/50">
                      <th className="text-left py-2 pr-2">Objet</th>
                      <th className="text-right py-2 px-2">Montant</th>
                      <th className="text-left py-2 pl-2 hidden sm:table-cell">Titulaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marchesData.top_marches.slice(0, 20).map((m, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-2 pr-2 text-slate-300 max-w-xs truncate">{m.objet || '—'}</td>
                        <td className="py-2 px-2 text-right text-orange-400 whitespace-nowrap">
                          {m.montant ? formatEuroCompact(m.montant) : '—'}
                        </td>
                        <td className="py-2 pl-2 text-slate-400 max-w-[200px] truncate hidden sm:table-cell">
                          {m.titulaire || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
