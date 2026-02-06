'use client';

/**
 * Page Logements Sociaux - Bailleurs et carte des logements financés à Paris
 * 
 * FEATURES:
 * - Vue Bailleurs: classement des top bailleurs avec stats détaillées
 * - Vue Carte: toggle pour voir tous les logements sur la carte
 * - Filtres par arrondissement
 * - Mode choroplèthe disponible sur la carte
 * 
 * SOURCES:
 * - Logements: opendata.paris.fr/logements-sociaux-finances-a-paris
 * - Population: INSEE 2021
 */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { LogementSocial, ArrondissementStats } from '@/lib/types/map';
import { loadLogementsSociaux, loadArrondissementsStats } from '@/lib/api/staticData';
import { formatNumber } from '@/lib/formatters';
import { DATA_SOURCES } from '@/lib/constants/arrondissements';

/**
 * Import dynamique de la carte (Leaflet nécessite window)
 */
const LogementsSociauxMap = dynamic(
  () => import('@/components/map/LogementsSociauxMap'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-slate-800/50 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Chargement de la carte...</p>
        </div>
      </div>
    ),
  }
);

/**
 * Stats agrégées par bailleur
 */
interface BailleurStats {
  nom: string;
  nbProjets: number;
  nbLogements: number;
  nbPLAI: number;
  nbPLUS: number;
  nbPLS: number;
  arrondissements: number[];
}

