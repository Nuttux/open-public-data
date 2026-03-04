'use client';

/**
 * Tableau de bord — Vue d'ensemble de la santé financière de Paris.
 *
 * Sections :
 *   1. KPI tiles (London Datastore style) — 6 indicateurs clés avec YoY
 *   2. Per-capita — "À quoi servent vos impôts ?" décomposition par thématique
 *
 * Données : agrégation client-side des fichiers JSON existants.
 */

import { useState, useEffect, Suspense } from 'react';
import PageHeader from '@/components/PageHeader';
import YearSelector from '@/components/YearSelector';
import KpiTilesSection from '@/components/tableau-de-bord/KpiTilesSection';
import PerCapitaSection from '@/components/tableau-de-bord/PerCapitaSection';
import ExportBar from '@/components/shared/ExportBar';
import { useT } from '@/lib/localeContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BudgetIndex {
  availableYears: number[];
  year_types: Record<string, string>;
}

interface SankeyData {
  year: number;
  type_budget: string;
  nodes: { name: string; category: string }[];
  links: { source: string; target: string; value: number }[];
  totals: { depenses: number };
}

// ─── Inner component (needs Suspense for useSearchParams) ────────────────────

function TableauDeBordInner() {
  const t = useT();
  const [index, setIndex] = useState<BudgetIndex | null>(null);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [isLoading, setIsLoading] = useState(true);

  // Load index
  useEffect(() => {
    fetch('/data/budget_index.json')
      .then((r) => r.json())
      .then((data: BudgetIndex) => {
        setIndex(data);
        if (data.availableYears.length > 0) setSelectedYear(data.availableYears[0]);
      })
      .catch(console.error);
  }, []);

  // Load Sankey for selected year
  useEffect(() => {
    setIsLoading(true);
    fetch(`/data/budget_sankey_${selectedYear}.json`)
      .then((r) => r.json())
      .then((data: SankeyData) => setSankeyData(data))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  const availableYears = index?.availableYears ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <YearSelector
            years={availableYears}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
          />
        }
      />

      {/* Section 1 : KPI tiles */}
      <KpiTilesSection />

      {sankeyData && (
        <ExportBar
          csvData={sankeyData.links as unknown as Record<string, unknown>[]}
          csvColumns={[
            { key: 'source', label: 'Source' },
            { key: 'target', label: 'Destination' },
            { key: 'value', label: 'Montant (€)' },
          ]}
          filename={`budget_synthese_${selectedYear}`}
        />
      )}

      {/* Section 2 : Per capita */}
      {isLoading ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sankeyData ? (
        <PerCapitaSection data={sankeyData} />
      ) : (
        <div className="text-slate-500 text-center py-12">{t('dashboard.no_data')}</div>
      )}

      {/* Quick links */}
      <section className="border-t border-slate-700/50 pt-8">
        <p className="text-xs text-slate-500 text-center">
          {t('dashboard.footer')}
        </p>
      </section>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TableauDeBordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TableauDeBordInner />
    </Suspense>
  );
}
