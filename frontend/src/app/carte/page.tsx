'use client';

/**
 * Page Carte - Vue géographique des données budgétaires
 * 
 * FEATURES:
 * - Carte interactive de Paris avec Leaflet
 * - Mode Points: subventions, logements sociaux
 * - Mode Choroplèthe: données per capita par arrondissement
 * - Filtres par année, thématique
 * 
 * SOURCES:
 * - Subventions: opendata.paris.fr/subventions-associations-votees-
 * - Logements: opendata.paris.fr/logements-sociaux-finances-a-paris
 * - Investissements: opendata.paris.fr/comptes-administratifs-autorisations-de-programmes-*
 * - Géoloc SIRET: recherche-entreprises.api.gouv.fr
 * - Population: INSEE 2021
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import MapFilters from '@/components/map/MapFilters';
import type { Subvention, LogementSocial, MapLayerType, ArrondissementStats } from '@/lib/types/map';
import { 
  loadLogementsSociaux,
  loadArrondissementsStats,
  loadSubventionsIndex,
  loadSubventionsForYear,
} from '@/lib/api/staticData';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { DATA_SOURCES } from '@/lib/constants/arrondissements';

/**
 * Import dynamique de la carte (Leaflet nécessite window)
 */
const ParisMap = dynamic(
  () => import('@/components/map/ParisMap'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chargement de la carte...</p>
        </div>
      </div>
    ),
  }
);

