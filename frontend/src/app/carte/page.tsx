'use client';

/**
 * Page Carte - Vue géographique des données budgétaires
 * 
 * FEATURES:
 * - Carte interactive de Paris avec Leaflet
 * - Mode Points: subventions, logements sociaux
 * - Mode Choroplèthe: données per capita par arrondissement
 * - Filtres par année, thématique
 * - Hyperliens vers sources de données
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
import { formatEuroCompact } from '@/lib/formatters';
import { getDirectionName } from '@/lib/constants/directions';
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
          <div className="lg:col-span-1 space-y-4">
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

            {/* Info box avec sources */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <span>📚</span>
                Sources des données
              </h3>
              <div className="text-xs text-slate-400 space-y-2">
                <p>
                  <a 
                    href={DATA_SOURCES.subventions.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    Subventions aux associations
                  </a>
                  {' '}(Paris Open Data)
                </p>
                <p>
                  <a 
                    href={DATA_SOURCES.logementsSociaux.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 underline"
                  >
                    Logements sociaux financés
                  </a>
                  {' '}(Paris Open Data)
                </p>
                <p>
                  <a 
                    href={DATA_SOURCES.siretGeoloc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Géolocalisation SIRET
                  </a>
                  {' '}(API Entreprises)
                </p>
                <p>
                  <a 
                    href={DATA_SOURCES.population.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline"
                  >
                    Population INSEE 2021
                  </a>
                </p>
              </div>
            </div>
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
                  {stats.subventions.geolocated}
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
                  {stats.logements.count.toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <p className="text-xs text-slate-500">Logements financés</p>
                <p className="text-lg font-bold text-emerald-400">
                  {stats.logements.total.toLocaleString('fr-FR')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer avec sources */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-500 text-center">
            Données:{' '}
            <a href={DATA_SOURCES.subventions.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">
              Open Data Paris
            </a>
            {' '}+{' '}
            <a href={DATA_SOURCES.siretGeoloc.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">
              API Recherche Entreprises
            </a>
            {' '}+{' '}
            <a href={DATA_SOURCES.population.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">
              INSEE
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
