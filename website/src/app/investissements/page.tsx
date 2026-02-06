'use client';

/**
 * Page Investissements - Explorer les projets d'investissement de Paris
 * 
 * FEATURES:
 * - Vue liste: tableau des top projets par montant
 * - Vue carte: toggle pour visualiser sur la carte
 * - Filtres par année, thématique, arrondissement
 * - Indicateur de qualité géolocalisation (précis vs approximatif)
 * 
 * SOURCES:
 * - Data: /public/data/map/investissements_complet_{year}.json
 * - Index: /public/data/map/investissements_complet_index.json
 * - Origine: Fusion PDF "Investissements Localisés" + BigQuery OpenData
 */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import YearSelector from '@/components/YearSelector';
import { loadAutorisationsIndex, loadAutorisationsForYear } from '@/lib/api/staticData';
import type { AutorisationProgramme } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';

/**
 * Import dynamique de la carte (Leaflet nécessite window)
 */
const InvestissementsMap = dynamic(
  () => import('@/components/map/InvestissementsMap'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-[500px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chargement de la carte...</p>
        </div>
      </div>
    ),
  }
);

/**
 * Thématiques disponibles pour le filtre
 */
const THEMATIQUES = [
  'education',
  'sport', 
  'culture',
  'environnement',
  'mobilite',
  'logement',
  'social',
  'democratie',
  'urbanisme',
  'autre',
] as const;

/**
 * Budget total d'investissement par année (depuis evolution_budget.json)
 * Utilisé pour calculer le taux de couverture des projets localisables
 */
interface BudgetInvestYear {
  year: number;
  sections: {
    investissement: {
      depenses: number;
    };
  };
}

