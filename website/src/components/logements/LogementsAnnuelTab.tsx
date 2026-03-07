'use client';

/**
 * LogementsAnnuelTab — Wrapper Logements pour le composant partagé AnnuelTab.
 *
 * Breakdown : Bailleur, Arrondissement, Type de logement (PLAI/PLUS/PLS).
 * Table preview : top 30 programmes.
 */

import { useMemo } from 'react';
import AnnuelTab from '@/components/shared/AnnuelTab';
import ExportBar from '@/components/shared/ExportBar';
import type { BreakdownOption, TableColumnDef } from '@/components/shared/AnnuelTab';
import type { LogementSocial } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { PALETTE } from '@/lib/colors';
import type { CsvColumn } from '@/lib/export';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

function getCsvColumns(t: (k: string) => string): CsvColumn<Record<string, unknown>>[] {
  return [
    { key: 'annee', label: t('logements.csv.year') },
    { key: 'adresse', label: t('logements.csv.address') },
    { key: 'codePostal', label: t('logements.csv.postal_code') },
    { key: 'arrondissement', label: t('logements.csv.arrondissement') },
    { key: 'bailleur', label: t('logements.csv.landlord') },
    { key: 'nbLogements', label: t('logements.csv.nb_housing') },
    { key: 'nbPLAI', label: 'PLAI' },
    { key: 'nbPLUS', label: 'PLUS' },
    { key: 'nbPLS', label: 'PLS' },
    { key: 'modeRealisation', label: t('logements.csv.mode') },
    { key: 'natureProgramme', label: t('logements.csv.nature') },
  ];
}

// ─── Config ──────────────────────────────────────────────────────────────────

function getBreakdowns(t: (k: string) => string): BreakdownOption[] {
  return [
    { id: 'type', label: t('logements.breakdown.type'), icon: BREAKDOWN_ICONS.type },
    { id: 'bailleur', label: t('logements.breakdown.landlord'), icon: BREAKDOWN_ICONS.bailleur },
    { id: 'arrondissement', label: t('logements.breakdown.arrondissement'), icon: BREAKDOWN_ICONS.arrondissement },
  ];
}

const DIM_COLORS = [
  PALETTE.emerald, PALETTE.cyan, PALETTE.blue, PALETTE.purple,
  PALETTE.amber, PALETTE.pink, PALETTE.green, PALETTE.orange,
  PALETTE.teal, PALETTE.violet, PALETTE.rose, PALETTE.red,
  PALETTE.sky, PALETTE.lime, PALETTE.yellow, PALETTE.slate,
  PALETTE.emerald, PALETTE.cyan, PALETTE.blue, PALETTE.purple,
  PALETTE.amber, PALETTE.pink,
];

const ARR_COLORS = [
  PALETTE.emerald, PALETTE.teal, PALETTE.cyan, PALETTE.blue,
  PALETTE.sky, PALETTE.violet, PALETTE.purple, PALETTE.pink,
  PALETTE.rose, PALETTE.red, PALETTE.orange, PALETTE.amber,
  PALETTE.yellow, PALETTE.lime, PALETTE.green, PALETTE.emerald,
  PALETTE.teal, PALETTE.cyan, PALETTE.blue, PALETTE.sky, PALETTE.violet,
];

function makeArrLabel(t: (k: string) => string) {
  return function arrLabel(code: number): string {
    if (code === 0) return t('logements.paris_centre');
    return `${code}e arr.`;
  };
}

/** Couleurs fixes par type de logement (alignées avec la légende) */
const TYPE_COLOR_MAP: Record<string, string> = {
  'PLAI (très social)': PALETTE.blue,
  'PLUS (social)': PALETTE.cyan,
  'PLS (intermédiaire)': PALETTE.violet,
};

/** Renvoie le type dominant d'un programme (celui avec le plus de logements) */
function getDominantType(l: LogementSocial): string {
  const plai = l.nbPLAI || 0;
  const plus = l.nbPLUS || 0;
  const pls = l.nbPLS || 0;
  if (plai >= plus && plai >= pls) return 'PLAI (très social)';
  if (plus >= plai && plus >= pls) return 'PLUS (social)';
  return 'PLS (intermédiaire)';
}

function makeGetGroupKey(t: (k: string) => string, arrLabel: (code: number) => string) {
  return function getGroupKey(l: LogementSocial, dim: string): string {
    switch (dim) {
      case 'bailleur':
        return l.bailleur || t('logements.not_specified');
      case 'arrondissement':
        return arrLabel(l.arrondissement);
      case 'type':
        return getDominantType(l);
      default:
        return t('logements.other');
    }
  };
}

function getGroupColor(key: string, dim: string, index: number): string {
  if (key === 'Autres') return PALETTE.slate;
  if (dim === 'type') return TYPE_COLOR_MAP[key] || PALETTE.slate;
  if (dim === 'arrondissement') return ARR_COLORS[index % ARR_COLORS.length];
  return DIM_COLORS[index % DIM_COLORS.length];
}

