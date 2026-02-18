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
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { THEMATIQUE_LABELS, type ThematiqueSubvention } from '@/lib/constants/directions';
import type { CsvColumn } from '@/lib/export';
import { BREAKDOWN_ICONS } from '@/lib/icons';

const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
  { key: 'annee', label: 'Année' },
  { key: 'apTexte', label: 'Projet' },
  { key: 'thematique', label: 'Thématique' },
  { key: 'directionTexte', label: 'Direction' },
  { key: 'montant', label: 'Montant (€)' },
  { key: 'arrondissement', label: 'Arrondissement' },
];

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'thematique', label: 'Thématique', icon: BREAKDOWN_ICONS.thematique },
  { id: 'chapitre', label: 'Chapitre', icon: BREAKDOWN_ICONS.chapitre },
  { id: 'arrondissement', label: 'Arrondissement', icon: BREAKDOWN_ICONS.arrondissement },
];

const ARR_COLORS = [
  PALETTE.amber, PALETTE.orange, PALETTE.rose, PALETTE.red,
  PALETTE.pink, PALETTE.purple, PALETTE.violet, PALETTE.blue,
  PALETTE.sky, PALETTE.cyan, PALETTE.teal, PALETTE.emerald,
  PALETTE.green, PALETTE.lime, PALETTE.yellow, PALETTE.amber,
  PALETTE.orange, PALETTE.rose, PALETTE.red, PALETTE.pink, PALETTE.purple,
];

function arrLabel(arr: number | undefined): string {
  if (arr === undefined || arr === null) return 'Non localisé';
  if (arr === 0) return 'Paris Centre';
  return `${arr}e`;
}

function getGroupKey(p: AutorisationProgramme, dim: string): string {
  switch (dim) {
    case 'thematique':
      return THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.label || p.thematique || 'Autre';
    case 'chapitre':
      return p.missionTexte || p.domaineTexte || 'Non classifié';
    case 'arrondissement':
      return arrLabel(p.arrondissement);
    default:
      return 'Autre';
  }
}

function getGroupColor(key: string, dim: string, index: number): string {
  if (dim === 'thematique') return getThematiqueColor(key);
  return ARR_COLORS[index % ARR_COLORS.length];
}

const COLUMNS: TableColumnDef<AutorisationProgramme>[] = [
  {
    key: 'projet', label: 'Projet', align: 'left',
    render: (p, i) => (
      <div className="flex items-start gap-2">
        <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span>
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{p.apTexte}</p>
          <p className="text-[10px] md:text-xs text-slate-500 mt-1">
            {THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.icon || '📋'}{' '}
            {THEMATIQUE_LABELS[p.thematique as ThematiqueSubvention]?.label || p.thematique}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'chapitre', label: 'Chapitre', hideOnMobile: true, align: 'left',
    render: (p) => <p className="text-xs text-slate-400 line-clamp-2">{p.missionTexte}</p>,
  },
  {
    key: 'montant', label: 'Montant', align: 'right',
    render: (p) => <p className="text-xs md:text-sm font-semibold text-amber-400 whitespace-nowrap">{formatEuroCompact(p.montant)}</p>,
  },
  {
    key: 'arr', label: 'Arr.', hideOnMobile: true, align: 'center',
    render: (p) => p.arrondissement !== undefined
      ? <span className="text-sm text-slate-300">{arrLabel(p.arrondissement)}</span>
      : <span className="text-slate-500">-</span>,
  },
];

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
      breakdowns={BREAKDOWNS}
      getGroupKey={getGroupKey}
      getGroupColor={getGroupColor}
      getValue={(p) => p.montant}
      treemapTitle="Répartition des investissements"
      tooltipCountLabel="Projets"
      itemLabel="projets"
      columns={COLUMNS}
      sortItems={(a, b) => b.montant - a.montant}
      getItemKey={(p) => p.id}
      onNavigateExplorer={onNavigateExplorer}
      banner={
        stats.coverage ? (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-sm text-blue-300">
            <strong>Couverture :</strong> Investissements localisables représentant{' '}
            <strong>~{stats.coverage}%</strong>{' '}
            du budget d&apos;investissement ({budgetInvest ? formatEuroCompact(budgetInvest) : '—'}).
          </div>
        ) : undefined
      }
      kpiCards={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Montant total</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalMontant)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatNumber(stats.total)} projets</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Projet médian</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{topKpis ? formatEuroCompact(topKpis.median) : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">montant médian</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Top projet</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{topKpis ? formatEuroCompact(topKpis.topVal) : '—'}</p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{topKpis?.topName || '—'}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Budget invest. total</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{budgetInvest ? formatEuroCompact(budgetInvest) : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">{selectedYear}</p>
          </div>
        </div>
      }
      exportBar={
        <ExportBar
          csvData={projets as unknown as Record<string, unknown>[]}
          csvColumns={CSV_COLUMNS}
          filename="investissements_annuel"
        />
      }
    />
  );
}
