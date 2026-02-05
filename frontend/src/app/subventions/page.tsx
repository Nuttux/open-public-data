'use client';

/**
 * Page Subventions - Explorer les bénéficiaires de subventions
 * 
 * FEATURES:
 * - Treemap interactif par thématique
 * - Table filtrable des bénéficiaires
 * - Filtres par type d'organisme, direction, montant
 * - Sélecteur d'année
 * - Warnings qualité données (2020-2021 dégradés)
 * 
 * SOURCES:
 * - Data: /public/data/subventions/treemap_{year}.json
 * - Data: /public/data/subventions/beneficiaires_{year}.json
 * - Index: /public/data/subventions/index.json
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import YearSelector from '@/components/YearSelector';
import DataQualityBanner from '@/components/DataQualityBanner';
import SubventionsTreemap, { type TreemapData } from '@/components/SubventionsTreemap';
import SubventionsFilters, { type SubventionFilters, DEFAULT_FILTERS } from '@/components/SubventionsFilters';
import SubventionsTable, { type Beneficiaire } from '@/components/SubventionsTable';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';

/**
 * Index des subventions (métadonnées)
 */
interface SubventionsIndex {
  generated_at: string;
  source: string;
  available_years: number[];
  totals_by_year: Record<string, { montant_total: number; nb_subventions: number }>;
  filters: {
    thematiques: string[];
    natures_juridiques: string[];
    directions: string[];
  };
}

/**
 * Données treemap d'une année
 */
interface TreemapResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_thematiques: number;
  data: TreemapData['data'];
}

/**
 * Données bénéficiaires d'une année
 */
interface BeneficiairesResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_beneficiaires: number;
  data: Beneficiaire[];
}

