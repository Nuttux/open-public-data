'use client';

/**
 * Page principale du Dashboard Budget Paris
 * 
 * FEATURES:
 * - Sélecteur d'année (2019-2024)
 * - Toggle vue: Par fonction (Sankey) / Par nature (Donut)
 * - Indicateur de complétude des données (COMPLET/PARTIEL)
 * - Cartes KPI avec vision économique claire
 * - Drill-down multi-niveaux
 */

import { useState, useEffect, useCallback } from 'react';
import YearSelector from '@/components/YearSelector';
import StatsCards from '@/components/StatsCards';
import BudgetSankey from '@/components/BudgetSankey';
import NatureDonut, { type BudgetNatureData } from '@/components/NatureDonut';
import DrilldownPanel from '@/components/DrilldownPanel';
import type { BudgetData, BudgetIndex, DrilldownItem, DataStatus } from '@/lib/formatters';

/** Type de vue pour le toggle */
type ViewMode = 'flux' | 'depenses';

/**
 * Segmented Control pour basculer entre les vues
 * 
 * Vues disponibles:
 * - Flux budgétaires: Sankey montrant sources → destinations (fonction)
 * - Types de dépenses: Donut montrant la répartition par nature comptable
 * 
 * Responsive: plus compact sur mobile
 */
function ViewToggle({ 
  value, 
  onChange,
  hasNatureData 
}: { 
  value: ViewMode; 
  onChange: (mode: ViewMode) => void;
  hasNatureData: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-800/80 p-0.5 sm:p-1 border border-slate-700/50">
      <button
        onClick={() => onChange('flux')}
        className={`
          px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
          ${value === 'flux' 
            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' 
            : 'text-slate-400 hover:text-slate-200 active:bg-slate-700/50'
          }
        `}
      >
        <span className="sm:hidden">Flux</span>
        <span className="hidden sm:inline">Flux budgétaires</span>
      </button>
      <button
        onClick={() => onChange('depenses')}
        disabled={!hasNatureData}
        className={`
          px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
          ${value === 'depenses' 
            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' 
            : hasNatureData 
              ? 'text-slate-400 hover:text-slate-200 active:bg-slate-700/50'
              : 'text-slate-600 cursor-not-allowed'
          }
        `}
        title={!hasNatureData ? 'Données non disponibles pour cette année' : undefined}
      >
        <span className="sm:hidden">Dépenses</span>
        <span className="hidden sm:inline">Types de dépenses</span>
      </button>
    </div>
  );
}

/**
 * Composant d'indicateur de statut des données
 */
