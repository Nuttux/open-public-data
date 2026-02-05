'use client';

/**
 * SubventionsTable - Table des bénéficiaires de subventions
 * 
 * Features:
 * - Tri par colonne (montant, nom, thématique)
 * - Pagination (50 par page)
 * - Badge source de classification (pattern/direction/llm)
 * - Responsive (scroll horizontal sur mobile)
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor } from '@/lib/colors';
import type { SubventionFilters } from './SubventionsFilters';

/**
 * Données d'un bénéficiaire
 */
export interface Beneficiaire {
  annee: number;
  beneficiaire: string;
  beneficiaire_normalise: string;
  nature_juridique: string | null;
  direction: string | null;
  secteurs_activite: string | null;
  thematique: string;
  sous_categorie: string | null;
  source_thematique: 'pattern' | 'direction' | 'llm' | 'default';
  montant_total: number;
  nb_subventions: number;
  objet_principal: string | null;
  siret: string | null;
}

/**
 * Colonne de tri
 */
type SortColumn = 'beneficiaire' | 'thematique' | 'montant_total' | 'direction' | 'nature_juridique';
type SortDirection = 'asc' | 'desc';

interface SubventionsTableProps {
  /** Liste des bénéficiaires */
  data: Beneficiaire[];
  /** Filtres appliqués */
  filters: SubventionFilters;
  /** Chargement en cours */
  isLoading?: boolean;
  /** Nombre d'éléments par page */
  pageSize?: number;
}

/**
 * Labels pour les sources de classification
 */
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  pattern: { label: 'Auto', color: 'bg-emerald-500/20 text-emerald-400' },
  direction: { label: 'Dir.', color: 'bg-blue-500/20 text-blue-400' },
  llm: { label: 'IA', color: 'bg-purple-500/20 text-purple-400' },
  default: { label: '?', color: 'bg-slate-500/20 text-slate-400' },
};

/**
 * Mapping nature juridique → type simplifié
 */
const NATURE_TO_TYPE_MAP: Record<string, string> = {
  'Associations': 'association',
  'Etablissements publics': 'public',
  'Etablissements de droit public': 'public',
  'Autres personnes de droit public': 'public',
  'Etat': 'public',
  'Communes': 'public',
  'Département': 'public',
  'Régions': 'public',
  'Entreprises': 'entreprise',
  'Autres personnes de droit privé': 'prive_autre',
  'Personnes physiques': 'personne_physique',
  'Autres': 'autre',
};

