'use client';

/**
 * Page /subventions — Bénéficiaires de subventions de la Ville de Paris.
 *
 * Architecture à 3 onglets :
 *   - Annuel (défaut) : Treemap thématique + KPIs + table filtrable bénéficiaires
 *   - Tendances : Évolution multi-années (stacked bar + variation ranking)
 *   - Explorer : Liste + Treemap avec filtres collapsibles et toggle vue
 *
 * Sources : /public/data/subventions/{index,treemap,beneficiaires}.json
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import TabBar, { type Tab } from '@/components/TabBar';
import { useTabState } from '@/lib/hooks/useTabState';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import SubventionsAnnuelTab from '@/components/subventions/SubventionsAnnuelTab';
import SubventionsTendancesTab from '@/components/subventions/SubventionsTendancesTab';
import SubventionsExplorerTab from '@/components/subventions/SubventionsExplorerTab';
import type { TreemapData } from '@/components/SubventionsTreemap';
import type { Beneficiaire } from '@/components/SubventionsTable';

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

interface TreemapResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_thematiques: number;
  data: TreemapData['data'];
}

interface BeneficiairesResponse {
  year: number;
  generated_at: string;
  total_montant: number;
  nb_beneficiaires: number;
  data: Beneficiaire[];
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const SUBVENTIONS_TABS: Tab[] = [
  { id: 'annuel', label: 'Annuel', icon: '📋' },
  { id: 'tendances', label: 'Tendances', icon: '📈' },
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
];

const VALID_TAB_IDS = SUBVENTIONS_TABS.map(t => t.id);

// ─── Inner component ─────────────────────────────────────────────────────────

function SubventionsPageInner() {
  const [activeTab, setActiveTab] = useTabState('annuel', VALID_TAB_IDS);
  const [index, setIndex] = useState<SubventionsIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [treemapData, setTreemapData] = useState<TreemapData | null>(null);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // ── Load year data ──
  useEffect(() => {
    async function loadYearData() {
      if (!index) return;
      setIsLoadingData(true);
      setError(null);
      try {
        const [treemapRes, beneficiairesRes] = await Promise.all([
          fetch(`/data/subventions/treemap_${selectedYear}.json`),
          fetch(`/data/subventions/beneficiaires_${selectedYear}.json`),
        ]);
        if (!treemapRes.ok || !beneficiairesRes.ok) throw new Error(`Données ${selectedYear} non disponibles`);
        const treemap: TreemapResponse = await treemapRes.json();
        const benefs: BeneficiairesResponse = await beneficiairesRes.json();
        setTreemapData({
          year: treemap.year,
          total_montant: treemap.total_montant,
          nb_thematiques: treemap.nb_thematiques,
          data: treemap.data,
        });
        setBeneficiaires(benefs.data);
      } catch (err) {
        console.error(`Error loading data for ${selectedYear}:`, err);
        setError(`Données ${selectedYear} non disponibles`);
        setTreemapData(null);
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
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement des subventions...</p>
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
            title="Subventions"
            description="Explorer les bénéficiaires de subventions par thématique et filtres"
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
            <TabBar tabs={SUBVENTIONS_TABS} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── Tab Annuel ── */}
        {activeTab === 'annuel' && (
          <SubventionsAnnuelTab
            selectedYear={selectedYear}
            treemapData={treemapData}
            beneficiaires={beneficiaires}
            availableDirections={availableDirections}
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
            <p>Données : Open Data Paris — Subventions associations votées</p>
            <p>Années avec données complètes : {index.available_years.filter(y => y !== 2020 && y !== 2021).join(', ')}</p>
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
