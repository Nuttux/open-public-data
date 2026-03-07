'use client';

/**
 * MarchesTable - Table des marchés publics
 *
 * Features:
 * - Tri par colonne (montant, objet, fournisseur, nature)
 * - Pagination (50 par page)
 * - Badge multi-attributaire
 * - Responsive (scroll horizontal sur mobile)
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import type { MarchesFilters } from './MarchesFilters';
import { NATURE_LABELS } from './MarchesFilters';
import { useT, useLocale } from '@/lib/localeContext';

/**
 * Données d'un marché public
 */
export interface MarchePublic {
  numero_marche: string;
  objet: string;
  nature: string;
  fournisseur_nom: string;
  fournisseur_siret: string;
  montant_min: number;
  montant_max: number;
  date_notification: string | null;
  duree_jours: number | null;
  categorie_libelle: string;
  perimetre_financier: string;
  is_multiattributaire: boolean;
}

type SortColumn = 'objet' | 'fournisseur_nom' | 'montant_max' | 'nature' | 'duree_jours';
type SortDirection = 'asc' | 'desc';

interface MarchesTableProps {
  data: MarchePublic[];
  filters: MarchesFilters;
  isLoading?: boolean;
  pageSize?: number;
}

/** Couleurs par nature */
const NATURE_COLORS: Record<string, string> = {
  'SERVICES': '#3b82f6',
  'TRAVAUX': '#f97316',
  'FOURNITURE': '#f59e0b',
};

function formatDuration(days: number | null): string {
  if (!days) return '-';
  if (days < 365) return `${days}j`;
  const years = Math.floor(days / 365);
  const rem = days % 365;
  if (rem < 30) return `${years}a`;
  const months = Math.round(rem / 30);
  return `${years}a ${months}m`;
}

/** Nettoie les objets de marchés publics pour un affichage lisible */
function cleanObjet(raw: string): string {
  let text = raw;
  text = text.replace(/^SA\d+[._\s-][\w._-]+[\s:]+/i, '');
  text = text.replace(/^SA\d+\s+\w+\s+\w+[_\s]+/i, '');
  text = text.replace(/^\d+\s*:\s*/, '');
  text = text.replace(/_/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
  return text || raw;
}

export default function MarchesTable({
  data,
  filters,
  isLoading = false,
  pageSize = 50,
}: MarchesTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('montant_max');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const t = useT();
  const { locale } = useLocale();

  const filteredData = useMemo(() => {
    let result = [...data];

    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(m =>
        m.objet.toLowerCase().includes(s) ||
        m.fournisseur_nom.toLowerCase().includes(s) ||
        (m.fournisseur_siret && m.fournisseur_siret.includes(s)) ||
        (m.numero_marche && m.numero_marche.includes(s))
      );
    }
    if (filters.natures.length > 0) {
      result = result.filter(m => filters.natures.includes(m.nature));
    }
    if (filters.categories.length > 0) {
      result = result.filter(m => filters.categories.includes(m.categorie_libelle));
    }
    if (filters.montantMin > 0) {
      result = result.filter(m => m.montant_max >= filters.montantMin);
    }
    if (filters.montantMax > 0) {
      result = result.filter(m => m.montant_max <= filters.montantMax);
    }

    return result;
  }, [data, filters]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'objet':
          cmp = a.objet.localeCompare(b.objet, 'fr');
          break;
        case 'fournisseur_nom':
          cmp = a.fournisseur_nom.localeCompare(b.fournisseur_nom, 'fr');
          break;
        case 'montant_max':
          cmp = a.montant_max - b.montant_max;
          break;
        case 'nature':
          cmp = a.nature.localeCompare(b.nature, 'fr');
          break;
        case 'duree_jours':
          cmp = (a.duree_jours || 0) - (b.duree_jours || 0);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredData, sortColumn, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  }, [sortColumn]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const SortableHeader = ({ column, label, className = '' }: { column: SortColumn; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(column)}
      className={`px-2 md:px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-100 transition-colors ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column && (
          <span className="text-teal-400">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-8">
        <div className="text-center">
          <p className="text-slate-400">{t('marches.no_results')}</p>
          <p className="text-sm text-slate-400 mt-1">{t('marches.no_results_hint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-slate-100">
            {formatNumber(sortedData.length)} {sortedData.length > 1 ? t('marches.contracts_shown') : t('marches.contract_shown')}
          </h3>
          <p className="text-xs text-slate-400">
            {t('marches.total_envelope')} {formatEuroCompact(sortedData.reduce((s, m) => s + m.montant_max, 0))}
          </p>
        </div>
        <div className="text-sm text-slate-400">
          {t('common.page')} {currentPage} / {totalPages}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800/30">
            <tr>
              <SortableHeader column="objet" label={t('marches.col.contract')} className="min-w-[120px] md:min-w-[250px]" />
              <SortableHeader column="fournisseur_nom" label={t('marches.col.supplier')} className="min-w-[100px]" />
              <SortableHeader column="montant_max" label={t('marches.col.envelope')} />
              <SortableHeader column="duree_jours" label={t('marches.col.duration')} className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {paginatedData.map((m, index) => (
              <tr
                key={`${m.numero_marche}-${index}`}
                className={`hover:bg-slate-800/30 transition-colors ${index % 2 === 1 ? 'bg-slate-800/30' : ''}`}
              >
                {/* Marché */}
                <td className="px-2 md:px-4 py-3">
                  <div className="min-w-[100px] md:min-w-[200px]">
                    <p className="font-medium text-slate-100 text-xs md:text-sm line-clamp-2">
                      {m.categorie_libelle || cleanObjet(m.objet)}
                    </p>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-0.5 line-clamp-1" title={m.objet}>
                      {cleanObjet(m.objet)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: NATURE_COLORS[m.nature] || '#64748b' }}
                      />
                      <span className="text-[10px] text-slate-400">
                        {t(NATURE_LABELS[m.nature]) || m.nature}
                        {m.date_notification && ` · ${new Date(m.date_notification).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')}`}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Fournisseur */}
                <td className="px-2 md:px-4 py-3">
                  {m.is_multiattributaire ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] md:text-xs font-medium bg-amber-50 text-amber-400">
                      {t('marches.multi_attr')}
                    </span>
                  ) : (
                    <p className="text-xs md:text-sm text-slate-400 line-clamp-2" title={m.fournisseur_nom}>
                      {m.fournisseur_nom}
                    </p>
                  )}
                </td>

                {/* Enveloppe max */}
                <td className="px-2 md:px-4 py-3 text-right">
                  <p className="font-semibold text-teal-400 tabular-nums text-xs md:text-sm">
                    {formatEuroCompact(m.montant_max)}
                  </p>
                  {m.montant_min > 0 && m.montant_min !== m.montant_max && (
                    <p className="text-[10px] md:text-xs text-slate-400">
                      min {formatEuroCompact(m.montant_min)}
                    </p>
                  )}
                </td>

                {/* Durée */}
                <td className="hidden md:table-cell px-4 py-3">
                  <span className="text-sm text-slate-400">
                    {formatDuration(m.duree_jours)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ← {t('common.prev')}
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 text-sm font-medium rounded transition-colors ${
                    currentPage === pageNum
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-slate-300 hover:text-slate-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.next')} →
          </button>
        </div>
      )}
    </div>
  );
}