export default function CartePage() {
  // État des filtres
  const [availableYears, setAvailableYears] = useState<number[]>([2024, 2023, 2022, 2021, 2020, 2019]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [activeLayers, setActiveLayers] = useState<MapLayerType[]>(['subventions', 'logements']);
  const [availableThematiques, setAvailableThematiques] = useState<string[]>([]);
  const [selectedThematiques, setSelectedThematiques] = useState<string[]>([]);
  
  // Mode choroplèthe
  const [showChoropleth, setShowChoropleth] = useState(false);
  const [choroplethMetric, setChoroplethMetric] = useState<'subventions' | 'logements' | 'investissements'>('logements');
  
  // Données (chargées depuis fichiers statiques)
  const [subventions, setSubventions] = useState<Subvention[]>([]);
  const [logements, setLogements] = useState<LogementSocial[]>([]);
  const [arrondissementsStats, setArrondissementsStats] = useState<ArrondissementStats[]>([]);
  
  // État de chargement
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Sélection
  const [selectedId, setSelectedId] = useState<string | undefined>();

  /**
   * Charger les données statiques au démarrage
   */
  useEffect(() => {
    async function loadInitialData() {
      setIsLoadingData(true);
      setError(null);
      
      try {
        const [logementsData, arrStats, subIndex] = await Promise.all([
          loadLogementsSociaux(),
          loadArrondissementsStats(),
          loadSubventionsIndex(),
        ]);
        
        setLogements(logementsData);
        setArrondissementsStats(arrStats);
        setAvailableYears(subIndex.availableYears);
        setAvailableThematiques(subIndex.thematiques || []);
        setSelectedThematiques(subIndex.thematiques || []);
        
        if (subIndex.availableYears.length > 0) {
          setSelectedYear(subIndex.availableYears[0]);
        }
      } catch (err) {
        console.error('Erreur chargement données initiales:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadInitialData();
  }, []);

  /**
   * Charger les subventions quand l'année change
   */
  useEffect(() => {
    async function loadYearData() {
      if (!activeLayers.includes('subventions') && !showChoropleth) {
        return;
      }
      
      try {
        const subData = await loadSubventionsForYear(selectedYear);
        setSubventions(subData);
      } catch (err) {
        console.warn(`Pas de données subventions pour ${selectedYear}`);
        setSubventions([]);
      }
    }
    
    loadYearData();
  }, [selectedYear, activeLayers, showChoropleth]);

  /**
   * Subventions filtrées par thématique
   */
  const filteredSubventions = useMemo(() => {
    if (selectedThematiques.length === 0 || selectedThematiques.length === availableThematiques.length) {
      return subventions;
    }
    return subventions.filter(s => s.thematique && selectedThematiques.includes(s.thematique));
  }, [subventions, selectedThematiques, availableThematiques]);

  /**
   * Statistiques calculées
   */
  const stats = useMemo(() => {
    const geolocatedSubs = filteredSubventions.filter(s => s.coordinates);
    
    return {
      subventions: {
        count: filteredSubventions.length,
        total: filteredSubventions.reduce((sum, s) => sum + s.montant, 0),
        geolocated: geolocatedSubs.length,
      },
      logements: {
        count: logements.length,
        total: logements.reduce((sum, l) => sum + l.nbLogements, 0),
      },
    };
  }, [filteredSubventions, logements]);

  /**
   * Gestion du clic sur un marqueur
   */
  const handleMarkerClick = useCallback((type: 'subvention' | 'logement', id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <span className="text-3xl">🗺️</span>
              Carte Paris
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Vue géographique des subventions et logements sociaux
            </p>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar filtres */}
          <div className="lg:col-span-1">
            <MapFilters
              availableYears={availableYears}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              activeLayers={activeLayers}
              onLayersChange={setActiveLayers}
              availableThematiques={availableThematiques}
              selectedThematiques={selectedThematiques}
              onThematiquesChange={setSelectedThematiques}
              showChoropleth={showChoropleth}
              onChoroplethChange={setShowChoropleth}
              choroplethMetric={choroplethMetric}
              onChoroplethMetricChange={setChoroplethMetric}
              isLoading={isLoadingData}
              stats={stats}
            />
          </div>

          {/* Carte */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="h-[600px]">
                <ParisMap
                  subventions={filteredSubventions}
                  logements={logements}
                  arrondissementStats={arrondissementsStats}
                  showSubventions={!showChoropleth && activeLayers.includes('subventions')}
                  showLogements={!showChoropleth && activeLayers.includes('logements')}
                  showChoropleth={showChoropleth}
                  choroplethMetric={choroplethMetric}
                  onMarkerClick={handleMarkerClick}
                  selectedId={selectedId}
                  isLoading={isLoadingData}
                />
              </div>
            </div>

            {/* Stats rapides sous la carte */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500">Subventions affichées</p>
                <p className="text-lg font-bold text-purple-400">
                  {formatNumber(stats.subventions.geolocated)}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500">Montant total</p>
                <p className="text-lg font-bold text-purple-400">
                  {formatEuroCompact(stats.subventions.total)}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500">Programmes logement</p>
                <p className="text-lg font-bold text-emerald-400">
                  {formatNumber(stats.logements.count)}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500">Logements financés</p>
                <p className="text-lg font-bold text-emerald-400">
                  {formatNumber(stats.logements.total)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer avec sources */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <span>📚</span>
              Sources des données
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <a 
                href={DATA_SOURCES.subventions.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-purple-400">💰</span>
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.subventions.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.subventions.description}</p>
                </div>
              </a>
              <a 
                href={DATA_SOURCES.logementsSociaux.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-emerald-400">🏠</span>
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.logementsSociaux.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.logementsSociaux.description}</p>
                </div>
              </a>
              <a 
                href={DATA_SOURCES.autorisationsProgrammes.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-amber-400">📋</span>
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.autorisationsProgrammes.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.autorisationsProgrammes.description}</p>
                </div>
              </a>
              <a 
                href={DATA_SOURCES.siretGeoloc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-blue-400">📍</span>
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.siretGeoloc.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.siretGeoloc.description}</p>
                </div>
              </a>
              <a 
                href={DATA_SOURCES.population.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-cyan-400">👥</span>
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.population.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.population.description}</p>
                </div>
              </a>
              <a 
                href={DATA_SOURCES.arrondissements.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-slate-400">🗺️</span>
                <div>
                  <p className="text-slate-300 font-medium">{DATA_SOURCES.arrondissements.nom}</p>
                  <p className="text-slate-500">{DATA_SOURCES.arrondissements.description}</p>
                </div>
              </a>
            </div>
          </div>
          <p className="text-xs text-slate-600 text-center">
            Toutes les données proviennent de sources publiques et sont mises à jour périodiquement.
          </p>
        </footer>
      </div>
    </div>
  );
}
