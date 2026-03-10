'use client';

/**
 * InvestissementsAnnuelTab — Wrapper Investissements pour le composant partagé AnnuelTab.
 *
 * Breakdown : Thématique, Chapitre, Arrondissement.
 * Table preview : top 30 projets.
 */

import { useMemo } from 'react';
import AnnuelTab from '@/components/shared/AnnuelTab';
import ExportBar from '@/components/shared/ExportBar';
import type { BreakdownOption, TableColumnDef } from '@/components/shared/AnnuelTab';
import type { AutorisationProgramme } from '@/lib/types/map';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import type { CsvColumn } from '@/lib/export';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT, useTCategory } from '@/lib/localeContext';

const ARR_COLORS = [
  PALETTE.amber, PALETTE.orange, PALETTE.rose, PALETTE.red,
  PALETTE.pink, PALETTE.purple, PALETTE.violet, PALETTE.blue,
  PALETTE.sky, PALETTE.cyan, PALETTE.teal, PALETTE.emerald,
  PALETTE.green, PALETTE.lime, PALETTE.yellow, PALETTE.amber,
  PALETTE.orange, PALETTE.rose, PALETTE.red, PALETTE.pink, PALETTE.purple,
];

function getGroupColor(key: string, dim: string, index: number): string {
  if (dim === 'thematique') return getThematiqueColor(key);
  return ARR_COLORS[index % ARR_COLORS.length];
}

// ─── Component ───────────────────────────────────────────────────────────────

interface InvestissementsAnnuelTabProps {
  projets: AutorisationProgramme[];
  selectedYear: number;
  budgetInvest?: number;
  isLoading: boolean;
  onNavigateExplorer?: () => void;
}

