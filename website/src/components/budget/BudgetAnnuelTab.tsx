'use client';

/**
 * BudgetAnnuelTab — Tab "Annuel" de la page /budget.
 *
 * Contenu : Sankey (flux budgétaires) ou Donut (nature dépenses) + StatsCards + DrilldownPanel.
 * Migré depuis l'ancien /budget/page.tsx.
 *
 * Props :
 * - selectedYear : année active (contrôlée par le parent)
 * - onYearChange : callback changement d'année
 * - years : liste des années disponibles
 */

import { useState, useEffect, useCallback } from 'react';
import YearSelector from '@/components/YearSelector';
import StatsCards from '@/components/StatsCards';
import BudgetSankey from '@/components/BudgetSankey';
import NatureDonut, { type BudgetNatureData } from '@/components/NatureDonut';
import DrilldownPanel from '@/components/DrilldownPanel';
import BudgetTypeBadge, { getBudgetTypeForYear } from '@/components/BudgetTypeBadge';
import type { BudgetData, BudgetIndex, DrilldownItem, DataStatus, BudgetType } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'flux' | 'depenses';

interface DrilldownLevel {
  title: string;
  category: 'revenue' | 'expense';
  items: DrilldownItem[];
  prefix?: string;
}

interface DrilldownState {
  levels: DrilldownLevel[];
  currentLevel: number;
  originalItems: DrilldownItem[];
}

interface EvolutionBudgetYear {
  year: number;
  totals: { emprunts: number; recettes_propres: number };
}

