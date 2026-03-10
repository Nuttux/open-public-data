'use client';

import { useEffect, useState, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCitySubventions, loadCitySubventionsIndex } from '@/lib/api/villesData';
import type { CitySubventionsData, YearIndex } from '@/lib/types/villes';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';

export default function CitySubventionsPage({
  params,
}: {
  params: Promise<{ 'city-slug': string }>;
}) {
  const { 'city-slug': slug } = use(params);
  const t = useT();
  const city = getCityBySlug(slug);

  const [data, setData] = useState<CitySubventionsData | null>(null);
  const [yearIndex, setYearIndex] = useState<YearIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCitySubventionsIndex(slug)
      .then((idx) => {
        setYearIndex(idx);
        if (idx.availableYears.length > 0) setSelectedYear(idx.availableYears[0]);
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    loadCitySubventions(slug, selectedYear)
      .then(setData)
      .catch(() => setData(null))
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
      ) : data ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Montant total</div>
              <div className="text-lg font-bold text-amber-400">
                {data.total_montant ? formatEuroCompact(data.total_montant) : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Nb subventions</div>
              <div className="text-lg font-bold text-slate-200">{formatNumber(data.nb_subventions)}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Bénéficiaires</div>
              <div className="text-lg font-bold text-slate-200">{formatNumber(data.nb_beneficiaires)}</div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 text-sm text-amber-400/80">
            Données nationales : uniquement les subventions &gt; 23 000 € (obligation de publication SCDL)
          </div>

          {/* Beneficiaries table */}
          {data.beneficiaires.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Principaux bénéficiaires</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700/50">
                      <th className="text-left py-2 pr-2">Bénéficiaire</th>
                      <th className="text-right py-2 px-2">Montant</th>
                      <th className="text-left py-2 pl-2 hidden sm:table-cell">Objet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.beneficiaires.slice(0, 30).map((b, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-2 pr-2 text-slate-300 max-w-[200px] truncate">{b.beneficiaire}</td>
                        <td className="py-2 px-2 text-right text-amber-400 whitespace-nowrap">
                          {b.montant ? formatEuroCompact(b.montant) : '—'}
                        </td>
                        <td className="py-2 pl-2 text-slate-400 max-w-[300px] truncate hidden sm:table-cell">
                          {b.objet || '—'}
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
