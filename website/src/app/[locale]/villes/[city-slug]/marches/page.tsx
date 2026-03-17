'use client';

import { useEffect, useState, useCallback, useMemo, use } from 'react';
import { getCityBySlug } from '@/lib/constants/cities';
import { loadCityMarches, loadCityMarchesIndex } from '@/lib/api/villesData';
import type { CityMarchesData, YearIndex } from '@/lib/types/villes';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';
import SourceLinks from '@/components/villes/SourceLinks';
import ExportBar from '@/components/shared/ExportBar';
import { KpiGridSkeleton, CategoryBarsSkeleton, TableSkeleton } from '@/components/villes/VillesSkeleton';
import type { CsvColumn } from '@/lib/export';

type SortKey = 'objet' | 'montant' | 'titulaire';
type SortDir = 'asc' | 'desc';

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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('montant');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadIndex = useCallback(() => {
    setError(null);
    loadCityMarchesIndex(slug)
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
    loadCityMarches(slug, selectedYear)
      .then(setMarchesData)
      .catch(() => {
        setMarchesData(null);
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

  const filteredMarches = useMemo(() => {
    if (!marchesData) return [];
    let items = marchesData.top_marches;
    if (filter) {
      const q = filter.toLowerCase();
      items = items.filter(m =>
        (m.objet?.toLowerCase().includes(q)) ||
        (m.titulaire?.toLowerCase().includes(q)) ||
        (m.categorie?.toLowerCase().includes(q))
      );
    }
    return [...items].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'montant') return ((a.montant ?? 0) - (b.montant ?? 0)) * dir;
      const av = (a[sortKey] ?? '').toLowerCase();
      const bv = (b[sortKey] ?? '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [marchesData, filter, sortKey, sortDir]);

  if (!city) return null;

  const csvColumns: CsvColumn<Record<string, unknown>>[] = [
    { key: 'objet', label: t('villes.objet') },
    { key: 'montant', label: t('villes.montant'), format: (v) => v != null ? String(v) : '' },
    { key: 'titulaire', label: t('villes.titulaire') },
    { key: 'categorie', label: t('villes.par_categorie') },
  ];

  const csvData = filteredMarches.map(m => ({
    objet: m.objet,
    montant: m.montant,
    titulaire: m.titulaire,
    categorie: m.categorie,
  } as Record<string, unknown>));

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
    <span className={`ml-1 text-[10px] ${active ? 'text-teal-400' : 'text-slate-600'}`}>
      {active ? (dir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
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
          <KpiGridSkeleton count={2} />
          <CategoryBarsSkeleton />
          <TableSkeleton />
        </>
      ) : marchesData ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.montant_total')}</div>
              <div className="text-lg font-bold text-orange-400">{formatEuroCompact(marchesData.total_montant)}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">{t('villes.nb_marches')}</div>
              <div className="text-lg font-bold text-slate-200">{formatNumber(marchesData.total_marches)}</div>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('villes.par_categorie')}</h3>
            <div className="space-y-2">
              {marchesData.categories.map((cat) => {
                const pct = marchesData.total_montant > 0 ? ((cat.montant_total ?? 0) / marchesData.total_montant) * 100 : 0;
                return (
                  <div key={cat.categorie}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{cat.categorie}</span>
                      <span className="text-slate-400">
                        {cat.montant_total ? formatEuroCompact(cat.montant_total) : '\u2014'} ({pct.toFixed(1)}%)
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

          {/* Top contracts with filter + sort */}
          {marchesData.top_marches.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-300">{t('villes.principaux_marches')}</h3>
                <ExportBar csvData={csvData} csvColumns={csvColumns} filename={`marches-${slug}-${selectedYear}`} />
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
                          onClick={() => toggleSort('objet')}
                        >
                          {t('villes.objet')}
                          <SortIcon active={sortKey === 'objet'} dir={sortDir} />
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
                          onClick={() => toggleSort('titulaire')}
                        >
                          {t('villes.titulaire')}
                          <SortIcon active={sortKey === 'titulaire'} dir={sortDir} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMarches.slice(0, 30).map((m, i) => (
                        <tr key={i} className="border-b border-slate-700/30">
                          <td className="py-2 pr-2 text-slate-300 max-w-xs truncate" title={m.objet}>{m.objet || '\u2014'}</td>
                          <td className="py-2 px-2 text-right text-orange-400 whitespace-nowrap">
                            {m.montant ? formatEuroCompact(m.montant) : '\u2014'}
                          </td>
                          <td className="py-2 pl-2 text-slate-400 max-w-[200px] truncate hidden sm:table-cell" title={m.titulaire}>
                            {m.titulaire || '\u2014'}
                          </td>
                        </tr>
                      ))}
                      {filteredMarches.length === 0 && (
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

      <SourceLinks sources={['decp']} />
    </div>
  );
}
