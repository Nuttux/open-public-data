'use client';

/**
 * Page /subventions — Bénéficiaires de subventions de la Ville de Paris.
 *
 * Architecture à 3 onglets :
 *   - Annuel (défaut) : Treemap avec breakdown dynamique + KPIs + table top bénéficiaires
 *   - Tendances : Évolution multi-années (stacked bar + variation ranking)
 *   - Explorer : Liste avec filtres collapsibles
 *
 * Sources : /public/data/subventions/{index,beneficiaires}.json
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import SubventionsAnnuelTab from '@/components/subventions/SubventionsAnnuelTab';
import SubventionsTendancesTab from '@/components/subventions/SubventionsTendancesTab';
import SubventionsExplorerTab from '@/components/subventions/SubventionsExplorerTab';
import type { Beneficiaire } from '@/components/SubventionsTable';
import { TAB_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubventionsIndex {
  generated_at: string;
  source: string;
  available_years: number[];
  totals_by_year: Record<string, { montant_total: number; nb_subventions: number }>;
  filters: {
    thematiques: string[];
    natures_juridiques: string[];
    directions: string[];
  };
}

interface BeneficiairesResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_beneficiaires: number;
  data: Beneficiaire[];
}

// ─── Valid tab IDs ───────────────────────────────────────────────────────────

const VALID_TAB_IDS = ['annuel', 'tendances', 'explorer'];

// ─── Inner component ─────────────────────────────────────────────────────────

function SubventionsPageInner() {
  const t = useT();
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<SubventionsIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
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
        const res = await fetch('/data/subventions/index.json');
        if (!res.ok) throw new Error("Impossible de charger l'index");
        const data: SubventionsIndex = await res.json();
        setIndex(data);
        if (data.available_years.length > 0) setSelectedYear(data.available_years[0]);
      } catch (err) {
        console.error('Error loading index:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setIsLoadingIndex(false);
      }
    }
    loadIndex();
  }, []);

  // ── Load year data (beneficiaires only — treemap built client-side) ──
  useEffect(() => {
    async function loadYearData() {
      if (!index) return;
      setIsLoadingData(true);
      setError(null);
      try {
        const res = await fetch(`/data/subventions/beneficiaires_${selectedYear}.json`);
        if (!res.ok) throw new Error(`Données ${selectedYear} non disponibles`);
        const benefs: BeneficiairesResponse = await res.json();
        setBeneficiaires(benefs.data);
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setBeneficiaires([]);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadYearData();
  }, [index, selectedYear]);

  /** Directions disponibles */
  const availableDirections = useMemo(() => index?.filters?.directions || [], [index]);

  /** Nombre de subventions pour l'année sélectionnée */
  const nbSubventions = useMemo(
    () => index?.totals_by_year[String(selectedYear)]?.nb_subventions || 0,
    [index, selectedYear],
  );

  // ── Loading state ──
  if (isLoadingIndex || !index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            title={t('subventions.title')}
            description={t('subventions.description')}
            actions={
              activeTab !== 'tendances' ? (
                <YearSelector
                  years={index.available_years}
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
          <SubventionsAnnuelTab
            selectedYear={selectedYear}
            beneficiaires={beneficiaires}
            nbSubventions={nbSubventions}
            isLoading={isLoadingData}
            error={error}
            onNavigateExplorer={() => setActiveTab('explorer')}
          />
        )}

        {/* ── Tab Tendances ── */}
        {activeTab === 'tendances' && <SubventionsTendancesTab />}

        {/* ── Tab Explorer ── */}
        {activeTab === 'explorer' && (
          <SubventionsExplorerTab
            beneficiaires={beneficiaires}
            availableDirections={availableDirections}
            isLoading={isLoadingData}
          />
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>{t('subventions.footer.data')}</p>
            <p>{t('subventions.footer.years')} : {index.available_years.filter(y => y !== 2020 && y !== 2021).join(', ')}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function SubventionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SubventionsPageInner />
    </Suspense>
  );
}