export default function InvestissementsPage() {
  // État vue (liste ou carte)
  const [viewMode, setViewMode] = useState<'liste' | 'carte'>('liste');
  
  // État année
  const [availableYears, setAvailableYears] = useState<number[]>([2024, 2023, 2022]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  
  // Filtres
  const [selectedThematiques, setSelectedThematiques] = useState<string[]>([]);
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreciseOnly, setShowPreciseOnly] = useState(false);
  
  // Données
  const [projets, setProjets] = useState<AutorisationProgramme[]>([]);
  
  // Budget total investissement par année (pour calculer couverture)
  const [budgetInvestByYear, setBudgetInvestByYear] = useState<Record<number, number>>({});
  
  // État de chargement
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charger l'index et les données de référence au démarrage
   */
  useEffect(() => {
    async function loadIndex() {
      try {
        // Charger index projets et budget total en parallèle
        const [index, evoResponse] = await Promise.all([
          loadAutorisationsIndex(),
          fetch('/data/evolution_budget.json'),
        ]);
        
        setAvailableYears(index.availableYears);
        if (index.availableYears.length > 0) {
          setSelectedYear(index.availableYears[0]);
        }
        
        // Extraire les dépenses d'investissement pour chaque année
        if (evoResponse.ok) {
          const evoData = await evoResponse.json();
          const budgetMap: Record<number, number> = {};
          evoData.years?.forEach((y: BudgetInvestYear) => {
            budgetMap[y.year] = y.sections?.investissement?.depenses || 0;
          });
          setBudgetInvestByYear(budgetMap);
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
      setIsLoadingData(true);
      setError(null);
      
      try {
        const data = await loadAutorisationsForYear(selectedYear);
        setProjets(data);
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setProjets([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadYearData();
  }, [selectedYear]);

  /**
   * Projets filtrés
   */
  const filteredProjets = useMemo(() => {
    let filtered = projets;
    
    // Filtre recherche
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.apTexte.toLowerCase().includes(search) ||
        p.missionTexte?.toLowerCase().includes(search)
      );
    }
    
    // Filtre thématiques
    if (selectedThematiques.length > 0) {
      filtered = filtered.filter(p => selectedThematiques.includes(p.thematique));
    }
    
    // Filtre arrondissement
    if (selectedArrondissement !== null) {
      filtered = filtered.filter(p => p.arrondissement === selectedArrondissement);
    }
    
    // Filtre géoloc précise uniquement
    if (showPreciseOnly) {
      filtered = filtered.filter(p => p.latitude && p.longitude);
    }
    
    return filtered;
  }, [projets, searchTerm, selectedThematiques, selectedArrondissement, showPreciseOnly]);

  /**
   * Projets triés par montant (pour la liste)
   */
  const sortedProjets = useMemo(() => {
    return [...filteredProjets].sort((a, b) => b.montant - a.montant);
  }, [filteredProjets]);

  /**
   * Statistiques
   */
  const stats = useMemo(() => {
    const total = projets.length;
    const totalMontant = projets.reduce((sum, p) => sum + p.montant, 0);
    const filtered = filteredProjets.length;
    const filteredMontant = filteredProjets.reduce((sum, p) => sum + p.montant, 0);
    const withPreciseGeo = projets.filter(p => p.latitude && p.longitude).length;
    const withArrondissement = projets.filter(p => p.arrondissement).length;
    
    return {
      total,
      totalMontant,
      filtered,
      filteredMontant,
      withPreciseGeo,
      withArrondissement,
      preciseRate: total > 0 ? ((withPreciseGeo / total) * 100).toFixed(0) : '0',
    };
  }, [projets, filteredProjets]);

  /**
   * Toggle une thématique
   */
  const toggleThematique = (thematique: string) => {
    setSelectedThematiques(prev => 
      prev.includes(thematique)
        ? prev.filter(t => t !== thematique)
        : [...prev, thematique]
    );
  };

  // Écran de chargement initial
  if (isLoadingIndex) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement des investissements...</p>
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
                <span className="text-3xl">🏗️</span>
                Investissements {selectedYear}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Projets d'équipements publics: écoles, piscines, voiries, parcs...
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Toggle Vue */}
              <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('liste')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'liste'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📋 Liste
                </button>
                <button
                  onClick={() => setViewMode('carte')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'carte'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🗺️ Carte
                </button>
              </div>
              
              <YearSelector
                years={availableYears}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Erreur */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        {/* Info couverture des données */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
          <span className="text-blue-400 mt-0.5">ℹ️</span>
          <div className="text-sm text-blue-300">
            <p>
              <strong>Couverture :</strong> Cette page présente les <strong>projets localisables</strong> (écoles, 
              piscines, parcs, voiries...), représentant{' '}
              <strong>
                {budgetInvestByYear[selectedYear] && stats.totalMontant > 0
                  ? `~${((stats.totalMontant / budgetInvestByYear[selectedYear]) * 100).toFixed(0)}%`
                  : '~10-15%'}
              </strong>{' '}
              du budget d&apos;investissement total ({budgetInvestByYear[selectedYear] 
                ? formatEuroCompact(budgetInvestByYear[selectedYear]) 
                : '~2 Md€'}).
            </p>
            <p className="text-xs text-blue-400/70 mt-1">
              Le reste comprend: programmes multi-sites, subventions d&apos;équipement, acquisitions citywide, systèmes informatiques.
            </p>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total {selectedYear}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              {formatEuroCompact(stats.totalMontant)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatNumber(stats.total)} projets
            </p>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Montant affiché</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {formatEuroCompact(stats.filteredMontant)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatNumber(stats.filtered)} projets filtrés
            </p>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Géoloc précise</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {stats.preciseRate}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatNumber(stats.withPreciseGeo)} projets
            </p>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Localisables</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              {stats.total > 0 ? ((stats.withArrondissement / stats.total) * 100).toFixed(0) : 0}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Avec arrondissement
            </p>
          </div>
        </div>

        {/* Layout principal */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar filtres */}
          <div className="lg:col-span-1 space-y-4">
            {/* Recherche */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                🔍 Rechercher
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nom du projet, équipement..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Filtre arrondissement */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                📍 Arrondissement
              </label>
              <select
                value={selectedArrondissement ?? ''}
                onChange={(e) => setSelectedArrondissement(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="">Tous les arrondissements</option>
                <option value="0">Paris Centre (1-4)</option>
                {Array.from({ length: 16 }, (_, i) => i + 5).map(arr => (
                  <option key={arr} value={arr}>{arr}ème</option>
                ))}
              </select>
            </div>

            {/* Filtre thématiques */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                🏷️ Thématiques
              </label>
              <div className="space-y-2">
                {THEMATIQUES.map(thematique => {
                  const label = THEMATIQUE_LABELS[thematique as ThematiqueSubvention];
                  const isSelected = selectedThematiques.includes(thematique);
                  const count = projets.filter(p => p.thematique === thematique).length;
                  
                  return (
                    <button
                      key={thematique}
                      onClick={() => toggleThematique(thematique)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                        isSelected
                          ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-900/30 text-slate-400 hover:bg-slate-900/50 border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{label?.icon || '📋'}</span>
                        <span>{label?.label || thematique}</span>
                      </span>
                      <span className="text-xs opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
              
              {selectedThematiques.length > 0 && (
                <button
                  onClick={() => setSelectedThematiques([])}
                  className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>

            {/* Filtre géoloc */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPreciseOnly}
                  onChange={(e) => setShowPreciseOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-300">
                  📍 Géoloc précise uniquement
                </span>
              </label>
              <p className="text-xs text-slate-500 mt-2 ml-7">
                Exclure les projets localisés par centroïde d'arrondissement
              </p>
            </div>
          </div>

          {/* Contenu principal */}
          <div className="lg:col-span-3">
            {isLoadingData ? (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 h-[500px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Chargement...</p>
                </div>
              </div>
            ) : viewMode === 'liste' ? (
              /* Vue Liste */
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Projet
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Chapitre
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Montant
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Arr.
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Géo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {sortedProjets.slice(0, 100).map((projet, index) => {
                        const isPrecise = projet.latitude && projet.longitude;
                        const themaLabel = THEMATIQUE_LABELS[projet.thematique as ThematiqueSubvention];
                        
                        return (
                          <tr 
                            key={projet.id}
                            className="hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <span className="text-slate-500 text-xs w-6">{index + 1}</span>
                                <div>
                                  <p className="text-sm text-slate-200 line-clamp-2">
                                    {projet.apTexte}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                    {themaLabel?.icon || '📋'}
                                    {themaLabel?.label || projet.thematique}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-slate-400 line-clamp-2">
                                {projet.missionTexte}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="text-sm font-semibold text-amber-400">
                                {formatEuroCompact(projet.montant)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {projet.arrondissement ? (
                                <span className="text-sm text-slate-300">
                                  {projet.arrondissement === 0 ? 'Centre' : projet.arrondissement}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isPrecise ? (
                                <span className="text-emerald-400" title={projet.adresse || 'Géolocalisation précise'}>
                                  📍
                                </span>
                              ) : projet.arrondissement ? (
                                <span className="text-orange-400" title="Centroïde arrondissement">
                                  📌
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {sortedProjets.length > 100 && (
                  <div className="px-4 py-3 border-t border-slate-700 text-center">
                    <p className="text-sm text-slate-500">
                      Affichage des 100 premiers projets sur {formatNumber(sortedProjets.length)}
                    </p>
                  </div>
                )}
                
                {sortedProjets.length === 0 && (
                  <div className="px-4 py-12 text-center">
                    <p className="text-slate-400">Aucun projet ne correspond aux filtres</p>
                  </div>
                )}
              </div>
            ) : (
              /* Vue Carte */
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="h-[600px]">
                  <InvestissementsMap
                    projets={filteredProjets}
                    isLoading={isLoadingData}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>
              Données: Comptes Administratifs - Annexe "Investissements Localisés" (PDF) + OpenData Paris
            </p>
            <p>
              Géocodage: API BAN (adresse.data.gouv.fr) + Lieux connus + Inférence contextuelle
            </p>
            <p className="text-slate-600">
              Années disponibles: {availableYears.join(', ')}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