interface BudgetAnnuelTabProps {
  selectedYear: number;
  onYearChange: (year: number) => void;
  index: BudgetIndex;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Toggle Vue Sankey / Donut */
function ViewToggle({
  value,
  onChange,
  hasNatureData,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  hasNatureData: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-800/80 p-0.5 sm:p-1 border border-slate-700/50">
      <button
        onClick={() => onChange('flux')}
        className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
          ${value === 'flux' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25' : 'text-slate-400 hover:text-slate-200 active:bg-slate-700/50'}
        `}
      >
        <span className="sm:hidden">Flux</span>
        <span className="hidden sm:inline">Flux budgétaires</span>
      </button>
      <button
        onClick={() => onChange('depenses')}
        disabled={!hasNatureData}
        className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200
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

/** Badge statut données */
function DataStatusBadge({
  status,
  availability,
}: {
  status?: DataStatus;
  availability?: BudgetData['dataAvailability'];
}) {
  if (!status) return null;

  const statusConfig: Record<DataStatus, { label: string; color: string; icon: string }> = {
    COMPLET: { label: 'Données complètes', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✓' },
    PARTIEL: { label: 'Données partielles', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '◐' },
    BUDGET_SEUL: { label: 'Budget uniquement', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '○' },
    INCONNU: { label: 'Statut inconnu', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: '?' },
  };

  const budgetRelevantMissing: string[] = [];
  if (availability) {
    if (!availability.budget) budgetRelevantMissing.push('Budget principal');
    if (!availability.subventions) budgetRelevantMissing.push('Subventions');
  }

  const effectiveStatus: DataStatus =
    availability && availability.budget && availability.subventions ? 'COMPLET' : status;

  const config = statusConfig[effectiveStatus] || statusConfig['INCONNU'];

  return (
    <div className="group relative inline-flex items-center">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        <span>{config.icon}</span>
        {config.label}
      </span>
      {budgetRelevantMissing.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl min-w-[200px]">
            <p className="text-xs text-slate-300 font-medium mb-2">Sources manquantes :</p>
            <ul className="text-xs text-slate-400 space-y-1">
              {budgetRelevantMissing.map((item, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="text-amber-400">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function BudgetAnnuelTab({ selectedYear, onYearChange, index }: BudgetAnnuelTabProps) {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [natureData, setNatureData] = useState<BudgetNatureData | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('flux');
  const [empruntsData, setEmpruntsData] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine budget type for selected year
  const budgetType: BudgetType | null = getBudgetTypeForYear(
    selectedYear,
    index.year_types as Record<string, BudgetType> | undefined
  );

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setDrilldown(null);
  }, []);

  // Load emprunts data (once)
  useEffect(() => {
    async function loadEmprunts() {
      try {
        const res = await fetch('/data/evolution_budget.json');
        if (res.ok) {
          const evoData = await res.json();
          const map: Record<number, number> = {};
          evoData.years?.forEach((y: EvolutionBudgetYear) => {
            map[y.year] = y.totals.emprunts;
          });
          setEmpruntsData(map);
        }
      } catch { /* non-critical */ }
    }
    loadEmprunts();
  }, []);

  // Load budget data when year changes
  useEffect(() => {
    async function loadBudgetData() {
      setIsLoading(true);
      setDrilldown(null);
      try {
        const [sankeyRes, natureRes] = await Promise.all([
          fetch(`/data/budget_sankey_${selectedYear}.json`),
          fetch(`/data/budget_nature_${selectedYear}.json`).catch(() => null),
        ]);

        if (!sankeyRes.ok) throw new Error(`Données ${selectedYear} non disponibles`);

        setBudgetData(await sankeyRes.json());
        setNatureData(natureRes?.ok ? await natureRes.json() : null);
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
  }, [selectedYear]);

  // ── Drilldown logic ──────────────────────────────────────────────────────

  const extractPrefixes = useCallback((items: DrilldownItem[]): string[] => {
    const prefixes = new Set<string>();
    items.forEach(item => {
      const idx = item.name.indexOf(':');
      if (idx > 0) prefixes.add(item.name.substring(0, idx).trim());
    });
    return Array.from(prefixes);
  }, []);

  const groupByPrefix = useCallback((items: DrilldownItem[]): DrilldownItem[] => {
    const groups: Record<string, number> = {};
    const ungrouped: DrilldownItem[] = [];
    items.forEach(item => {
      const idx = item.name.indexOf(':');
      if (idx > 0) {
        const prefix = item.name.substring(0, idx).trim();
        groups[prefix] = (groups[prefix] || 0) + item.value;
      } else {
        ungrouped.push(item);
      }
    });
    const grouped = Object.entries(groups)
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
        levels: [{ title: nodeName, category, items: displayItems }],
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
    const subItems = originalItems
      .filter(i => i.name.startsWith(prefix + ':'))
      .map(i => ({ name: i.name.substring(prefix.length + 1).trim(), value: i.value }));
    if (subItems.length > 0) {
      setDrilldown(prev => prev ? {
        ...prev,
        levels: [...prev.levels.slice(0, currentLevel + 1), {
          title: prefix, category,
          items: subItems.sort((a, b) => b.value - a.value),
          prefix,
        }],
        currentLevel: currentLevel + 1,
      } : null);
    }
  }, [drilldown]);

  const handleBreadcrumbClick = useCallback((levelIndex: number) => {
    setDrilldown(prev => prev ? {
      ...prev,
      levels: prev.levels.slice(0, levelIndex + 1),
      currentLevel: levelIndex,
    } : null);
  }, []);

  const handleCloseDrilldown = useCallback(() => setDrilldown(null), []);

  // ── Render ───────────────────────────────────────────────────────────────

  const currentDrilldown = drilldown ? drilldown.levels[drilldown.currentLevel] : null;
  const breadcrumbs = drilldown?.levels.map(l => l.title) || [];
  const canDrillDeeper = currentDrilldown
    ? drilldown?.originalItems.some(i => i.name.startsWith(currentDrilldown.items[0]?.name + ':'))
    : false;

  return (
    <div>
      {/* Year selector + badges */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          {budgetData && (
            <DataStatusBadge status={budgetData.dataStatus} availability={budgetData.dataAvailability} />
          )}
          {budgetType && <BudgetTypeBadge type={budgetType} />}
        </div>
        <YearSelector years={index.availableYears} selectedYear={selectedYear} onYearChange={onYearChange} />
      </div>

      {/* Voted budget disclaimer */}
      {budgetType === 'vote' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-orange-300">
            <strong>Budget prévisionnel {selectedYear}</strong> — voté par le Conseil de Paris.
            Hors COVID, l&apos;écart-type avec le budget exécuté est de ±5%.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400 flex items-center gap-2"><span>⚠️</span>{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="bg-slate-800/50 rounded-xl p-5 h-24 skeleton" />)}
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
            emprunts={empruntsData[selectedYear] || budgetData.links.find(l => l.source === 'Emprunts')?.value || 0}
          />

          {/* Toggle Vue */}
          <div className="flex items-center justify-between mb-4">
            <ViewToggle value={viewMode} onChange={handleViewChange} hasNatureData={!!natureData} />
            <p className="text-xs text-slate-500 hidden sm:block">
              {viewMode === 'flux'
                ? "D'où vient l'argent et où va-t-il (éducation, social...)"
                : 'Comment est-il dépensé (personnel, subventions, investissements...)'}
            </p>
          </div>

          {/* Vue Flux budgétaires: Sankey */}
          {viewMode === 'flux' && (
            <>
              <BudgetSankey data={budgetData} onNodeClick={handleNodeClick} />
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
                <h3 className="text-lg font-semibold text-slate-100">Répartition par type de dépense</h3>
              </div>
              <p className="text-sm text-slate-400 mb-1">Cliquez sur une catégorie pour voir le détail</p>
              <p className="text-xs text-slate-500 mb-4">
                Classification comptable : personnel, subventions, investissements, etc.
              </p>
              <NatureDonut data={natureData} height={400} />
            </div>
          )}

          {viewMode === 'depenses' && !natureData && (
            <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-12 text-center">
              <p className="text-slate-400">Données par type de dépense non disponibles pour {selectedYear}</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