function DataStatusBadge({ 
  status, 
  availability 
}: { 
  status?: DataStatus; 
  availability?: BudgetData['dataAvailability'];
}) {
  if (!status) return null;
  
  const statusConfig: Record<DataStatus, { label: string; color: string; icon: string }> = {
    'COMPLET': { label: 'Données complètes', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✓' },
    'PARTIEL': { label: 'Données partielles', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '◐' },
    'BUDGET_SEUL': { label: 'Budget uniquement', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '○' },
    'INCONNU': { label: 'Statut inconnu', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: '?' },
  };
  
  const config = statusConfig[status] || statusConfig['INCONNU'];
  
  // Build tooltip with details
  const missingItems: string[] = [];
  if (availability) {
    if (!availability.autorisations) missingItems.push('Autorisations de programmes');
    if (!availability.arrondissements) missingItems.push('Budgets arrondissements');
    if (!availability.subventions) missingItems.push('Subventions');
  }
  
  return (
    <div className="group relative inline-flex items-center">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        <span>{config.icon}</span>
        {config.label}
      </span>
      
      {/* Tooltip with details */}
      {missingItems.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl min-w-[200px]">
            <p className="text-xs text-slate-300 font-medium mb-2">Sources manquantes :</p>
            <ul className="text-xs text-slate-400 space-y-1">
              {missingItems.map((item, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="text-amber-400">•</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700">
              Les données manquantes ne sont pas encore publiées par Paris Open Data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Niveau de navigation dans le drill-down
 */
interface DrilldownLevel {
  title: string;
  category: 'revenue' | 'expense';
  items: DrilldownItem[];
  prefix?: string;
}

/**
 * État complet du drill-down avec historique de navigation
 */
interface DrilldownState {
  levels: DrilldownLevel[];
  currentLevel: number;
  originalItems: DrilldownItem[];
}

export default function Home() {
  const [index, setIndex] = useState<BudgetIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [natureData, setNatureData] = useState<BudgetNatureData | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('flux');
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gérer le changement de vue (reset drilldown)
  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setDrilldown(null); // Reset drilldown when switching views
  }, []);

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
        // Charger les données Sankey et Nature en parallèle
        const [sankeyResponse, natureResponse] = await Promise.all([
          fetch(`/data/budget_sankey_${selectedYear}.json`),
          fetch(`/data/budget_nature_${selectedYear}.json`).catch(() => null),
        ]);
        
        if (!sankeyResponse.ok) {
          throw new Error(`Données ${selectedYear} non disponibles`);
        }
        
        const data: BudgetData = await sankeyResponse.json();
        setBudgetData(data);
        
        // Nature data est optionnel (peut ne pas exister pour les anciennes années)
        if (natureResponse?.ok) {
          const nature: BudgetNatureData = await natureResponse.json();
          setNatureData(nature);
        } else {
          setNatureData(null);
        }
        
        setError(null);
      } catch (err) {
        setError(`Erreur lors du chargement des données ${selectedYear}`);
        console.error('Error loading budget data:', err);
        setBudgetData(null);
        setNatureData(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadBudgetData();
  }, [index, selectedYear]);

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

  const handleNodeClick = useCallback((nodeName: string, category: 'revenue' | 'expense') => {
    if (!budgetData) return;
    
    const items = category === 'revenue' 
      ? budgetData.drilldown?.revenue?.[nodeName]
      : budgetData.drilldown?.expenses?.[nodeName];
    
    if (items && items.length > 0) {
      const prefixes = extractPrefixes(items);
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

  const handleDrilldownItemClick = useCallback((item: DrilldownItem) => {
    if (!drilldown) return;
    
    const { originalItems, levels, currentLevel } = drilldown;
    const category = levels[currentLevel].category;
    
    const prefix = item.name;
    const subItems = originalItems.filter(i => {
      return i.name.startsWith(prefix + ':');
    }).map(i => ({
      name: i.name.substring(prefix.length + 1).trim(),
      value: i.value,
    }));
    
    if (subItems.length > 0) {
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
  const canDrillDeeper = currentDrilldown 
    ? drilldown?.originalItems.some(i => i.name.startsWith(currentDrilldown.items[0]?.name + ':'))
    : false;

  return (
    <main className="min-h-screen">
      {/* Header de page (sous la navbar globale) */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-100">
                  Flux budgétaires
                </h2>
                {/* Data status indicator */}
                {budgetData && (
                  <DataStatusBadge 
                    status={budgetData.dataStatus} 
                    availability={budgetData.dataAvailability}
                  />
                )}
              </div>
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
      </div>

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
              emprunts={budgetData.links.find(l => l.source === 'Emprunts')?.value || 0}
            />

            {/* Toggle Vue */}
            <div className="flex items-center justify-between mb-4">
              <ViewToggle 
                value={viewMode} 
                onChange={handleViewChange}
                hasNatureData={!!natureData}
              />
              <p className="text-xs text-slate-500 hidden sm:block">
                {viewMode === 'flux' 
                  ? 'D\'où vient l\'argent et où va-t-il (éducation, social...)' 
                  : 'Comment est-il dépensé (personnel, subventions, investissements...)'
                }
              </p>
            </div>

            {/* Vue Flux budgétaires: Sankey */}
            {viewMode === 'flux' && (
              <>
                <BudgetSankey
                  data={budgetData}
                  onNodeClick={handleNodeClick}
                />

                {currentDrilldown && (
                  <DrilldownPanel
                    title={currentDrilldown.title}
                    category={currentDrilldown.category}
                    parentCategory={breadcrumbs[0]}
                    items={currentDrilldown.items}
                    sectionData={
                      currentDrilldown.category === 'expense' && drilldown?.currentLevel === 0
                        ? budgetData.bySection?.[currentDrilldown.title]
                        : undefined
                    }
                    breadcrumbs={breadcrumbs}
                    currentLevel={drilldown?.currentLevel || 0}
                    onClose={handleCloseDrilldown}
                    onBreadcrumbClick={handleBreadcrumbClick}
                    onItemClick={canDrillDeeper || (drilldown?.currentLevel === 0) ? handleDrilldownItemClick : undefined}
                  />
                )}
              </>
            )}

            {/* Vue Types de dépenses: Donut */}
            {viewMode === 'depenses' && natureData && (
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🍩</span>
                  <h3 className="text-lg font-semibold text-slate-100">
                    Répartition par type de dépense
                  </h3>
                </div>
                <p className="text-sm text-slate-400 mb-1">
                  Cliquez sur une catégorie pour voir le détail
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Classification comptable : personnel, subventions, investissements, etc.
                </p>
                <NatureDonut data={natureData} height={400} />
              </div>
            )}

            {/* Fallback si pas de données dépenses */}
            {viewMode === 'depenses' && !natureData && (
              <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-12 text-center">
                <p className="text-slate-400">
                  Données par type de dépense non disponibles pour {selectedYear}
                </p>
              </div>
            )}
          </>
        ) : null}

        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>
              Données: Open Data Paris - Comptes administratifs budgets principaux (M57)
            </p>
            <p>
              Années complètes: {index.completeYears?.join(', ') || 'N/A'}
              {index.partialYears && index.partialYears.length > 0 && (
                <span className="ml-2">| Partielles: {index.partialYears.join(', ')}</span>
              )}
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