export default function SubventionsTable({
  data,
  filters,
  isLoading = false,
  pageSize = 50,
}: SubventionsTableProps) {
  // État local
  const [sortColumn, setSortColumn] = useState<SortColumn>('montant_total');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * Appliquer les filtres
   */
  const filteredData = useMemo(() => {
    let result = [...data];

    // Filtre recherche
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(b => 
        b.beneficiaire.toLowerCase().includes(search) ||
        b.beneficiaire_normalise.toLowerCase().includes(search) ||
        (b.siret && b.siret.includes(search))
      );
    }

    // Filtre thématique
    if (filters.thematique) {
      result = result.filter(b => b.thematique === filters.thematique);
    }

    // Filtre types d'organismes
    if (filters.typesOrganisme.length > 0) {
      result = result.filter(b => {
        const type = NATURE_TO_TYPE_MAP[b.nature_juridique || ''] || 'autre';
        return filters.typesOrganisme.includes(type);
      });
    }

    // Filtre directions
    if (filters.directions.length > 0) {
      result = result.filter(b => 
        b.direction && filters.directions.includes(b.direction)
      );
    }

    // Filtre montant minimum
    if (filters.montantMin > 0) {
      result = result.filter(b => b.montant_total >= filters.montantMin);
    }

    return result;
  }, [data, filters]);

  /**
   * Trier les données
   */
  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'beneficiaire':
          comparison = a.beneficiaire.localeCompare(b.beneficiaire, 'fr');
          break;
        case 'thematique':
          comparison = a.thematique.localeCompare(b.thematique, 'fr');
          break;
        case 'montant_total':
          comparison = a.montant_total - b.montant_total;
          break;
        case 'direction':
          comparison = (a.direction || '').localeCompare(b.direction || '', 'fr');
          break;
        case 'nature_juridique':
          comparison = (a.nature_juridique || '').localeCompare(b.nature_juridique || '', 'fr');
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [filteredData, sortColumn, sortDirection]);

  /**
   * Pagination
   */
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  /**
   * Gestion du tri
   */
  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  }, [sortColumn]);

  /**
   * Reset page quand les filtres changent
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  /**
   * Rendu de l'en-tête de colonne triable
   */
  const SortableHeader = ({ column, label, className = '' }: { column: SortColumn; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(column)}
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 transition-colors ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column && (
          <span className="text-purple-400">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  // État de chargement
  if (isLoading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400">Chargement des données...</span>
        </div>
      </div>
    );
  }

  // Aucun résultat
  if (sortedData.length === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-8">
        <div className="text-center">
          <p className="text-slate-400">Aucun bénéficiaire ne correspond aux filtres.</p>
          <p className="text-sm text-slate-500 mt-1">Essayez de modifier vos critères de recherche.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header avec stats */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-slate-100">
            {formatNumber(sortedData.length)} bénéficiaire{sortedData.length > 1 ? 's' : ''}
          </h3>
          <p className="text-xs text-slate-500">
            Total: {formatEuroCompact(sortedData.reduce((sum, b) => sum + b.montant_total, 0))}
          </p>
        </div>
        
        {/* Pagination info */}
        <div className="text-sm text-slate-400">
          Page {currentPage} / {totalPages}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50">
            <tr>
              <SortableHeader column="beneficiaire" label="Bénéficiaire" className="min-w-[200px]" />
              <SortableHeader column="thematique" label="Thématique" />
              <SortableHeader column="montant_total" label="Montant" />
              <SortableHeader column="direction" label="Direction" />
              <SortableHeader column="nature_juridique" label="Nature" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Source
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {paginatedData.map((beneficiaire, index) => {
              const sourceInfo = SOURCE_LABELS[beneficiaire.source_thematique] || SOURCE_LABELS.default;
              
              return (
                <tr 
                  key={`${beneficiaire.beneficiaire_normalise}-${index}`}
                  className="hover:bg-slate-700/20 transition-colors"
                >
                  {/* Bénéficiaire */}
                  <td className="px-4 py-3">
                    <div className="min-w-[200px]">
                      <p className="font-medium text-slate-100 truncate" title={beneficiaire.beneficiaire}>
                        {beneficiaire.beneficiaire}
                      </p>
                      {beneficiaire.objet_principal && (
                        <p className="text-xs text-slate-500 truncate mt-0.5" title={beneficiaire.objet_principal}>
                          {beneficiaire.objet_principal}
                        </p>
                      )}
                    </div>
                  </td>
                  
                  {/* Thématique */}
                  <td className="px-4 py-3">
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: `${getThematiqueColor(beneficiaire.thematique)}20`,
                        color: getThematiqueColor(beneficiaire.thematique),
                      }}
                    >
                      {beneficiaire.thematique}
                    </span>
                    {beneficiaire.sous_categorie && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {beneficiaire.sous_categorie}
                      </p>
                    )}
                  </td>
                  
                  {/* Montant */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-100 tabular-nums">
                      {formatEuroCompact(beneficiaire.montant_total)}
                    </p>
                    {beneficiaire.nb_subventions > 1 && (
                      <p className="text-xs text-slate-500">
                        {beneficiaire.nb_subventions} subv.
                      </p>
                    )}
                  </td>
                  
                  {/* Direction */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-300">
                      {beneficiaire.direction || '-'}
                    </span>
                  </td>
                  
                  {/* Nature juridique */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-400">
                      {beneficiaire.nature_juridique || '-'}
                    </span>
                  </td>
                  
                  {/* Source classification */}
                  <td className="px-4 py-3">
                    <span 
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sourceInfo.color}`}
                      title={`Classifié par: ${beneficiaire.source_thematique}`}
                    >
                      {sourceInfo.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ← Précédent
          </button>
          
          <div className="flex items-center gap-1">
            {/* Afficher quelques pages autour de la page courante */}
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
                  className={`
                    w-8 h-8 text-sm font-medium rounded transition-colors
                    ${currentPage === pageNum
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-slate-400 hover:text-slate-200'
                    }
                  `}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
