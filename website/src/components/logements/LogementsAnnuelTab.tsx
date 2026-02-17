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
import { PALETTE } from '@/lib/colors';
import type { CsvColumn } from '@/lib/export';

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

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'type', label: 'Type', icon: '🏠' },
  { id: 'bailleur', label: 'Bailleur', icon: '🏢' },
  { id: 'arrondissement', label: 'Arrondissement', icon: '📍' },
];

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

function arrLabel(code: number): string {
  if (code === 0) return 'Paris Centre';
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

function getGroupKey(l: LogementSocial, dim: string): string {
  switch (dim) {
    case 'bailleur':
      return l.bailleur || '(non renseigné)';
    case 'arrondissement':
      return arrLabel(l.arrondissement);
    case 'type':
      return getDominantType(l);
    default:
      return 'Autre';
  }
}

function getGroupColor(key: string, dim: string, index: number): string {
  if (key === 'Autres') return PALETTE.slate;
  if (dim === 'type') return TYPE_COLOR_MAP[key] || PALETTE.slate;
  if (dim === 'arrondissement') return ARR_COLORS[index % ARR_COLORS.length];
  return DIM_COLORS[index % DIM_COLORS.length];
}

const COLUMNS: TableColumnDef<LogementSocial>[] = [
  {
    key: 'programme', label: 'Programme', align: 'left',
    render: (l, i) => (
      <div className="flex items-start gap-2">
        <span className="text-slate-500 text-xs w-5 shrink-0">{i + 1}</span>
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-slate-200 line-clamp-2">{l.adresse}</p>
          <p className="text-[10px] md:text-xs text-slate-500 mt-1">
            {l.bailleur}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'arrondissement', label: 'Arr.', hideOnMobile: true, align: 'center',
    render: (l) => <span className="text-sm text-slate-300">{arrLabel(l.arrondissement)}</span>,
  },
  {
    key: 'logements', label: 'Logements', align: 'right',
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
  const stats = useMemo(() => {
    const totalLog = logements.reduce((s, l) => s + l.nbLogements, 0);
    const bailleurs = new Set(logements.map(l => l.bailleur)).size;
    const arrondissements = new Set(logements.map(l => l.arrondissement)).size;
    return { projets: logements.length, logements: totalLog, bailleurs, arrondissements };
  }, [logements]);

  const topBailleur = useMemo(() => {
    if (logements.length === 0) return null;
    const map = new Map<string, number>();
    for (const l of logements) {
      map.set(l.bailleur, (map.get(l.bailleur) || 0) + l.nbLogements);
    }
    let top = { name: '', val: 0 };
    for (const [name, val] of map) {
      if (val > top.val) top = { name, val };
    }
    return top;
  }, [logements]);

  return (
    <AnnuelTab
      items={logements}
      isLoading={isLoading}
      theme="emerald"
      breakdowns={BREAKDOWNS}
      getGroupKey={getGroupKey}
      getGroupColor={getGroupColor}
      getValue={(l) => l.nbLogements}
      treemapTitle="Répartition des logements sociaux"
      tooltipCountLabel="Programmes"
      tooltipValueLabel="Logements"
      formatValue={(v) => formatNumber(v) + ' logements'}
      maxGroups={(dim) => dim === 'bailleur' ? 12 : undefined}
      itemLabel="programmes"
      columns={COLUMNS}
      sortItems={(a, b) => b.nbLogements - a.nbLogements}
      getItemKey={(l, i) => `${l.id}-${i}`}
      onNavigateExplorer={onNavigateExplorer}
      formatTotal={(items) => formatNumber(items.reduce((s, l) => s + l.nbLogements, 0)) + ' logements'}
      banner={
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 mb-6">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Types de logements sociaux</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">PLAI - Tres social</p>
                <p className="text-slate-500">Revenus &lt; 60% du plafond HLM.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">PLUS - Social standard</p>
                <p className="text-slate-500">Revenus &lt; 100% du plafond HLM.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-400 mt-0.5" />
              <div>
                <p className="text-slate-300 font-medium">PLS - Intermediaire</p>
                <p className="text-slate-500">Revenus 100-130% du plafond HLM.</p>
              </div>
            </div>
          </div>
        </div>
      }
      kpiCards={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Logements</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {stats.logements >= 1000 ? `${(stats.logements / 1000).toFixed(1)}k` : formatNumber(stats.logements)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{formatNumber(stats.projets)} programmes</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Bailleurs</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{formatNumber(stats.bailleurs)}</p>
            <p className="text-xs text-slate-500 mt-1">{selectedYear}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Arrondissements</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatNumber(stats.arrondissements)}</p>
            <p className="text-xs text-slate-500 mt-1">avec programmes</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Top bailleur</p>
            <p className="text-lg font-bold text-emerald-400 mt-1">
              {topBailleur ? formatNumber(topBailleur.val) + ' log.' : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1 truncate" title={topBailleur?.name}>
              {topBailleur?.name?.slice(0, 30) || '—'}
            </p>
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
