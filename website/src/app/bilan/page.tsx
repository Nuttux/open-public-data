'use client';

/**
 * Page Bilan Comptable - État patrimonial de la Ville de Paris
 * 
 * FEATURES:
 * - Sélecteur d'année (2019-2024)
 * - KPIs financiers (Actif Net, Fonds propres, Dette, Ratio endettement)
 * - Sankey Actif ↔ Patrimoine ↔ Passif
 * - Drill-down sur les postes
 */

import { useState, useEffect, useCallback } from 'react';
import YearSelector from '@/components/YearSelector';
import BilanSankey from '@/components/BilanSankey';
import DrilldownPanel from '@/components/DrilldownPanel';
import GlossaryTip from '@/components/GlossaryTip';
import { loadBilanIndex, loadBilanSankey, type BilanIndex, type BilanSankeyData } from '@/lib/api/staticData';
import { formatEuroCompact, formatPercent } from '@/lib/formatters';

/**
 * Cartes KPI pour le bilan comptable
 */
function BilanStatsCards({ data }: { data: BilanSankeyData }) {
  const { totals, kpis } = data;
  
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* Actif Net */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-400">🏛️</span>
          <span className="text-xs text-slate-400">Actif Net <GlossaryTip term="actif_net" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-blue-400">
          {formatEuroCompact(totals.actif_net)}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Ce que Paris possède
        </div>
      </div>

      {/* Fonds propres */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-green-400">💰</span>
          <span className="text-xs text-slate-400">Fonds propres <GlossaryTip term="fonds_propres" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-green-400">
          {formatEuroCompact(totals.fonds_propres)}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {formatPercent(kpis.pct_fonds_propres)} du passif
        </div>
      </div>

      {/* Dette totale */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-400">📋</span>
          <span className="text-xs text-slate-400">Dette totale <GlossaryTip term="dette_totale" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-red-400">
          {formatEuroCompact(totals.dette_totale)}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Financière: {formatEuroCompact(totals.dettes_financieres)}
        </div>
      </div>

      {/* Ratio d'endettement */}
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={kpis.ratio_endettement && kpis.ratio_endettement > 1 ? 'text-amber-400' : 'text-emerald-400'}>
            📊
          </span>
          <span className="text-xs text-slate-400">Ratio endettement <GlossaryTip term="ratio_endettement" /></span>
        </div>
        <div className={`text-xl sm:text-2xl font-bold ${
          kpis.ratio_endettement && kpis.ratio_endettement > 1 ? 'text-amber-400' : 'text-emerald-400'
        }`}>
          {kpis.ratio_endettement ? kpis.ratio_endettement.toFixed(2) : 'N/A'}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {kpis.ratio_endettement && kpis.ratio_endettement <= 1 
            ? '✓ Niveau sain' 
            : '⚠️ Dette > Fonds propres'
          }
        </div>
      </div>
    </div>
  );
}

/**
 * Type pour le drilldown du bilan
 */
interface BilanDrilldownState {
  title: string;
  category: 'actif' | 'passif';
  items: Array<{ name: string; value: number; brut?: number; amort?: number }>;
}

export default function BilanPage() {
  const [index, setIndex] = useState<BilanIndex | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [bilanData, setBilanData] = useState<BilanSankeyData | null>(null);
  const [drilldown, setDrilldown] = useState<BilanDrilldownState | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger l'index au montage
  useEffect(() => {
    async function fetchIndex() {
      try {
        const data = await loadBilanIndex();
        setIndex(data);
        setSelectedYear(data.latestYear || 2024);
      } catch (err) {
        console.error('Error loading bilan index:', err);
        setError('Impossible de charger l\'index du bilan');
      }
    }
    fetchIndex();
  }, []);

  // Charger les données de l'année sélectionnée
  useEffect(() => {
    async function fetchBilanData() {
      if (!index) return;
      
      setIsLoading(true);
      setDrilldown(null);
      
      try {
        const data = await loadBilanSankey(selectedYear);
        if (data) {
          setBilanData(data);
          setError(null);
        } else {
          setError(`Données ${selectedYear} non disponibles`);
          setBilanData(null);
        }
      } catch (err) {
        console.error('Error loading bilan data:', err);
        setError(`Erreur lors du chargement des données ${selectedYear}`);
        setBilanData(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetchBilanData();
  }, [index, selectedYear]);

  // Gérer le clic sur un noeud du Sankey
  const handleNodeClick = useCallback((nodeName: string, category: 'actif' | 'passif') => {
    if (!bilanData) return;
    
    const items = bilanData.drilldown[category]?.[nodeName];
    
    if (items && items.length > 0) {
      setDrilldown({
        title: nodeName,
        category,
        items: items.sort((a, b) => b.value - a.value),
      });
    }
  }, [bilanData]);

  const handleCloseDrilldown = useCallback(() => {
    setDrilldown(null);
  }, []);

  if (!index) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Chargement du bilan comptable...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header de page */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-100">
                  📋 Bilan Comptable
                </h2>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                État patrimonial de la Ville de Paris
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-slate-800/50 rounded-xl p-5 h-24 skeleton" />
              ))}
            </div>
            <div className="bg-slate-800/50 rounded-xl p-6 h-[500px] skeleton" />
          </div>
        ) : bilanData ? (
          <>
            {/* KPIs */}
            <BilanStatsCards data={bilanData} />

            {/* Sankey Bilan */}
            <BilanSankey
              data={bilanData}
              onNodeClick={handleNodeClick}
            />

            {/* Panel Drilldown */}
            {drilldown && (
              <DrilldownPanel
                title={drilldown.title}
                category={drilldown.category === 'actif' ? 'revenue' : 'expense'}
                parentCategory={drilldown.category === 'actif' ? 'Actif' : 'Passif'}
                items={drilldown.items.map(item => ({
                  name: item.name,
                  value: item.value,
                }))}
                breadcrumbs={[drilldown.category === 'actif' ? 'Actif' : 'Passif', drilldown.title]}
                currentLevel={1}
                onClose={handleCloseDrilldown}
                onBreadcrumbClick={() => {}}
              />
            )}

            {/* Explication du bilan */}
            <div className="mt-6 bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">💡 Comprendre le bilan</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
                <div>
                  <p className="font-medium text-blue-400 mb-1">Actif (à gauche)</p>
                  <p>Ce que la Ville possède : bâtiments, équipements, créances, trésorerie...</p>
                </div>
                <div>
                  <p className="font-medium text-green-400 mb-1">Passif (à droite)</p>
                  <p>Comment c&apos;est financé : fonds propres (épargne) + dettes (emprunts).</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-700/50">
                <strong>Équilibre comptable :</strong> Actif = Passif. Les fonds propres élevés indiquent une bonne santé financière.
              </p>
            </div>
          </>
        ) : null}

        <footer className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <p>
              Données: Open Data Paris - Bilan comptable (M57)
            </p>
            <p>
              Années disponibles: {index.availableYears?.join(', ') || 'N/A'}
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