export default function InvestissementsAnnuelTab({
  projets, selectedYear, budgetInvest, isLoading, onNavigateExplorer,
}: InvestissementsAnnuelTabProps) {
  const t = useT();
  const tCat = useTCategory();

  const csvColumns: CsvColumn<Record<string, unknown>>[] = useMemo(() => [
    { key: 'annee', label: t('invest.csv.annee') },
    { key: 'apTexte', label: t('invest.csv.projet') },
    { key: 'thematique', label: t('invest.csv.thematique') },
    { key: 'directionTexte', label: t('invest.csv.direction') },
    { key: 'montant', label: t('invest.csv.montant') },
    { key: 'arrondissement', label: t('invest.csv.arrondissement') },
  ], [t]);

  const breakdowns: BreakdownOption[] = useMemo(() => [
    { id: 'thematique', label: t('invest.breakdown.thematique'), icon: BREAKDOWN_ICONS.thematique },
    { id: 'chapitre', label: t('invest.breakdown.chapitre'), icon: BREAKDOWN_ICONS.chapitre },
    { id: 'arrondissement', label: t('invest.breakdown.arrondissement'), icon: BREAKDOWN_ICONS.arrondissement },
  ], [t]);

  const arrLabel = (arr: number | undefined): string => {
    if (arr === undefined || arr === null) return t('invest.arr.non_localise');
    if (arr === 0) return t('invest.arr.paris_centre');
    return `${arr}e`;
  };

  const getGroupKey = (p: AutorisationProgramme, dim: string): string => {
    switch (dim) {
      case 'thematique':
        return THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.label || p.thematique || t('invest.group.autre');
      case 'chapitre':
        return p.missionTexte || p.domaineTexte || t('invest.group.non_classifie');
      case 'arrondissement':
        return arrLabel(p.arrondissement);
      default:
        return t('invest.group.autre');
    }
  };

  const columns: TableColumnDef<AutorisationProgramme>[] = useMemo(() => [
    {
      key: 'projet', label: t('invest.col.projet'), align: 'left' as const,
      render: (p: AutorisationProgramme, i: number) => (
        <div className="flex items-start gap-2">
          <span className="text-slate-400 text-xs w-5 shrink-0">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{p.apTexte}</p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1">
              {THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.icon || '📋'}{' '}
              {tCat(THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.label || p.thematique)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'chapitre', label: t('invest.col.chapitre'), hideOnMobile: true, align: 'left' as const,
      render: (p: AutorisationProgramme) => <p className="text-xs text-slate-400 line-clamp-2">{tCat(p.missionTexte || '')}</p>,
    },
    {
      key: 'montant', label: t('invest.col.montant'), align: 'right' as const,
      render: (p: AutorisationProgramme) => <p className="text-xs md:text-sm font-semibold text-amber-400 whitespace-nowrap">{formatEuroCompact(p.montant)}</p>,
    },
    {
      key: 'arr', label: t('invest.col.arr'), hideOnMobile: true, align: 'center' as const,
      render: (p: AutorisationProgramme) => p.arrondissement !== undefined
        ? <span className="text-sm text-slate-300">{arrLabel(p.arrondissement)}</span>
        : <span className="text-slate-500">-</span>,
    },
  ], [t, tCat]);

  const stats = useMemo(() => {
    const totalMontant = projets.reduce((s, p) => s + p.montant, 0);
    const coverage = budgetInvest && budgetInvest > 0
      ? ((totalMontant / budgetInvest) * 100).toFixed(0) : null;
    return { total: projets.length, totalMontant, coverage };
  }, [projets, budgetInvest]);

  const topKpis = useMemo(() => {
    if (projets.length === 0) return null;
    const sorted = [...projets].sort((a, b) => b.montant - a.montant);
    return {
      topName: sorted[0].apTexte,
      topVal: sorted[0].montant,
      median: sorted[Math.floor(sorted.length / 2)].montant,
    };
  }, [projets]);

  return (
    <AnnuelTab
      items={projets}
      isLoading={isLoading}
      theme="amber"
      breakdowns={breakdowns}
      getGroupKey={getGroupKey}
      getGroupColor={getGroupColor}
      getValue={(p) => p.montant}
      treemapTitle={t('invest.treemap_title')}
      tooltipCountLabel={t('invest.tooltip_count')}
      itemLabel={t('invest.item_label')}
      columns={columns}
      sortItems={(a, b) => b.montant - a.montant}
      getItemKey={(p) => p.id}
      onNavigateExplorer={onNavigateExplorer}
      banner={
        stats.coverage ? (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-sm text-blue-300">
            <strong>{t('invest.banner.couverture')}</strong> {t('invest.banner.text')}{' '}
            <strong>~{stats.coverage}%</strong>{' '}
            {t('invest.banner.du_budget')} ({budgetInvest ? formatEuroCompact(budgetInvest) : '—'}).
          </div>
        ) : undefined
      }
      kpiCards={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('invest.kpi.montant_total')}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalMontant)}</p>
            <p className="text-xs text-slate-400 mt-1">{formatNumber(stats.total)} {t('invest.kpi.projets_localises')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('invest.kpi.budget_invest_total')}</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{budgetInvest ? formatEuroCompact(budgetInvest) : '—'}</p>
            <p className="text-xs text-slate-400 mt-1">{budgetInvest ? `${formatNumber(Math.round(budgetInvest / PARIS_POPULATION_TOTAL))} ${t('invest.kpi.euro_hab')}` : selectedYear}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('invest.kpi.projet_median')}</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{topKpis ? formatEuroCompact(topKpis.median) : '—'}</p>
            <p className="text-xs text-slate-400 mt-1">{t('invest.kpi.montant_median')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('invest.kpi.top_projet')}</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{topKpis ? formatEuroCompact(topKpis.topVal) : '—'}</p>
            <p className="text-xs text-slate-400 mt-1 line-clamp-1">{topKpis?.topName || '—'}</p>
          </div>
        </div>
      }
      exportBar={
        <ExportBar
          csvData={projets as unknown as Record<string, unknown>[]}
          csvColumns={csvColumns}
          filename="investissements_annuel"
        />
      }
    />
  );
}
