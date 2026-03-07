'use client';

/**
 * Page /budget — Budget de la Ville de Paris.
 *
 * Architecture par entité avec 2 tabs :
 * - Annuel (défaut) : Sankey/Donut + KPIs pour une année donnée
 * - Tendances : Évolution multi-années, YoY, santé financière + exécution budgétaire
 *
 * Le tab actif est synchronisé avec l'URL via ?tab=xxx (useTabState).
 * Chaque tab encapsule son propre data loading.
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import BudgetAnnuelTab from '@/components/budget/BudgetAnnuelTab';
import BudgetTendancesTab from '@/components/budget/BudgetTendancesTab';
import type { BudgetIndex } from '@/lib/formatters';
import { TAB_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Valid tab IDs (static) ─────────────────────────────────────────────────

const VALID_TAB_IDS = ['annuel', 'tendances'];

// ─── Inner component (needs Suspense for useSearchParams) ────────────────────

function BudgetPageInner() {
  const t = useT();
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<BudgetIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);

  const tabs: Tab[] = useMemo(() => [
    { id: 'annuel', label: t('tab.annuel'), icon: TAB_ICONS.annuel },
    { id: 'tendances', label: t('tab.tendances'), icon: TAB_ICONS.tendances },
  ], [t]);

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
          <p className="text-slate-500">{t('budget.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900">
      {/* Page header */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title={t('budget.title')}
            description={t('budget.description')}
          />

          {/* Tab bar */}
          <div className="mt-5">
            <TabBar
              tabs={tabs}
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

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-700/50">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>{t('budget.footer.data')}</p>
            <p>
              {t('budget.footer.real')} : {index.completeYears?.join(', ') || 'N/A'}
              {index.partialYears && index.partialYears.length > 0 && (
                <span className="ml-2">| {t('budget.footer.partial')} : {index.partialYears.join(', ')}</span>
              )}
              {index.votedYears && index.votedYears.length > 0 && (
                <span className="ml-2">| {t('budget.footer.voted')} : {index.votedYears.join(', ')}</span>
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
