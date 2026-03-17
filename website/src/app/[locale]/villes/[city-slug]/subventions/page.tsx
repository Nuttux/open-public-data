'use client';

import { useEffect, useState, useCallback, useMemo, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCitySubventions, loadCitySubventionsIndex } from '@/lib/api/villesData';
import type { CitySubventionsData, YearIndex } from '@/lib/types/villes';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';
import SourceLinks from '@/components/villes/SourceLinks';
import ExportBar from '@/components/shared/ExportBar';
import { KpiGridSkeleton, TableSkeleton } from '@/components/villes/VillesSkeleton';
import type { CsvColumn } from '@/lib/export';

type SortKey = 'beneficiaire' | 'montant' | 'objet';
type SortDir = 'asc' | 'desc';

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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('montant');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadIndex = useCallback(() => {
    setError(null);
    loadCitySubventionsIndex(slug)
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
    loadCitySubventions(slug, selectedYear)
      .then(setData)
      .catch(() => {
        setData(null);
        setError(t('villes.erreur_chargement'));
      })
      .finally(() => setLoading(false));
  }, [slug, selectedYear, t]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'montant' ? 'desc' : 'asc');
    }
  };

  const filteredBeneficiaires = useMemo(() => {
    if (!data) return [];
    let items = data.beneficiaires;
    if (filter) {
      const q = filter.toLowerCase();
      items = items.filter(b =>
        b.beneficiaire?.toLowerCase().includes(q) ||
        b.objet?.toLowerCase().includes(q)
      );
    }
    return [...items].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'montant') return ((a.montant ?? 0) - (b.montant ?? 0)) * dir;
      const av = (a[sortKey] ?? '').toLowerCase();
      const bv = (b[sortKey] ?? '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [data, filter, sortKey, sortDir]);

  if (!city) return null;

  const csvColumns: CsvColumn<Record<string, unknown>>[] = [
    { key: 'beneficiaire', label: t('villes.beneficiaire') },
    { key: 'montant', label: t('villes.montant'), format: (v) => v != null ? String(v) : '' },
    { key: 'objet', label: t('villes.objet') },
  ];

  const csvData = filteredBeneficiaires.map(b => ({
    beneficiaire: b.beneficiaire,
    montant: b.montant,
    objet: b.objet,
  } as Record<string, unknown>));

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
    <span className={`ml-1 text-[10px] ${active ? 'text-teal-400' : 'text-slate-600'}`}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
    </span>
  );

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
        <>
          <KpiGridSkeleton count={3} />
          <TableSkeleton />
        </>
      ) : data ? (
        <div className="space-y-4">
          {/* Disclaimer — info style (blue, not amber) — BEFORE summary */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-900/15 border border-blue-500/20 text-sm text-blue-400/90">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('villes.disclaimer_subventions')}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.montant_total')}</div>
              <div className="text-lg font-bold text-amber-400">
                {data.total_montant ? formatEuroCompact(data.total_montant) : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.nb_subventions')}</div>
              <div className="text-lg font-bold text-slate-200">{formatNumber(data.nb_subventions)}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.beneficiaires')}</div>
              <div className="text-lg font-bold text-slate-200">{formatNumber(data.nb_beneficiaires)}</div>
            </div>
          </div>

          {/* Beneficiaries table */}
          {data.beneficiaires.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-300">{t('villes.principaux_beneficiaires')}</h3>
                <ExportBar csvData={csvData} csvColumns={csvColumns} filename={`subventions-${slug}-${selectedYear}`} />
              </div>

              {/* Filter */}
              <div className="mb-3">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('villes.filtrer')}
                  className="w-full sm:w-64 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>

              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-[500px] px-4 sm:px-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700/50">
                        <th
                          className="text-left py-2 pr-2 cursor-pointer hover:text-slate-200 select-none"
                          onClick={() => toggleSort('beneficiaire')}
                        >
                          {t('villes.beneficiaire')}
                          <SortIcon active={sortKey === 'beneficiaire'} dir={sortDir} />
                        </th>
                        <th
                          className="text-right py-2 px-2 cursor-pointer hover:text-slate-200 select-none"
                          onClick={() => toggleSort('montant')}
                        >
                          {t('villes.montant')}
                          <SortIcon active={sortKey === 'montant'} dir={sortDir} />
                        </th>
                        <th
                          className="text-left py-2 pl-2 hidden sm:table-cell cursor-pointer hover:text-slate-200 select-none"
                          onClick={() => toggleSort('objet')}
                        >
                          {t('villes.objet')}
                          <SortIcon active={sortKey === 'objet'} dir={sortDir} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBeneficiaires.slice(0, 30).map((b, i) => (
                        <tr key={i} className="border-b border-slate-700/30">
                          <td className="py-2 pr-2 text-slate-300 max-w-[200px] truncate" title={b.beneficiaire}>
                            {b.beneficiaire}
                          </td>
                          <td className="py-2 px-2 text-right text-amber-400 whitespace-nowrap">
                            {b.montant ? formatEuroCompact(b.montant) : '—'}
                          </td>
                          <td className="py-2 pl-2 text-slate-400 max-w-[300px] truncate hidden sm:table-cell" title={b.objet}>
                            {b.objet || '—'}
                          </td>
                        </tr>
                      ))}
                      {filteredBeneficiaires.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-500 text-sm">
                            {t('villes.no_data')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : !error ? (
        <div className="flex items-center justify-center h-64 text-slate-500">{t('villes.no_data')}</div>
      ) : null}

      <SourceLinks sources={['scdl']} />
    </div>
  );
}
