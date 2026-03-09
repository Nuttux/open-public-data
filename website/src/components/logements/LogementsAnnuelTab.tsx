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

const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
  { key: 'annee', label: 'Année' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'codePostal', label: 'Code postal' },
  { key: 'arrondissement', label: 'Arrondissement' },
  { key: 'bailleur', label: 'Bailleur' },
  { key: 'nbLogements', label: 'Nb logements' },
  { key: 'nbPLAI', label: 'PLAI' },
  { key: 'nbPLUS', label: 'PLUS' },
  { key: 'nbPLS', label: 'PLS' },
  { key: 'modeRealisation', label: 'Mode réalisation' },
  { key: 'natureProgramme', label: 'Nature programme' },
];

// ─── Config ──────────────────────────────────────────────────────────────────

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

function arrLabel(code: number, t?: (k: string) => string): string {
  if (code === 0) return t ? t('label.paris_centre') : 'Paris Centre';
  return `${code}e arr.`;
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

function getGroupKey(l: LogementSocial, dim: string, t?: (k: string) => string): string {
  switch (dim) {
    case 'bailleur':
      return l.bailleur || (t ? t('label.not_specified') : '(non renseigné)');
    case 'arrondissement':
      return arrLabel(l.arrondissement, t);
    case 'type':
      return getDominantType(l);
    default:
      return t ? t('label.other') : 'Autre';
  }
}

function getGroupColor(key: string, dim: string, index: number): string {
  if (key === 'Autres') return PALETTE.slate;
  if (dim === 'type') return TYPE_COLOR_MAP[key] || PALETTE.slate;
  if (dim === 'arrondissement') return ARR_COLORS[index % ARR_COLORS.length];
  return DIM_COLORS[index % DIM_COLORS.length];
}

function getColumns(t: (k: string) => string): TableColumnDef<LogementSocial>[] {
  return [
    {
      key: 'programme', label: t('col.programme'), align: 'left',
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
      key: 'arrondissement', label: t('col.district_short'), hideOnMobile: true, align: 'center',
      render: (l) => <span className="text-sm text-slate-300">{arrLabel(l.arrondissement)}</span>,
    },
    {
      key: 'logements', label: t('col.housing'), hideOnMobile: false, align: 'right',
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
  const breakdowns = useMemo<BreakdownOption[]>(() => [
    { id: 'type', label: t('breakdown.type'), icon: BREAKDOWN_ICONS.type },
    { id: 'bailleur', label: t('breakdown.landlord'), icon: BREAKDOWN_ICONS.bailleur },
    { id: 'arrondissement', label: t('breakdown.district'), icon: BREAKDOWN_ICONS.arrondissement },
  ], [t]);
  const columns = useMemo(() => getColumns(t), [t]);
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
      breakdowns={breakdowns}
      getGroupKey={(l, dim) => getGroupKey(l, dim, t)}
      getGroupColor={getGroupColor}
      getValue={(l) => l.nbLogements}
      treemapTitle={t('log_annuel.treemap_title')}
      tooltipCountLabel={t('log_annuel.tooltip_count')}
      tooltipValueLabel={t('log_annuel.tooltip_value')}
      formatValue={(v) => formatNumber(v) + ' ' + t('log_annuel.tooltip_value').toLowerCase()}
      maxGroups={(dim) => dim === 'bailleur' ? 12 : undefined}
      itemLabel={t('log_annuel.item_label')}
      columns={columns}
      sortItems={(a, b) => b.nbLogements - a.nbLogements}
      getItemKey={(l, i) => `${l.id}-${i}`}
      onNavigateExplorer={onNavigateExplorer}
      formatTotal={(items) => formatNumber(items.reduce((s, l) => s + l.nbLogements, 0)) + ' ' + t('log_annuel.tooltip_value').toLowerCase()}
      banner={
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 mb-6">
          <h3 className="text-sm font-medium text-slate-300 mb-3">{t('log_annuel.types_title')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">{t('log_annuel.plai_name')}</p>
                <p className="text-slate-500">{t('log_annuel.plai_desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">{t('log_annuel.plus_name')}</p>
                <p className="text-slate-500">{t('log_annuel.plus_desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">{t('log_annuel.pls_name')}</p>
                <p className="text-slate-500">{t('log_annuel.pls_desc')}</p>
              </div>
            </div>
          </div>
        </div>
      }
      kpiCards={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('log_annuel.funded')}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatNumber(kpiStats.totalLogements)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.per1000.toFixed(1)} {t('log_annuel.per_1000')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('log_annuel.very_social')}</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{formatNumber(kpiStats.totalPLAI)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.totalLogements > 0 ? ((kpiStats.totalPLAI / kpiStats.totalLogements) * 100).toFixed(0) : 0}% {t('log_annuel.of_total')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('log_annuel.social')}</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{formatNumber(kpiStats.totalPLUS)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.totalLogements > 0 ? ((kpiStats.totalPLUS / kpiStats.totalLogements) * 100).toFixed(0) : 0}% {t('log_annuel.of_total')}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{t('log_annuel.intermediate')}</p>
            <p className="text-2xl font-bold text-violet-400 mt-1">{formatNumber(kpiStats.totalPLS)}</p>
            <p className="text-xs text-slate-400 mt-1">{kpiStats.totalLogements > 0 ? ((kpiStats.totalPLS / kpiStats.totalLogements) * 100).toFixed(0) : 0}% {t('log_annuel.of_total')}</p>
          </div>
        </div>
      }
      exportBar={
        <ExportBar
          csvData={logements as unknown as Record<string, unknown>[]}
          csvColumns={CSV_COLUMNS}
          filename={`logements_sociaux_${selectedYear}`}
        />
      }
    />
  );
}
