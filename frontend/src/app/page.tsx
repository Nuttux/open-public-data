'use client';

/**
 * Page principale du Dashboard Budget Paris
 * 
 * Ce composant orchestre l'affichage du tableau de bord avec:
 * - Sélecteur d'année
 * - Cartes KPI (recettes, dépenses, solde)
 * - Graphique Sankey interactif
 * - Panel de drill-down pour les détails
 * 
 * Les données sont chargées depuis les fichiers JSON statiques
 * générés par le script d'export Python.
 */

import { useState, useEffect, useCallback } from 'react';
import YearSelector from '@/components/YearSelector';
import StatsCards from '@/components/StatsCards';
import BudgetSankey from '@/components/BudgetSankey';
import DrilldownPanel from '@/components/DrilldownPanel';
import type { BudgetData, BudgetIndex, DrilldownItem } from '@/lib/formatters';

/**
 * État du drill-down (quand l'utilisateur clique sur un nœud)
 */
interface DrilldownState {
  title: string;
  category: 'revenue' | 'expense';
  items: DrilldownItem[];
}

export default function Home() {
  // État principal
  const [index, setIndex] = useState<BudgetIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  
  // États de chargement et erreur
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charge l'index des années disponibles au montage
   */
  useEffect(() => {
    async function loadIndex() {
      try {
        const response = await fetch('/data/budget_index.json');
        if (!response.ok) throw new Error('Impossible de charger l\'index');
        
        const data: BudgetIndex = await response.json();
        setIndex(data);
        setSelectedYear(data.latestYear);
      } catch (err) {
        setError('Erreur lors du chargement des données');
        console.error('Error loading index:', err);
      }
    }
    
    loadIndex();
  }, []);

  /**
   * Charge les données Sankey pour l'année sélectionnée
   */
  useEffect(() => {
    async function loadBudgetData() {
      if (!index) return;
      
      setIsLoading(true);
      setDrilldown(null);
      
      try {
        const response = await fetch(`/data/budget_sankey_${selectedYear}.json`);
        if (!response.ok) {
          throw new Error(`Données ${selectedYear} non disponibles`);
        }
        
        const data: BudgetData = await response.json();
        setBudgetData(data);
        setError(null);
      } catch (err) {
        setError(`Erreur lors du chargement des données ${selectedYear}`);
        console.error('Error loading budget data:', err);
        setBudgetData(null);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadBudgetData();
  }, [index, selectedYear]);

  /**
   * Gère le clic sur un nœud du Sankey pour afficher le drill-down
   */
  const handleNodeClick = useCallback((nodeName: string, category: 'revenue' | 'expense') => {
    if (!budgetData) return;
    
    // Récupère les données de drill-down
    const items = category === 'revenue' 
      ? budgetData.drilldown?.revenue?.[nodeName]
      : budgetData.drilldown?.expenses?.[nodeName];
    
    if (items && items.length > 0) {
      setDrilldown({
        title: nodeName,
        category,
        items,
      });
    }
  }, [budgetData]);

  /**
   * Ferme le panneau de drill-down
   */
  const handleCloseDrilldown = useCallback(() => {
    setDrilldown(null);
  }, []);

  // Écran de chargement initial
  if (!index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* En-tête avec titre et sélecteur d'année */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <span className="text-3xl">🏛️</span>
                Budget Paris
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Tableau de bord des finances publiques parisiennes
              </p>
            </div>
            
            <YearSelector
              years={index.availableYears}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Affichage des erreurs */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        {/* État de chargement */}
        {isLoading ? (
          <div className="space-y-6">
            {/* Skeleton pour les cartes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-5 h-24 skeleton" />
              ))}
            </div>
            {/* Skeleton pour le graphique */}
            <div className="bg-slate-800/50 rounded-xl p-6 h-[700px] skeleton" />
          </div>
        ) : budgetData ? (
          <>
            {/* Cartes KPI */}
            <StatsCards
              recettes={budgetData.totals.recettes}
              depenses={budgetData.totals.depenses}
              solde={budgetData.totals.solde}
              year={selectedYear}
            />

            {/* Graphique Sankey */}
            <BudgetSankey
              data={budgetData}
              onNodeClick={handleNodeClick}
            />

            {/* Panneau de drill-down conditionnel */}
            {drilldown && (
              <DrilldownPanel
                title={drilldown.title}
                category={drilldown.category}
                items={drilldown.items}
                onClose={handleCloseDrilldown}
              />
            )}
          </>
        ) : null}

        {/* Footer avec source des données */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-500 text-center">
            Données: Open Data Paris - Comptes administratifs budgets principaux (M57)
            <br />
            Dernière mise à jour: {index.latestYear}
          </p>
        </footer>
      </div>
    </main>
  );
}
