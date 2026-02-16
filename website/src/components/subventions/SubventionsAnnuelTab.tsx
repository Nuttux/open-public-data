'use client';

/**
 * SubventionsAnnuelTab — Wrapper Subventions pour le composant partagé AnnuelTab.
 *
 * Breakdown : Thématique, Direction, Type d'organisme.
 * Table preview : top 30 bénéficiaires.
 */

import { useMemo } from 'react';
import AnnuelTab from '@/components/shared/AnnuelTab';
import type { BreakdownOption, TableColumnDef } from '@/components/shared/AnnuelTab';
import DataQualityBanner from '@/components/DataQualityBanner';
import type { Beneficiaire } from '@/components/SubventionsTable';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor, PALETTE } from '@/lib/colors';

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'thematique', label: 'Thématique', icon: '🎯' },
  { id: 'direction', label: 'Direction', icon: '🏛' },
  { id: 'type_organisme', label: 'Type organisme', icon: '👥' },
];

/** Mapping nature juridique → type organisme simplifié */
const NATURE_TO_TYPE: Record<string, string> = {
  'Associations': 'Associations',
  'Etablissements publics': 'Établissements publics',
  'Etablissements de droit public': 'Établissements publics',
  'Autres personnes de droit public': 'Établissements publics',
  'Etat': 'Établissements publics',
  'Communes': 'Établissements publics',
  'Département': 'Établissements publics',
  'Régions': 'Établissements publics',
  'Entreprises': 'Entreprises',
  'Autres personnes de droit privé': 'Autres privés',
  'Personnes physiques': 'Personnes physiques',
  'Autres': 'Autres',
};

const DIM_COLORS = [
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green, PALETTE.orange, PALETTE.red,
  PALETTE.teal, PALETTE.emerald, PALETTE.violet, PALETTE.rose,
  PALETTE.sky, PALETTE.lime, PALETTE.yellow, PALETTE.slate,
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green,
];

function getGroupKey(b: Beneficiaire, dim: string): string {
  switch (dim) {
    case 'thematique':
      return b.thematique || 'Non classifié';
    case 'direction':
      return b.direction || 'Non renseignée';
    case 'type_organisme':
      return NATURE_TO_TYPE[b.nature_juridique || ''] || 'Autres';
    default:
      return 'Autre';
  }
}

function getGroupColor(key: string, dim: string, index: number): string {
  if (dim === 'thematique') return getThematiqueColor(key);
  return DIM_COLORS[index % DIM_COLORS.length];
}

const COLUMNS: TableColumnDef<Beneficiaire>[] = [
  {
    key: 'beneficiaire', label: 'Bénéficiaire', align: 'left',
    render: (b, i) => (
      <div className="flex items-start gap-2">
        <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span>
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{b.beneficiaire}</p>
          <p className="text-[10px] md:text-xs text-slate-500 mt-1">
            {b.nature_juridique || 'N/A'}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'thematique', label: 'Thématique', hideOnMobile: true, align: 'left',
    render: (b) => <p className="text-xs text-slate-400 line-clamp-2">{b.thematique}</p>,
  },
  {
    key: 'montant', label: 'Montant', align: 'right',
    render: (b) => <p className="text-xs md:text-sm font-semibold text-purple-400 whitespace-nowrap">{formatEuroCompact(b.montant_total)}</p>,
  },
  {
    key: 'direction', label: 'Dir.', hideOnMobile: true, align: 'center',
    render: (b) => b.direction
      ? <span className="text-sm text-slate-300">{b.direction}</span>
      : <span className="text-slate-500">-</span>,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface SubventionsAnnuelTabProps {
  selectedYear: number;
  beneficiaires: Beneficiaire[];
  nbSubventions: number;
  isLoading: boolean;
  error: string | null;
  onNavigateExplorer?: () => void;
}

export default function SubventionsAnnuelTab({
  selectedYear, beneficiaires, nbSubventions, isLoading, error, onNavigateExplorer,
}: SubventionsAnnuelTabProps) {
  const stats = useMemo(() => {
    const totalMontant = beneficiaires.reduce((s, b) => s + b.montant_total, 0);
    return { total: beneficiaires.length, totalMontant };
  }, [beneficiaires]);

  const topKpis = useMemo(() => {
    if (beneficiaires.length === 0) return null;
    const sorted = [...beneficiaires].sort((a, b) => b.montant_total - a.montant_total);
    return {
      topName: sorted[0].beneficiaire,
      topVal: sorted[0].montant_total,
      median: sorted[Math.floor(sorted.length / 2)].montant_total,
    };
  }, [beneficiaires]);

  return (
    <AnnuelTab
      items={beneficiaires}
      isLoading={isLoading}
      theme="purple"
      breakdowns={BREAKDOWNS}
      getGroupKey={getGroupKey}
      getGroupColor={getGroupColor}
      getValue={(b) => b.montant_total}
      treemapTitle="Répartition des subventions"
      tooltipCountLabel="Bénéficiaires"
      itemLabel="bénéficiaires"
      columns={COLUMNS}
      sortItems={(a, b) => b.montant_total - a.montant_total}
      getItemKey={(b, i) => `${b.beneficiaire}-${i}`}
      onNavigateExplorer={onNavigateExplorer}
      banner={
        <>
          <DataQualityBanner dataset="subventions" year={selectedYear} />
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
              <p className="text-red-400 flex items-center gap-2"><span>⚠</span>{error}</p>
            </div>
          )}
        </>
      }
      kpiCards={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Montant total</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatEuroCompact(stats.totalMontant)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatNumber(nbSubventions)} subventions</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Bénéficiaire médian</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{topKpis ? formatEuroCompact(topKpis.median) : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">montant médian</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Top bénéficiaire</p>
            <p className="text-lg font-bold text-emerald-400 mt-1 truncate" title={topKpis?.topName}>
              {topKpis ? formatEuroCompact(topKpis.topVal) : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1 truncate" title={topKpis?.topName}>
              {topKpis?.topName?.slice(0, 30) || '—'}
            </p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Bénéficiaires</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{formatNumber(stats.total)}</p>
            <p className="text-xs text-slate-500 mt-1">{selectedYear}</p>
          </div>
        </div>
      }
    />
  );
}
