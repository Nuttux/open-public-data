'use client';

/**
 * Page Carte - Vue géographique des données budgétaires
 * 
 * FEATURES:
 * - Carte interactive de Paris avec Leaflet
 * - Layer Subventions (géolocalisées via SIRET)
 * - Layer Logements sociaux (déjà géolocalisés)
 * - Filtres par année et type de données
 * - Progression de géolocalisation en temps réel
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import MapFilters from '@/components/map/MapFilters';
import type { Subvention, LogementSocial, MapLayerType, ArrondissementStats } from '@/lib/types/map';
import { 
  loadLogementsSociaux,
  loadLogementsParArrondissement,
  loadSubventionsIndex,
  loadSubventionsForYear,
} from '@/lib/api/staticData';
import { formatEuroCompact } from '@/lib/formatters';

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
  // État des données
  const [availableYears, setAvailableYears] = useState<number[]>([2024, 2023, 2022, 2021, 2020, 2019]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [activeLayers, setActiveLayers] = useState<MapLayerType[]>(['logements', 'choropleth-subventions']);
  
  // Données (chargées depuis fichiers statiques)
  const [subventions, setSubventions] = useState<Subvention[]>([]);
  const [logements, setLogements] = useState<LogementSocial[]>([]);
  const [logementsParArr, setLogementsParArr] = useState<ArrondissementStats[]>([]);
  
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
        // Charger toutes les données statiques en parallèle
        const [logementsData, logementsArrData, yearsData] = await Promise.all([
          loadLogementsSociaux(),
          loadLogementsParArrondissement(),
          loadSubventionsIndex(),
        ]);
        
        setLogements(logementsData);
        setLogementsParArr(logementsArrData);
        setAvailableYears(yearsData);
        
        if (yearsData.length > 0) {
          setSelectedYear(yearsData[0]);
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
      if (!activeLayers.includes('subventions')) {
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
  }, [selectedYear, activeLayers]);

  /**
   * Statistiques calculées
   */
  const stats = useMemo(() => {
    const geolocatedSubs = subventions.filter(s => s.coordinates);
    
    return {
      subventions: {
        count: subventions.length,
        total: subventions.reduce((sum, s) => sum + s.montant, 0),
        geolocated: geolocatedSubs.length,
      },
      logements: {
        count: logements.length,
        total: logements.reduce((sum, l) => sum + l.nbLogements, 0),
      },
    };
  }, [subventions, logements]);

  /**
   * Stats par arrondissement pour la carte choroplèthe
   * Utilise les données pré-calculées
   */
  const arrondissementStats = useMemo((): ArrondissementStats[] => {
    // Si on a les données pré-calculées, les utiliser
    if (logementsParArr.length > 0) {
      return logementsParArr;
    }
    
    // Sinon calculer à partir des logements (fallback)
    const logementsByArr: Record<number, { total: number; count: number }> = {};
    logements.forEach(l => {
      if (!logementsByArr[l.arrondissement]) {
        logementsByArr[l.arrondissement] = { total: 0, count: 0 };
      }
      logementsByArr[l.arrondissement].total += l.nbLogements;
      logementsByArr[l.arrondissement].count += 1;
    });

    return Array.from({ length: 20 }, (_, i) => {
      const code = i + 1;
      const logStats = logementsByArr[code] || { total: 0, count: 0 };
      
      return {
        code,
        nom: `${code}${code === 1 ? 'er' : 'ème'} arrondissement`,
        totalSubventions: 0,
        nbSubventions: 0,
        totalLogements: logStats.total,
        nbProgrammesLogement: logStats.count,
        totalInvestissement: 0,
        nbAutorisations: 0,
      };
    });
  }, [logements, logementsParArr]);

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
              isLoading={isLoadingData}
              stats={stats}
            />

            {/* Info box */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <span>ℹ️</span>
                À propos des données
              </h3>
              <div className="text-xs text-slate-400 space-y-2">
                <p>
                  <strong className="text-purple-400">Subventions:</strong> Données Paris Open Data, 
                  géolocalisées via l&apos;API entreprises (SIRET).
                </p>
                <p>
                  <strong className="text-emerald-400">Logements:</strong> Programmes financés 
                  depuis 2001, coordonnées fournies par Paris.
                </p>
              </div>
            </div>
          </div>

          {/* Carte */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="h-[600px]">
                <ParisMap
                  subventions={subventions}
                  logements={logements}
                  arrondissementStats={arrondissementStats}
                  showSubventions={activeLayers.includes('subventions')}
                  showLogements={activeLayers.includes('logements')}
                  showChoropleth={activeLayers.includes('choropleth-subventions')}
                  choroplethMetric="logements"
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
                  {stats.logements.count}
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

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-500 text-center">
            Données: Open Data Paris + API Recherche Entreprises (entreprises.api.gouv.fr)
            <br />
            Géolocalisation limitée à 100 SIRET pour les performances
          </p>
        </footer>
      </div>
    </div>
  );
}
