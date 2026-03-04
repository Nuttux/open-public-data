'use client';

/**
 * Page /patrimoine — État patrimonial & dette de la Ville de Paris.
 *
 * Architecture par entité avec 2 tabs :
 * - Annuel (défaut) : Sankey Actif/Passif + KPIs patrimoniales
 * - Tendances : Évolution dette, épargne brute, santé financière
 *
 * Remplace l'ancien /bilan.
 */

import { Suspense, useState, useEffect } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import PatrimoineAnnuelTab from '@/components/patrimoine/PatrimoineAnnuelTab';
import PatrimoineTendancesTab from '@/components/patrimoine/PatrimoineTendancesTab';
import { loadBilanIndex, type BilanIndex } from '@/lib/api/staticData';
import { TAB_ICONS } from '@/lib/icons';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const PATRIMOINE_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: TAB_ICONS.annuel },
  { id: 'tendances', label: 'Tendances', icon: TAB_ICONS.tendances },
];

const VALID_TAB_IDS = PATRIMOINE_TABS.map(t => t.id);

// ─── Inner component ─────────────────────────────────────────────────────────

function PatrimoinePageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<BilanIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchIndex() {
      try {
        const data = await loadBilanIndex();
        setIndex(data);
        setSelectedYear(data.latestYear || 2024);
      } catch (err) {
        console.error('Error loading bilan index:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchIndex();
  }, []);

  if (isLoading || !index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement du patrimoine...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title="Patrimoine de Paris"
            description="État patrimonial, dette et santé financière de la Ville"
          />
          <div className="mt-5">
            <TabBar tabs={PATRIMOINE_TABS} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'annuel' && (
          <PatrimoineAnnuelTab
            availableYears={index.availableYears}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
          />
        )}

        {activeTab === 'tendances' && <PatrimoineTendancesTab />}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>Données : Open Data Paris — Bilan patrimonial de la Ville de Paris</p>
            <p>Années disponibles : {index.availableYears?.join(', ') || 'N/A'}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function PatrimoinePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PatrimoinePageInner />
    </Suspense>
  );
}