function getColumns(t: (k: string) => string, arrLabel: (code: number) => string): TableColumnDef<LogementSocial>[] {
  return [
  {
    key: 'programme', label: t('logements.col.programme'), align: 'left',
    render: (l, i) => (
      <div className="flex items-start gap-2">
        <span className="text-slate-400 text-xs w-5 shrink-0">{i + 1}</span>
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{l.adresse}</p>
          <p className="text-[10px] md:text-xs text-slate-400 mt-1">
            {l.bailleur}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'arrondissement', label: t('logements.col.arr'), hideOnMobile: true, align: 'center',
    render: (l) => <span className="text-sm text-slate-300">{arrLabel(l.arrondissement)}</span>,
  },
  {
    key: 'logements', label: t('logements.col.housing'), align: 'right',
    render: (l) => <p className="text-xs md:text-sm font-semibold text-emerald-400 whitespace-nowrap">{formatNumber(l.nbLogements)}</p>,
  },
  {
    key: 'detail', label: 'PLAI / PLUS / PLS', hideOnMobile: true, align: 'right',
    render: (l) => (
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-blue-400">{l.nbPLAI || 0}</span>
        <span className="text-slate-600">/</span>
        <span className="text-cyan-400">{l.nbPLUS || 0}</span>
        <span className="text-slate-600">/</span>
        <span className="text-violet-400">{l.nbPLS || 0}</span>
      </div>
    ),
  },
  ];
}

// ─── Component ───────────────────────────────────────────────────────────────

interface LogementsAnnuelTabProps {
  logements: LogementSocial[];
  selectedYear: number;
  isLoading: boolean;
  onNavigateExplorer?: () => void;
}

export default function LogementsAnnuelTab({
  logements, selectedYear, isLoading, onNavigateExplorer,
}: LogementsAnnuelTabProps) {
  const t = useT();
  const arrLabel = makeArrLabel(t);
  const getGroupKey = makeGetGroupKey(t, arrLabel);
  const kpiStats = useMemo(() => {
    const totalLogements = logements.reduce((s, l) => s + l.nbLogements, 0);
    const totalPLAI = logements.reduce((s, l) => s + (l.nbPLAI || 0), 0);
    const totalPLUS = logements.reduce((s, l) => s + (l.nbPLUS || 0), 0);
    const totalPLS = logements.reduce((s, l) => s + (l.nbPLS || 0), 0);
    const per1000 = (totalLogements / PARIS_POPULATION_TOTAL) * 1000;
    return { totalLogements, totalPLAI, totalPLUS, totalPLS, per1000 };
  }, [logements]);

  return (
    <AnnuelTab
      items={logements}
      isLoading={isLoading}
      theme="emerald"
      breakdowns={getBreakdowns(t)}
      getGroupKey={getGroupKey}
      getGroupColor={getGroupColor}
      getValue={(l) => l.nbLogements}
      treemapTitle={t('logements.treemap_title')}
      tooltipCountLabel={t('logements.tooltip_count')}
      tooltipValueLabel={t('logements.tooltip_value')}
      formatValue={(v) => formatNumber(v) + t('logements.format_value_suffix')}
      maxGroups={(dim) => dim === 'bailleur' ? 12 : undefined}
      itemLabel={t('logements.item_label')}
      columns={getColumns(t, arrLabel)}
      sortItems={(a, b) => b.nbLogements - a.nbLogements}
      getItemKey={(l, i) => `${l.id}-${i}`}
      onNavigateExplorer={onNavigateExplorer}
      formatTotal={(items) => formatNumber(items.reduce((s, l) => s + l.nbLogements, 0)) + t('logements.format_total_suffix')}
      banner={
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 mb-6">
          <h3 className="text-sm font-medium text-slate-300 mb-3">{t('logements.housing_types_title')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">{t('logements.plai_label')}</p>
                <p className="text-slate-500">{t('logements.plai_desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">{t('logements.plus_label')}</p>
                <p className="text-slate-500">{t('logements.plus_desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">{t('logements.pls_label')}</p>
                <p className="text-slate-500">{t('logements.pls_desc')}</p>
              </div>
            </div>
          </div>
        </div>
      }
      kpiCards={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('logements.kpi_funded')}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatNumber(kpiStats.totalLogements)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.per1000.toFixed(1)} {t('logements.kpi_per_1000')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('logements.kpi_very_social')}</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{formatNumber(kpiStats.totalPLAI)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.totalLogements > 0 ? ((kpiStats.totalPLAI / kpiStats.totalLogements) * 100).toFixed(0) : 0}{t('logements.kpi_pct_total')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('logements.kpi_social')}</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{formatNumber(kpiStats.totalPLUS)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.totalLogements > 0 ? ((kpiStats.totalPLUS / kpiStats.totalLogements) * 100).toFixed(0) : 0}{t('logements.kpi_pct_total')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('logements.kpi_intermediate')}</p>
            <p className="text-2xl font-bold text-violet-400 mt-1">{formatNumber(kpiStats.totalPLS)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.totalLogements > 0 ? ((kpiStats.totalPLS / kpiStats.totalLogements) * 100).toFixed(0) : 0}{t('logements.kpi_pct_total')}</p>
          </div>
        </div>
      }
      exportBar={
        <ExportBar
          csvData={logements as unknown as Record<string, unknown>[]}
          csvColumns={getCsvColumns(t)}
          filename={`logements_sociaux_${selectedYear}`}
        />
      }
    />
  );
}
