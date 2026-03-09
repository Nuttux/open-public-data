'use client';

/**
 * PatrimoineAnnuelTab — Tab "Annuel" de la page /patrimoine.
 *
 * Contenu : BilanSankey + KPIs (Actif net, Fonds propres, Dette, Ratio endettement).
 * Migré depuis l'ancien /bilan/page.tsx.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import YearSelector from '@/components/YearSelector';
import BilanSankey from '@/components/BilanSankey';
import DrilldownPanel from '@/components/DrilldownPanel';
import ExportBar from '@/components/shared/ExportBar';
import GlossaryTip from '@/components/GlossaryTip';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import { loadBilanSankey, type BilanSankeyData } from '@/lib/api/staticData';
import { formatEuroCompact, formatPercent } from '@/lib/formatters';
import { useT } from '@/lib/localeContext';

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

/** Translate a data node name for display, falling back to original */
function tn(name: string, t: (k: string) => string): string {
  const key = `node.${name}`;
  const val = t(key);
  return val === key ? name : val;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** KPI cards for bilan comptable */
function BilanStatsCards({ data }: { data: BilanSankeyData }) {
  const t = useT();
  const { totals, kpis } = data;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-emerald-400">●</span>
          <span className="text-xs text-slate-400">{t('patri_annuel.net_assets')} <GlossaryTip term="actif_net" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-emerald-400">{formatEuroCompact(totals.actif_net)}</div>
        <div className="text-xs text-slate-500 mt-1">{t('patri_annuel.net_assets_desc')}</div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-400">●</span>
          <span className="text-xs text-slate-400">{t('patri_annuel.equity')} <GlossaryTip term="fonds_propres" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-blue-400">{formatEuroCompact(totals.fonds_propres)}</div>
        <div className="text-xs text-slate-500 mt-1">{formatPercent(kpis.pct_fonds_propres)} {t('patri_annuel.of_liabilities')}</div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-400">●</span>
          <span className="text-xs text-slate-400">{t('patri_annuel.total_debt')} <GlossaryTip term="dette_totale" /></span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-red-400">{formatEuroCompact(totals.dette_totale)}</div>
        <div className="text-xs text-slate-500 mt-1">{t('patri_annuel.financial_debt')} {formatEuroCompact(totals.dettes_financieres)}</div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={kpis.ratio_endettement && kpis.ratio_endettement > 1 ? 'text-amber-400' : 'text-emerald-400'}>●</span>
          <span className="text-xs text-slate-400">{t('patri_annuel.debt_ratio')} <GlossaryTip term="ratio_endettement" /></span>
        </div>
        <div className={`text-xl sm:text-2xl font-bold ${kpis.ratio_endettement && kpis.ratio_endettement > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
          {kpis.ratio_endettement ? kpis.ratio_endettement.toFixed(2) : 'N/A'}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {kpis.ratio_endettement && kpis.ratio_endettement <= 1 ? t('patri_annuel.healthy') : t('patri_annuel.debt_exceeds')}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function PatrimoineAnnuelTab({ availableYears, selectedYear, onYearChange }: PatrimoineAnnuelTabProps) {
  const t = useT();
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
          setError(t('patri_annuel.data_unavailable').replace('{year}', String(selectedYear)));
          setBilanData(null);
        }
      } catch (err) {
        console.error('Error loading bilan data:', err);
        setError(t('patri_annuel.loading_error').replace('{year}', String(selectedYear)));
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

  // ── CSV export data (bilan links) ──
  const csvLinks = useMemo(() => {
    if (!bilanData) return [];
    return bilanData.links.map(l => ({
      source: l.source,
      target: l.target,
      value: l.value,
    })) as unknown as Record<string, unknown>[];
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

          <ExportBar
            csvData={csvLinks}
            csvColumns={[
              { key: 'source', label: 'Source' },
              { key: 'target', label: 'Destination' },
              { key: 'value', label: 'Montant (€)' },
            ]}
            filename={`patrimoine_bilan_${selectedYear}`}
          />

          <BilanSankey data={bilanData} onNodeClick={handleNodeClick} />

          {/* Desktop: DrilldownPanel inline below Sankey */}
          {!isMobile && drilldown && (
            <DrilldownPanel
              title={tn(drilldown.title, t)}
              category={drilldown.category === 'actif' ? 'revenue' : 'expense'}
              parentCategory={drilldown.category === 'actif' ? t('patri_annuel.actif') : t('patri_annuel.passif')}
              items={drilldown.items.map(item => ({ name: item.name, value: item.value }))}
              breadcrumbs={[drilldown.category === 'actif' ? t('patri_annuel.actif') : t('patri_annuel.passif'), tn(drilldown.title, t)]}
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
                  title={tn(drilldown.title, t)}
                  category={drilldown.category === 'actif' ? 'revenue' : 'expense'}
                  parentCategory={drilldown.category === 'actif' ? t('patri_annuel.actif') : t('patri_annuel.passif')}
                  items={drilldown.items.map(item => ({ name: item.name, value: item.value }))}
                  breadcrumbs={[drilldown.category === 'actif' ? t('patri_annuel.actif') : t('patri_annuel.passif'), tn(drilldown.title, t)]}
                  currentLevel={1}
                  onClose={handleCloseDrilldown}
                  onBreadcrumbClick={() => {}}
                />
              </div>
            </div>
          )}

          {/* Explication */}
          <div className="mt-6 bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-2">{t('patri_annuel.understand_title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
              <div>
                <p className="font-medium text-emerald-400 mb-1">{t('patri_annuel.assets_left')}</p>
                <p>{t('patri_annuel.assets_desc')}</p>
              </div>
              <div>
                <p className="font-medium text-blue-400 mb-1">{t('patri_annuel.liabilities_right')}</p>
                <p>{t('patri_annuel.liabilities_desc')}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-700/50"
              dangerouslySetInnerHTML={{ __html: t('patri_annuel.balance_rule') }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
