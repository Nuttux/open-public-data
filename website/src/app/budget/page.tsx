'use client';

/**
 * Page /budget — Budget de la Ville de Paris.
 *
 * Architecture par entité avec 3 tabs :
 * - Annuel (défaut) : Sankey/Donut + KPIs pour une année donnée
 * - Tendances : Évolution multi-années, YoY, santé financière
 * - Prévision : Voté vs Exécuté, taux d'exécution, estimations
 *
 * Le tab actif est synchronisé avec l'URL via ?tab=xxx (useTabState).
 * Chaque tab encapsule son propre data loading.
 */

import { Suspense, useState, useEffect } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import BudgetAnnuelTab from '@/components/budget/BudgetAnnuelTab';
import BudgetTendancesTab from '@/components/budget/BudgetTendancesTab';
import BudgetPrevisionTab from '@/components/budget/BudgetPrevisionTab';
import type { BudgetIndex } from '@/lib/formatters';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const BUDGET_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '📋' },
  { id: 'tendances', label: 'Tendances', icon: '📈' },
  { id: 'vote-vs-execute', label: 'Voté vs Exécuté', icon: '🎯' },
];

const VALID_TAB_IDS = BUDGET_TABS.map(t => t.id);

// ─── Inner component (needs Suspense for useSearchParams) ────────────────────

function BudgetPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<BudgetIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);

  // Load budget index (shared across tabs)
  useEffect(() => {
    async function loadIndex() {
      try {
        const res = await fetch('/data/budget_index.json');
        if (!res.ok) throw new Error('Index non disponible');
        const data: BudgetIndex = await res.json();
        setIndex(data);
        setSelectedYear(data.latestYear);
      } catch (err) {
        console.error('Error loading budget index:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadIndex();
  }, []);

  if (isLoading || !index) {
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
      {/* Page header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title="Budget de Paris"
            description="Tableau de bord des finances publiques parisiennes — 2019 à 2026"
          />

          {/* Tab bar */}
          <div className="mt-5">
            <TabBar
              tabs={BUDGET_TABS}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'annuel' && (
          <BudgetAnnuelTab
            index={index}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
          />
        )}

        {activeTab === 'tendances' && (
          <BudgetTendancesTab />
        )}

        {activeTab === 'vote-vs-execute' && (
          <BudgetPrevisionTab />
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>Données: Open Data Paris — Comptes administratifs budgets principaux (M57)</p>
            <p>
              Années complètes : {index.completeYears?.join(', ') || 'N/A'}
              {index.partialYears && index.partialYears.length > 0 && (
                <span className="ml-2">| Partielles : {index.partialYears.join(', ')}</span>
              )}
              {index.votedYears && index.votedYears.length > 0 && (
                <span className="ml-2">| Votées : {index.votedYears.join(', ')}</span>
              )}
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export (wrapped in Suspense for useSearchParams) ───────────────────

export default function BudgetPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BudgetPageInner />
    </Suspense>
  );
}