export default function SubventionsPage() {
  // État index
  const [index, setIndex] = useState<SubventionsIndex | null>(null);
  
  // État année
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  
  // Données
  const [treemapData, setTreemapData] = useState<TreemapData | null>(null);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  
  // Filtres
  const [filters, setFilters] = useState<SubventionFilters>(DEFAULT_FILTERS);
  
  // Chargement
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charger l'index au démarrage
   */
  useEffect(() => {
    async function loadIndex() {
      try {
        const response = await fetch('/data/subventions/index.json');
        if (!response.ok) throw new Error('Impossible de charger l\'index');
        
        const data: SubventionsIndex = await response.json();
        setIndex(data);
        
        // Sélectionner la dernière année disponible
        if (data.available_years.length > 0) {
          setSelectedYear(data.available_years[0]);
        }
      } catch (err) {
        console.error('Error loading index:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoadingIndex(false);
      }
    }
    
    loadIndex();
  }, []);

  /**
   * Charger les données quand l'année change
   */
  useEffect(() => {
    async function loadYearData() {
      if (!index) return;
      
      setIsLoadingData(true);
      setError(null);
      
      try {
        // Charger treemap et bénéficiaires en parallèle
        const [treemapRes, beneficiairesRes] = await Promise.all([
          fetch(`/data/subventions/treemap_${selectedYear}.json`),
          fetch(`/data/subventions/beneficiaires_${selectedYear}.json`),
        ]);
        
        if (!treemapRes.ok || !beneficiairesRes.ok) {
          throw new Error(`Données ${selectedYear} non disponibles`);
        }
        
        const treemap: TreemapResponse = await treemapRes.json();
        const benefs: BeneficiairesResponse = await beneficiairesRes.json();
        
        setTreemapData({
          year: treemap.year,
          total_montant: treemap.total_montant,
          nb_thematiques: treemap.nb_thematiques,
          data: treemap.data,
        });
        
        setBeneficiaires(benefs.data);
        
        // Reset filtres quand on change d'année
        setFilters(DEFAULT_FILTERS);
        
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setTreemapData(null);
        setBeneficiaires([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadYearData();
  }, [index, selectedYear]);

  /**
   * Gestion du clic sur une thématique du treemap
   */
  const handleThematiqueClick = useCallback((thematique: string | null) => {
    setFilters(prev => ({ ...prev, thematique }));
  }, []);

  /**
   * Directions disponibles (depuis index)
   */
  const availableDirections = useMemo(() => {
    return index?.filters?.directions || [];
  }, [index]);

  /**
   * Statistiques filtrées
   */
  const stats = useMemo(() => {
    const total = beneficiaires.length;
    const montantTotal = beneficiaires.reduce((sum, b) => sum + b.montant_total, 0);
    
    // Appliquer les filtres pour compter
    let filtered = beneficiaires;
    
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(b => 
        b.beneficiaire.toLowerCase().includes(search) ||
        (b.siret && b.siret.includes(search))
      );
    }
    
    if (filters.thematique) {
      filtered = filtered.filter(b => b.thematique === filters.thematique);
    }
    
    if (filters.typesOrganisme.length > 0) {
      const NATURE_TO_TYPE: Record<string, string> = {
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
      filtered = filtered.filter(b => {
        const type = NATURE_TO_TYPE[b.nature_juridique || ''] || 'autre';
        return filters.typesOrganisme.includes(type);
      });
    }
    
    if (filters.directions.length > 0) {
      filtered = filtered.filter(b => 
        b.direction && filters.directions.includes(b.direction)
      );
    }
    
    // Filtre plage de montant
    if (filters.montantMin > 0) {
      filtered = filtered.filter(b => b.montant_total >= filters.montantMin);
    }
    if (filters.montantMax > 0) {
      filtered = filtered.filter(b => b.montant_total <= filters.montantMax);
    }
    
    const montantFiltered = filtered.reduce((sum, b) => sum + b.montant_total, 0);
    
    return {
      total,
      filtered: filtered.length,
      montantTotal,
      montantFiltered,
    };
  }, [beneficiaires, filters]);

  // Écran de chargement initial
  if (isLoadingIndex) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement des subventions...</p>
        </div>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">❌ Erreur lors du chargement des données</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <span className="text-3xl">💰</span>
                Subventions {selectedYear}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Explorer les bénéficiaires par thématique et filtres
              </p>
            </div>
            
            <YearSelector
              years={index.available_years}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Warning qualité données */}
        <DataQualityBanner dataset="subventions" year={selectedYear} />
        
        {/* Erreur */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        {/* Info sur la couverture des données */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
          <span className="text-blue-400 mt-0.5">ℹ️</span>
          <div className="text-sm text-blue-300">
            <p>
              <strong>Couverture :</strong> Cette page présente les <strong>top {stats.total} bénéficiaires</strong> par montant, 
              couvrant <strong>{treemapData?.total_montant && stats.montantTotal 
                ? `~${((stats.montantTotal / treemapData.total_montant) * 100).toFixed(0)}%` 
                : '~97%'}</strong> du total des subventions versées.
            </p>
            <p className="text-xs text-blue-400/70 mt-1">
              Note : Les années 2020 et 2021 ne sont pas disponibles (données bénéficiaires absentes de la source OpenData Paris).
            </p>
          </div>
        </div>

        {/* Stats rapides - Affiche le total de l'année + stats filtrées */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {/* Total année (fixe) */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total {selectedYear}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              {formatEuroCompact(treemapData?.total_montant || 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatNumber(index.totals_by_year[String(selectedYear)]?.nb_subventions || 0)} subventions
            </p>
          </div>
          
          {/* Montant filtré */}
                      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Montant affiché</p>
                        <p className="text-2xl font-bold text-purple-400 mt-1">
                          {formatEuroCompact(stats.montantFiltered)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {stats.montantFiltered > 0 && treemapData?.total_montant 
                            ? `${((stats.montantFiltered / treemapData.total_montant) * 100).toFixed(0)}% des subventions versées`
                            : '-'
                          }
                        </p>
                      </div>
          
          {/* Bénéficiaires affichés */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Bénéficiaires affichés</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">
              {formatNumber(stats.filtered)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              sur {formatNumber(stats.total)} top bénéficiaires
            </p>
          </div>
          
          {/* Thématiques */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Thématiques</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              {filters.thematique ? 1 : (treemapData?.nb_thematiques || 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {filters.thematique ? `Filtre: ${filters.thematique}` : 'Toutes'}
            </p>
          </div>
        </div>

        {/* Layout principal */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar filtres */}
          <div className="lg:col-span-1 space-y-4">
            <SubventionsFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableDirections={availableDirections}
              stats={stats}
            />
          </div>

          {/* Contenu principal */}
          <div className="lg:col-span-3 space-y-6">
            {/* Treemap */}
            {isLoadingData ? (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Chargement...</p>
                </div>
              </div>
            ) : treemapData ? (
              <SubventionsTreemap
                data={treemapData}
                onThematiqueClick={handleThematiqueClick}
                selectedThematique={filters.thematique}
                height={400}
              />
            ) : null}

            {/* Table bénéficiaires */}
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <span>📋</span>
                Top {formatNumber(stats.total)} bénéficiaires
                <span className="text-sm font-normal text-slate-400">
                  (par montant total de subventions)
                </span>
              </h3>
              <SubventionsTable
                data={beneficiaires}
                filters={filters}
                isLoading={isLoadingData}
                pageSize={50}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>
              Données: Open Data Paris - Subventions associations votées
            </p>
            <p>
              Classification: Pattern matching (73.9%) + LLM (20.9%) + Mapping directions (4.5%)
            </p>
            <p className="text-slate-600">
              Années avec données complètes: {index.available_years.filter(y => y !== 2020 && y !== 2021).join(', ')}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
