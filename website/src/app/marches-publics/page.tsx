'use client';

/**
 * Page /marches-publics — Marchés publics de la Ville de Paris.
 *
 * Architecture à 3 onglets :
 *   - Annuel (défaut) : Treemap avec breakdown dynamique + KPIs + table top marchés
 *   - Tendances : Évolution multi-années (stacked bar + variation ranking)
 *   - Explorer : Liste avec filtres collapsibles
 *
 * Sources : /public/data/marches-publics/{index,marches_YYYY}.json
 *
 * ATTENTION : Les montants sont des ENVELOPPES PLURIANNUELLES (plafonds contractuels),
 * pas des dépenses annuelles.
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import { useYearParam } from '@/lib/hooks/useYearParam';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import MarchesAnnuelTab from '@/components/marches-publics/MarchesAnnuelTab';
import MarchesTendancesTab from '@/components/marches-publics/MarchesTendancesTab';
import MarchesExplorerTab from '@/components/marches-publics/MarchesExplorerTab';
import type { MarchePublic } from '@/components/MarchesTable';
import { TAB_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarchesIndex {
  generated_at: string;
  source: string;
  availableYears: number[];
  totalsByYear: Record<string, { nb_marches: number; enveloppe_max_totale: number }>;
  filters: {
    natures: string[];
    categories: string[];
    perimetres: string[];
  };
}

interface MarchesYearResponse {
  year: number;
  generated_at: string;
  enveloppe_max_totale: number;
  nb_marches: number;
  data: MarchePublic[];
}

// ─── Valid tab IDs ───────────────────────────────────────────────────────────

const VALID_TAB_IDS = ['annuel', 'tendances', 'explorer'];

// ─── Inner component ─────────────────────────────────────────────────────────

function MarchesPageInner() {
  const t = useT();
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<MarchesIndex | null>(null);
  const [selectedYear, setSelectedYear] = useYearParam(2024);
  const [marches, setMarches] = useState<MarchePublic[]>([]);
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tabs: Tab[] = useMemo(() => [
    { id: 'annuel', label: t('tab.annuel'), icon: TAB_ICONS.annuel },
    { id: 'tendances', label: t('tab.tendances'), icon: TAB_ICONS.tendances },
    { id: 'explorer', label: t('tab.explorer'), icon: TAB_ICONS.explorer },
  ], [t]);

  // ── Load index ──
  useEffect(() => {
    async function loadIndex() {
      try {
        const res = await fetch('/data/marches-publics/index.json');
        if (!res.ok) throw new Error("Impossible de charger l'index");
        const data: MarchesIndex = await res.json();
        setIndex(data);
        if (data.availableYears.length > 0 && !data.availableYears.includes(selectedYear)) {
          setSelectedYear(data.availableYears[0]);
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
    async function loadYearData() {
      if (!index) return;
      setIsLoadingData(true);
      setError(null);
      try {
        const res = await fetch(`/data/marches-publics/marches_${selectedYear}.json`);
        if (!res.ok) throw new Error(`Données ${selectedYear} non disponibles`);
        const yearData: MarchesYearResponse = await res.json();
        setMarches(yearData.data);
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setMarches([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadYearData();
  }, [index, selectedYear]);

  // ── Loading state ──
  if (isLoadingIndex || !index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title={t('marches.title')}
            description={t('marches.description')}
            actions={
              activeTab !== 'tendances' ? (
                <YearSelector
                  years={index.availableYears}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                />
              ) : undefined
            }
          />
          <div className="mt-5">
            <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── Tab Annuel ── */}
        {activeTab === 'annuel' && (
          <MarchesAnnuelTab
            selectedYear={selectedYear}
            marches={marches}
            isLoading={isLoadingData}
            error={error}
            onNavigateExplorer={() => setActiveTab('explorer')}
          />
        )}

        {/* ── Tab Tendances ── */}
        {activeTab === 'tendances' && <MarchesTendancesTab />}

        {/* ── Tab Explorer ── */}
        {activeTab === 'explorer' && (
          <MarchesExplorerTab
            marches={marches}
            availableCategories={index.filters.categories}
            isLoading={isLoadingData}
          />
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-700/50">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>{t('marches.footer.data')}</p>
            <p>{t('marches.footer.disclaimer')}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function MarchesPublicsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MarchesPageInner />
    </Suspense>
  );
}
