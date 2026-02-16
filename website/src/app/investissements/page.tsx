'use client';

/**
 * Page /investissements — Travaux et projets d'équipement de la Ville de Paris.
 *
 * Architecture à 3 onglets :
 *   - Annuel (défaut) : Treemap avec breakdown dynamique + KPIs + table top projets
 *   - Tendances : Évolution multi-années (placeholder)
 *   - Explorer : Liste + Carte avec filtres collapsibles et toggle vue
 *
 * Sources : /public/data/map/investissements_complet_{year}.json
 */

import { Suspense, useState, useEffect } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import { loadAutorisationsIndex, loadAutorisationsForYear } from '@/lib/api/staticData';
import type { AutorisationProgramme } from '@/lib/types/map';
import InvestissementsAnnuelTab from '@/components/investissements/InvestissementsAnnuelTab';
import InvestissementsExplorerTab from '@/components/investissements/InvestissementsExplorerTab';
import InvestissementsTendancesTab from '@/components/investissements/InvestissementsTendancesTab';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const INVEST_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '📊' },
  { id: 'tendances', label: 'Tendances', icon: '📈' },
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
];

const VALID_TAB_IDS = INVEST_TABS.map(t => t.id);

interface BudgetInvestYear {
  year: number;
  sections: { investissement: { depenses: number } };
}

// ─── Inner component ─────────────────────────────────────────────────────────

function InvestissementsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [availableYears, setAvailableYears] = useState<number[]>([2024, 2023, 2022]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [projets, setProjets] = useState<AutorisationProgramme[]>([]);
  const [budgetInvestByYear, setBudgetInvestByYear] = useState<Record<number, number>>({});
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load index + budget totals ──
  useEffect(() => {
    async function loadIndex() {
      try {
        const [index, evoRes] = await Promise.all([
          loadAutorisationsIndex(),
          fetch('/data/evolution_budget.json'),
        ]);
        setAvailableYears(index.availableYears);
        if (index.availableYears.length > 0) setSelectedYear(index.availableYears[0]);
        if (evoRes.ok) {
          const evoData = await evoRes.json();
          const map: Record<number, number> = {};
          evoData.years?.forEach((y: BudgetInvestYear) => {
            map[y.year] = y.sections?.investissement?.depenses || 0;
          });
          setBudgetInvestByYear(map);
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

  // ── Load year data ──
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      setError(null);
      try {
        setProjets(await loadAutorisationsForYear(selectedYear));
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setProjets([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadData();
  }, [selectedYear]);

  // ── Loading state ──
  if (isLoadingIndex) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title="Travaux"
            description="Projets d'équipements publics : écoles, piscines, voiries, parcs..."
            actions={
              activeTab !== 'tendances' ? (
                <YearSelector
                  years={availableYears}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                />
              ) : undefined
            }
          />
          <div className="mt-5">
            <TabBar tabs={INVEST_TABS} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 flex items-center gap-2">
              <span>⚠</span>{error}
            </p>
          </div>
        )}

        {/* ── Tab Annuel ── */}
        {activeTab === 'annuel' && (
          <InvestissementsAnnuelTab
            projets={projets}
            selectedYear={selectedYear}
            budgetInvest={budgetInvestByYear[selectedYear]}
            isLoading={isLoadingData}
            onNavigateExplorer={() => setActiveTab('explorer')}
          />
        )}

        {/* ── Tab Tendances ── */}
        {activeTab === 'tendances' && (
          <InvestissementsTendancesTab />
        )}

        {/* ── Tab Explorer ── */}
        {activeTab === 'explorer' && (
          <InvestissementsExplorerTab
            projets={projets}
            isLoading={isLoadingData}
          />
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>
              Données : Comptes Administratifs — Annexe &ldquo;Investissements Localisés&rdquo; (PDF) + OpenData Paris
            </p>
            <p>Années disponibles : {availableYears.join(', ')}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function InvestissementsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <InvestissementsPageInner />
    </Suspense>
  );
}
