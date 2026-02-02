'use client';

/**
 * Page principale du Dashboard Budget Paris
 * 
 * FEATURES:
 * - Sélecteur d'année (2019-2024)
 * - Cartes KPI avec vision économique claire
 * - Graphique Sankey interactif
 * - Drill-down multi-niveaux avec navigation par préfixe
 */

import { useState, useEffect, useCallback } from 'react';
import YearSelector from '@/components/YearSelector';
import StatsCards from '@/components/StatsCards';
import BudgetSankey from '@/components/BudgetSankey';
import DrilldownPanel from '@/components/DrilldownPanel';
import type { BudgetData, BudgetIndex, DrilldownItem } from '@/lib/formatters';

/**
 * Niveau de navigation dans le drill-down
 */
interface DrilldownLevel {
  title: string;
  category: 'revenue' | 'expense';
  items: DrilldownItem[];
  prefix?: string;  // Préfixe utilisé pour filtrer ce niveau
}

/**
 * État complet du drill-down avec historique de navigation
 */
interface DrilldownState {
  levels: DrilldownLevel[];
  currentLevel: number;
  originalItems: DrilldownItem[];  // Items originaux pour drill-down
}

export default function Home() {
  const [index, setIndex] = useState<BudgetIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
   * Extrait les préfixes uniques des items (partie avant ":")
   */
  const extractPrefixes = useCallback((items: DrilldownItem[]): string[] => {
    const prefixes = new Set<string>();
    items.forEach(item => {
      const colonIndex = item.name.indexOf(':');
      if (colonIndex > 0) {
        prefixes.add(item.name.substring(0, colonIndex).trim());
      }
    });
    return Array.from(prefixes);
  }, []);

  /**
   * Groupe les items par leur préfixe pour affichage niveau 1
   */
  const groupByPrefix = useCallback((items: DrilldownItem[]): DrilldownItem[] => {
    const groups: Record<string, number> = {};
    const ungrouped: DrilldownItem[] = [];
    
    items.forEach(item => {
      const colonIndex = item.name.indexOf(':');
      if (colonIndex > 0) {
        const prefix = item.name.substring(0, colonIndex).trim();
        groups[prefix] = (groups[prefix] || 0) + item.value;
      } else {
        ungrouped.push(item);
      }
    });
    
    const grouped: DrilldownItem[] = Object.entries(groups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    
    return [...grouped, ...ungrouped];
  }, []);

  /**
   * Gère le clic sur un nœud du Sankey - niveau 1
   */
  const handleNodeClick = useCallback((nodeName: string, category: 'revenue' | 'expense') => {
    if (!budgetData) return;
    
    const items = category === 'revenue' 
      ? budgetData.drilldown?.revenue?.[nodeName]
      : budgetData.drilldown?.expenses?.[nodeName];
    
    if (items && items.length > 0) {
      // Vérifie si les items ont des préfixes (pour groupage)
      const prefixes = extractPrefixes(items);
      
      // Si des préfixes existent, groupe par préfixe pour niveau 1
      const displayItems = prefixes.length > 1 ? groupByPrefix(items) : items;
      
      setDrilldown({
        levels: [{
          title: nodeName,
          category,
          items: displayItems,
        }],
        currentLevel: 0,
        originalItems: items,
      });
    }
  }, [budgetData, extractPrefixes, groupByPrefix]);

  /**
   * Gère le clic sur un item du drill-down - descend au niveau 2
   */
  const handleDrilldownItemClick = useCallback((item: DrilldownItem) => {
    if (!drilldown) return;
    
    const { originalItems, levels, currentLevel } = drilldown;
    const category = levels[currentLevel].category;
    
    // Cherche les items qui commencent par ce préfixe
    const prefix = item.name;
    const subItems = originalItems.filter(i => {
      // Item commence par "Prefix: "
      return i.name.startsWith(prefix + ':');
    }).map(i => ({
      // Retire le préfixe pour l'affichage
      name: i.name.substring(prefix.length + 1).trim(),
      value: i.value,
    }));
    
    if (subItems.length > 0) {
      // Descend au niveau 2
      setDrilldown(prev => {
        if (!prev) return null;
        return {
          ...prev,
          levels: [...prev.levels.slice(0, currentLevel + 1), {
            title: prefix,
            category,
            items: subItems.sort((a, b) => b.value - a.value),
            prefix,
          }],
          currentLevel: currentLevel + 1,
        };
      });
    }
  }, [drilldown]);

  /**
   * Navigue vers un niveau spécifique
   */
  const handleBreadcrumbClick = useCallback((levelIndex: number) => {
    setDrilldown(prev => {
      if (!prev) return null;
      return {
        ...prev,
        levels: prev.levels.slice(0, levelIndex + 1),
        currentLevel: levelIndex,
      };
    });
  }, []);

  const handleCloseDrilldown = useCallback(() => {
    setDrilldown(null);
  }, []);

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

  const currentDrilldown = drilldown ? drilldown.levels[drilldown.currentLevel] : null;
  const breadcrumbs = drilldown?.levels.map(l => l.title) || [];
  
  // Vérifie si drill-down niveau 2 est possible
  const canDrillDeeper = currentDrilldown 
    ? drilldown?.originalItems.some(i => i.name.startsWith(currentDrilldown.items[0]?.name + ':'))
    : false;

  return (
    <main className="min-h-screen">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-5 h-24 skeleton" />
              ))}
            </div>
            <div className="bg-slate-800/50 rounded-xl p-6 h-[600px] skeleton" />
          </div>
        ) : budgetData ? (
          <>
            <StatsCards
              recettes={budgetData.totals.recettes}
              depenses={budgetData.totals.depenses}
              solde={budgetData.totals.solde}
              year={selectedYear}
            />

            <BudgetSankey
              data={budgetData}
              onNodeClick={handleNodeClick}
            />

            {currentDrilldown && (
              <DrilldownPanel
                title={currentDrilldown.title}
                category={currentDrilldown.category}
                items={currentDrilldown.items}
                breadcrumbs={breadcrumbs}
                currentLevel={drilldown?.currentLevel || 0}
                onClose={handleCloseDrilldown}
                onBreadcrumbClick={handleBreadcrumbClick}
                onItemClick={canDrillDeeper || (drilldown?.currentLevel === 0) ? handleDrilldownItemClick : undefined}
              />
            )}
          </>
        ) : null}

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
