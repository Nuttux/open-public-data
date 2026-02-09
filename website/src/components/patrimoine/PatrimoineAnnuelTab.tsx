'use client';

/**
 * PatrimoineAnnuelTab — Tab "Annuel" de la page /patrimoine.
 *
 * Contenu : BilanSankey + KPIs (Actif net, Fonds propres, Dette, Ratio endettement).
 * Migré depuis l'ancien /bilan/page.tsx.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import YearSelector from '@/components/YearSelector';
import BilanSankey from '@/components/BilanSankey';
import DrilldownPanel from '@/components/DrilldownPanel';
import GlossaryTip from '@/components/GlossaryTip';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import { loadBilanSankey, type BilanSankeyData } from '@/lib/api/staticData';
import { formatEuroCompact, formatPercent } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatrimoineAnnuelTabProps {
  availableYears: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}

interface BilanDrilldownState {
  title: string;
  category: 'actif' | 'passif';
  items: Array<{ name: string; value: number; brut?: number; amort?: number }>;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** KPI cards for bilan comptable */
function BilanStatsCards({ data }: { data: BilanSankeyData }) {
  const { totals, kpis } = data;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-emerald-400">●</span>
          <span className="text-xs text-slate-400">Actif Net <GlossaryTip term="actif_net" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-emerald-400">{formatEuroCompact(totals.actif_net)}</div>
        <div className="text-xs text-slate-500 mt-1">Ce que Paris possède</div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-400">●</span>
          <span className="text-xs text-slate-400">Fonds propres <GlossaryTip term="fonds_propres" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-blue-400">{formatEuroCompact(totals.fonds_propres)}</div>
        <div className="text-xs text-slate-500 mt-1">{formatPercent(kpis.pct_fonds_propres)} du passif</div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-400">●</span>
          <span className="text-xs text-slate-400">Dette totale <GlossaryTip term="dette_totale" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-red-400">{formatEuroCompact(totals.dette_totale)}</div>
        <div className="text-xs text-slate-500 mt-1">Financière : {formatEuroCompact(totals.dettes_financieres)}</div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={kpis.ratio_endettement && kpis.ratio_endettement > 1 ? 'text-amber-400' : 'text-emerald-400'}>●</span>
          <span className="text-xs text-slate-400">Ratio endettement <GlossaryTip term="ratio_endettement" /></span>
        </div>
        <div className={`text-xl sm:text-2xl font-bold ${kpis.ratio_endettement && kpis.ratio_endettement > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
          {kpis.ratio_endettement ? kpis.ratio_endettement.toFixed(2) : 'N/A'}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {kpis.ratio_endettement && kpis.ratio_endettement <= 1 ? '✓ Niveau sain' : '⚠ Dette > Fonds propres'}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function PatrimoineAnnuelTab({ availableYears, selectedYear, onYearChange }: PatrimoineAnnuelTabProps) {
  const [bilanData, setBilanData] = useState<BilanSankeyData | null>(null);
  const [drilldown, setDrilldown] = useState<BilanDrilldownState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile slide-in overlay state (même pattern que BudgetAnnuelTab)
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const [mobileSlideVisible, setMobileSlideVisible] = useState(false);
  const prevDrilldownRef = useRef<BilanDrilldownState | null>(null);

  // Trigger mobile slide-in when drilldown opens
  useEffect(() => {
    if (isMobile && drilldown && !prevDrilldownRef.current) {
      requestAnimationFrame(() => setMobileSlideVisible(true));
    }
    if (!drilldown) {
      setMobileSlideVisible(false);
    }
    prevDrilldownRef.current = drilldown;
  }, [drilldown, isMobile]);

  // Lock body scroll when mobile overlay is visible
  useEffect(() => {
    if (isMobile && mobileSlideVisible) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile, mobileSlideVisible]);

  useEffect(() => {
    async function fetchData() {
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
    fetchData();
  }, [selectedYear]);

  const handleNodeClick = useCallback((nodeName: string, category: 'actif' | 'passif') => {
    if (!bilanData) return;
    const items = bilanData.drilldown[category]?.[nodeName];
    if (items && items.length > 0) {
      setDrilldown({ title: nodeName, category, items: items.sort((a, b) => b.value - a.value) });
    }
  }, [bilanData]);

  /** Close drilldown — on mobile, animate out first then clear state */
  const handleCloseDrilldown = useCallback(() => {
    if (isMobile) {
      setMobileSlideVisible(false);
      setTimeout(() => setDrilldown(null), 300);
    } else {
      setDrilldown(null);
    }
  }, [isMobile]);

  return (
    <div>
      {/* Year selector */}
      <div className="flex justify-end mb-6">
        <YearSelector years={availableYears} selectedYear={selectedYear} onYearChange={onYearChange} />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400 flex items-center gap-2"><span>⚠</span>{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="bg-slate-800/50 rounded-xl p-5 h-24 skeleton" />)}
          </div>
          <div className="bg-slate-800/50 rounded-xl p-6 h-[500px] skeleton" />
        </div>
      ) : bilanData ? (
        <>
          <BilanStatsCards data={bilanData} />
          <BilanSankey data={bilanData} onNodeClick={handleNodeClick} />

          {/* Desktop: DrilldownPanel inline below Sankey */}
          {!isMobile && drilldown && (
            <DrilldownPanel
              title={drilldown.title}
              category={drilldown.category === 'actif' ? 'revenue' : 'expense'}
              parentCategory={drilldown.category === 'actif' ? 'Actif' : 'Passif'}
              items={drilldown.items.map(item => ({ name: item.name, value: item.value }))}
              breadcrumbs={[drilldown.category === 'actif' ? 'Actif' : 'Passif', drilldown.title]}
              currentLevel={1}
              onClose={handleCloseDrilldown}
              onBreadcrumbClick={() => {}}
            />
          )}

          {/* Mobile: fullscreen slide-in overlay for drilldown */}
          {isMobile && drilldown && (
            <div
              className={`fixed inset-0 z-50 bg-slate-900 overflow-y-auto transition-transform duration-300 ease-out ${
                mobileSlideVisible ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="p-4 pt-safe pb-safe">
                <DrilldownPanel
                  title={drilldown.title}
                  category={drilldown.category === 'actif' ? 'revenue' : 'expense'}
                  parentCategory={drilldown.category === 'actif' ? 'Actif' : 'Passif'}
                  items={drilldown.items.map(item => ({ name: item.name, value: item.value }))}
                  breadcrumbs={[drilldown.category === 'actif' ? 'Actif' : 'Passif', drilldown.title]}
                  currentLevel={1}
                  onClose={handleCloseDrilldown}
                  onBreadcrumbClick={() => {}}
                />
              </div>
            </div>
          )}

          {/* Explication */}
          <div className="mt-6 bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Comprendre le bilan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
              <div>
                <p className="font-medium text-emerald-400 mb-1">Actif (à gauche)</p>
                <p>Ce que la Ville possède : bâtiments, équipements, créances, trésorerie...</p>
              </div>
              <div>
                <p className="font-medium text-blue-400 mb-1">Passif (à droite)</p>
                <p>Comment c&apos;est financé : fonds propres (épargne) + dettes (emprunts).</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-700/50">
              <strong>Équilibre comptable :</strong> Actif = Passif. Les fonds propres élevés indiquent une bonne santé financière.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