export default function LogementsSociauxPage() {
  // Vue (bailleurs ou carte)
  const [viewMode, setViewMode] = useState<'bailleurs' | 'carte'>('bailleurs');
  
  // Données
  const [logements, setLogements] = useState<LogementSocial[]>([]);
  const [arrondissementsStats, setArrondissementsStats] = useState<ArrondissementStats[]>([]);
  
  // Filtres
  const [selectedArrondissement, setSelectedArrondissement] = useState<number | null>(null);
  const [selectedBailleur, setSelectedBailleur] = useState<string | null>(null);
  const [showChoropleth, setShowChoropleth] = useState(false);
  
  // État de chargement
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charger les données au démarrage
   */
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);
      
      try {
        const [logementsData, arrStats] = await Promise.all([
          loadLogementsSociaux(),
          loadArrondissementsStats(),
        ]);
        
        setLogements(logementsData);
        setArrondissementsStats(arrStats);
      } catch (err) {
        console.error('Erreur chargement données:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, []);

  /**
   * Logements filtrés par arrondissement
   */
  const filteredLogements = useMemo(() => {
    if (selectedArrondissement === null) return logements;
    return logements.filter(l => l.arrondissement === selectedArrondissement);
  }, [logements, selectedArrondissement]);

  /**
   * Logements filtrés pour la carte (arrondissement + bailleur)
   */
  const mapLogements = useMemo(() => {
    let filtered = filteredLogements;
    if (selectedBailleur) {
      filtered = filtered.filter(l => l.bailleur === selectedBailleur);
    }
    return filtered;
  }, [filteredLogements, selectedBailleur]);

  /**
   * Top bailleurs avec stats détaillées
   */
  const topBailleurs = useMemo(() => {
    const bailleurs: Record<string, BailleurStats> = {};
    
    filteredLogements.forEach(log => {
      const b = log.bailleur || '(non renseigné)';
      if (!bailleurs[b]) {
        bailleurs[b] = { 
          nom: b, 
          nbProjets: 0, 
          nbLogements: 0, 
          nbPLAI: 0, 
          nbPLUS: 0, 
          nbPLS: 0,
          arrondissements: [],
        };
      }
      bailleurs[b].nbProjets++;
      bailleurs[b].nbLogements += log.nbLogements;
      bailleurs[b].nbPLAI += log.nbPLAI || 0;
      bailleurs[b].nbPLUS += log.nbPLUS || 0;
      bailleurs[b].nbPLS += log.nbPLS || 0;
      if (!bailleurs[b].arrondissements.includes(log.arrondissement)) {
        bailleurs[b].arrondissements.push(log.arrondissement);
      }
    });
    
    return Object.values(bailleurs)
      .sort((a, b) => b.nbLogements - a.nbLogements);
  }, [filteredLogements]);

  /**
   * Statistiques globales
   */
  const stats = useMemo(() => {
    const total = filteredLogements.length;
    const totalLogements = filteredLogements.reduce((sum, l) => sum + l.nbLogements, 0);
    const totalPLAI = filteredLogements.reduce((sum, l) => sum + (l.nbPLAI || 0), 0);
    const totalPLUS = filteredLogements.reduce((sum, l) => sum + (l.nbPLUS || 0), 0);
    const totalPLS = filteredLogements.reduce((sum, l) => sum + (l.nbPLS || 0), 0);
    
    return {
      projets: total,
      logements: totalLogements,
      PLAI: totalPLAI,
      PLUS: totalPLUS,
      PLS: totalPLS,
      bailleurs: topBailleurs.length,
    };
  }, [filteredLogements, topBailleurs]);

  /**
   * Liste des arrondissements pour le filtre
   */
  const arrondissements = useMemo(() => {
    const arrs = [...new Set(logements.map(l => l.arrondissement))].sort((a, b) => a - b);
    return arrs;
  }, [logements]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <span className="text-3xl">🏠</span>
                Logements Sociaux
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {formatNumber(stats.logements)} logements financés par {stats.bailleurs} bailleurs
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Toggle Vue */}
              <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('bailleurs')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'bailleurs'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🏢 Bailleurs
                </button>
                <button
                  onClick={() => setViewMode('carte')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'carte'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🗺️ Carte
                </button>
              </div>

              {/* Filtre arrondissement */}
              <select
                value={selectedArrondissement ?? ''}
                onChange={(e) => {
                  setSelectedArrondissement(e.target.value ? Number(e.target.value) : null);
                  setSelectedBailleur(null);
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Tous les arrondissements</option>
                {arrondissements.map(arr => (
                  <option key={arr} value={arr}>
                    {arr === 0 ? 'Paris Centre' : `${arr}ème`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        {/* Stats rapides — 2 colonnes sur mobile, 5 sur desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Total Logements</p>
            <p className="text-xl md:text-2xl font-bold text-emerald-400 mt-1">
              {stats.logements >= 1000 ? `${(stats.logements / 1000).toFixed(0)}k` : formatNumber(stats.logements)}
            </p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">Programmes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-100 mt-1">
              {formatNumber(stats.projets)}
            </p>
          </div>
          {/* Types de logements — sur mobile, utiliser une ligne plus compacte */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLAI (très social)</p>
            <p className="text-xl md:text-2xl font-bold text-blue-400 mt-1">
              {stats.PLAI >= 1000 ? `${(stats.PLAI / 1000).toFixed(0)}k` : formatNumber(stats.PLAI)}
            </p>
            <p className="text-[10px] md:text-xs text-slate-500">{stats.logements > 0 ? ((stats.PLAI / stats.logements) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLUS (social)</p>
            <p className="text-xl md:text-2xl font-bold text-cyan-400 mt-1">
              {stats.PLUS >= 1000 ? `${(stats.PLUS / 1000).toFixed(0)}k` : formatNumber(stats.PLUS)}
            </p>
            <p className="text-[10px] md:text-xs text-slate-500">{stats.logements > 0 ? ((stats.PLUS / stats.logements) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-3 md:p-4 col-span-2 sm:col-span-1">
            <p className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wide">PLS (intermédiaire)</p>
            <p className="text-xl md:text-2xl font-bold text-violet-400 mt-1">
              {stats.PLS >= 1000 ? `${(stats.PLS / 1000).toFixed(0)}k` : formatNumber(stats.PLS)}
            </p>
            <p className="text-[10px] md:text-xs text-slate-500">{stats.logements > 0 ? ((stats.PLS / stats.logements) * 100).toFixed(0) : 0}%</p>
          </div>
        </div>

        {/* Contenu principal */}
        {isLoading ? (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 h-[500px] flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-400">Chargement des données...</p>
            </div>
          </div>
        ) : viewMode === 'bailleurs' ? (
          /* Vue Bailleurs */
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                🏢 Classement des Bailleurs
                {selectedArrondissement !== null && (
                  <span className="text-sm font-normal text-slate-400">
                    ({selectedArrondissement === 0 ? 'Paris Centre' : `${selectedArrondissement}ème`})
                  </span>
                )}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide w-6 md:w-8">#</th>
                    <th className="text-left px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Bailleur</th>
                    <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Logements</th>
                    <th className="text-right px-2 md:px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Projets</th>
                    {/* Colonnes masquées sur mobile pour garder le tableau lisible */}
                    <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                      <span className="text-blue-400">PLAI</span>
                    </th>
                    <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                      <span className="text-cyan-400">PLUS</span>
                    </th>
                    <th className="hidden lg:table-cell text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                      <span className="text-violet-400">PLS</span>
                    </th>
                    <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Part</th>
                    <th className="hidden md:table-cell text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {topBailleurs.slice(0, 20).map((bailleur, index) => {
                    const percent = (bailleur.nbLogements / stats.logements) * 100;
                    const isSelected = selectedBailleur === bailleur.nom;
                    
                    return (
                      <tr 
                        key={bailleur.nom}
                        className={`hover:bg-slate-700/30 transition-colors ${isSelected ? 'bg-emerald-900/20' : ''}`}
                      >
                        <td className="px-2 md:px-4 py-3 text-slate-500 text-sm">{index + 1}</td>
                        <td className="px-2 md:px-4 py-3">
                          <p className={`text-xs md:text-sm font-medium ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {bailleur.nom}
                          </p>
                          <p className="text-[10px] md:text-xs text-slate-500">
                            {bailleur.arrondissements.length} arrondissement{bailleur.arrondissements.length > 1 ? 's' : ''}
                          </p>
                        </td>
                        <td className="px-2 md:px-4 py-3 text-right">
                          <p className="text-xs md:text-sm font-semibold text-emerald-400">
                            {formatNumber(bailleur.nbLogements)}
                          </p>
                        </td>
                        <td className="px-2 md:px-4 py-3 text-right text-xs md:text-sm text-slate-300">
                          {formatNumber(bailleur.nbProjets)}
                        </td>
                        {/* PLAI — masqué sur mobile et tablette */}
                        <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-blue-400">
                          {formatNumber(bailleur.nbPLAI)}
                        </td>
                        {/* PLUS — masqué sur mobile et tablette */}
                        <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-cyan-400">
                          {formatNumber(bailleur.nbPLUS)}
                        </td>
                        {/* PLS — masqué sur mobile et tablette */}
                        <td className="hidden lg:table-cell px-4 py-3 text-right text-sm text-violet-400">
                          {formatNumber(bailleur.nbPLS)}
                        </td>
                        {/* Part — masqué sur mobile */}
                        <td className="hidden md:table-cell px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(percent * 2, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 w-10 text-right">
                              {percent.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        {/* Action — masqué sur mobile */}
                        <td className="hidden md:table-cell px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedBailleur(isSelected ? null : bailleur.nom);
                              setViewMode('carte');
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            Voir sur carte →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {topBailleurs.length > 20 && (
              <div className="px-4 py-3 border-t border-slate-700 text-center">
                <p className="text-sm text-slate-500">
                  + {topBailleurs.length - 20} autres bailleurs
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Vue Carte */
          <div className="space-y-4">
            {/* Contrôles carte */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectedBailleur && (
                  <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-emerald-400">🏢 {selectedBailleur}</span>
                    <button
                      onClick={() => setSelectedBailleur(null)}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showChoropleth}
                  onChange={(e) => setShowChoropleth(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-300">
                  Vue par habitant
                </span>
              </label>
            </div>

            {/* Carte */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="h-[600px]">
                <LogementsSociauxMap
                  logements={mapLogements}
                  arrondissementStats={arrondissementsStats}
                  showChoropleth={showChoropleth}
                  isLoading={isLoading}
                  selectedBailleur={selectedBailleur}
                />
              </div>
            </div>
          </div>
        )}

        {/* Légende types (affichée sous le tableau) */}
        {viewMode === 'bailleurs' && (
          <div className="mt-6 bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
            <h3 className="text-sm font-medium text-slate-300 mb-3">📊 Types de logements sociaux</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400 mt-0.5" />
                <div>
                  <p className="text-slate-300 font-medium">PLAI - Très social</p>
                  <p className="text-slate-500">Revenus &lt; 60% du plafond HLM. Priorité aux ménages très modestes.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full bg-cyan-400 mt-0.5" />
                <div>
                  <p className="text-slate-300 font-medium">PLUS - Social standard</p>
                  <p className="text-slate-500">Revenus &lt; 100% du plafond HLM. Catégorie la plus courante.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-3 h-3 rounded-full bg-violet-400 mt-0.5" />
                <div>
                  <p className="text-slate-300 font-medium">PLS - Intermédiaire</p>
                  <p className="text-slate-500">Revenus 100-130% du plafond HLM. Loyers plus élevés.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <span>📚</span>
              Sources des données
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
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
            Données de financement de logements sociaux à Paris depuis 2001.
          </p>
        </footer>
      </div>
    </div>
  );
}
