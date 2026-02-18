'use client';

/**
 * LogementsTendancesTab — Wrapper Logements pour le composant partagé TendancesTab.
 *
 * Reçoit allLogements en prop, agrège côté client, puis passe au composant partagé.
 * 3 breakdowns : Type (PLAI/PLUS/PLS), Bailleur, Arrondissement.
 */

import { useMemo } from 'react';
import TendancesTab from '@/components/shared/TendancesTab';
import type { TendancesYear, BreakdownOption, GroupItem } from '@/components/shared/TendancesTab';
import type { LogementSocial } from '@/lib/types/map';
import { formatNumber } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { BREAKDOWN_ICONS } from '@/lib/icons';

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'type', label: 'Type', icon: BREAKDOWN_ICONS.type },
  { id: 'bailleur', label: 'Bailleur', icon: BREAKDOWN_ICONS.bailleur },
  { id: 'arrondissement', label: 'Arrondissement', icon: BREAKDOWN_ICONS.arrondissement },
];

const TYPE_COLORS: Record<string, string> = {
  'PLAI (très social)': PALETTE.blue,
  'PLUS (social)': PALETTE.cyan,
  'PLS (intermédiaire)': PALETTE.violet,
};

const ARR_COLORS = [
  PALETTE.emerald, PALETTE.blue, PALETTE.amber, PALETTE.purple, PALETTE.rose,
  PALETTE.cyan, PALETTE.orange, PALETTE.green, PALETTE.pink, PALETTE.red,
  PALETTE.teal, PALETTE.violet, PALETTE.sky, PALETTE.lime, PALETTE.yellow,
  PALETTE.slate, PALETTE.amber, PALETTE.blue, PALETTE.rose, PALETTE.emerald,
];

const BAILLEUR_COLORS = [
  PALETTE.emerald, PALETTE.blue, PALETTE.amber, PALETTE.purple, PALETTE.cyan,
  PALETTE.orange, PALETTE.green, PALETTE.pink, PALETTE.teal, PALETTE.red,
];

function getGroupColor(_label: string, dim: string, idx: number): string {
  if (dim === 'type') return TYPE_COLORS[_label] || PALETTE.gray;
  if (dim === 'arrondissement') return ARR_COLORS[idx % ARR_COLORS.length];
  return BAILLEUR_COLORS[idx % BAILLEUR_COLORS.length];
}

function groupLimit(dim: string): number | undefined {
  if (dim === 'bailleur') return 8;
  if (dim === 'arrondissement') return 20;
  return undefined; // type: always 3
}

function arrLabel(code: number): string { return code === 0 ? 'Centre' : `${code}e`; }

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregateLogements(allLogements: LogementSocial[]): TendancesYear[] {
  const years = [...new Set(allLogements.map(l => l.annee))].sort((a, b) => a - b);

  return years.map(year => {
    const yearLogements = allLogements.filter(l => l.annee === year);

    // Type breakdown (split PLAI/PLUS/PLS)
    const typeGroups: Record<string, number> = {};
    for (const l of yearLogements) {
      typeGroups['PLAI (très social)'] = (typeGroups['PLAI (très social)'] || 0) + (l.nbPLAI || 0);
      typeGroups['PLUS (social)'] = (typeGroups['PLUS (social)'] || 0) + (l.nbPLUS || 0);
      typeGroups['PLS (intermédiaire)'] = (typeGroups['PLS (intermédiaire)'] || 0) + (l.nbPLS || 0);
    }

    // Bailleur breakdown
    const bailleurGroups: Record<string, number> = {};
    for (const l of yearLogements) {
      const key = l.bailleur || '(non renseigné)';
      bailleurGroups[key] = (bailleurGroups[key] || 0) + l.nbLogements;
    }

    // Arrondissement breakdown
    const arrGroups: Record<string, number> = {};
    for (const l of yearLogements) {
      const key = arrLabel(l.arrondissement);
      arrGroups[key] = (arrGroups[key] || 0) + l.nbLogements;
    }

    const toGroupItems = (map: Record<string, number>): GroupItem[] =>
      Object.entries(map).map(([label, value]) => ({ label, value }));

    const total = yearLogements.reduce((s, l) => s + l.nbLogements, 0);

    return {
      year,
      total,
      groups: {
        type: toGroupItems(typeGroups),
        bailleur: toGroupItems(bailleurGroups),
        arrondissement: toGroupItems(arrGroups),
      },
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface LogementsTendancesTabProps { allLogements: LogementSocial[]; }

export default function LogementsTendancesTab({ allLogements }: LogementsTendancesTabProps) {
  const data = useMemo(() => aggregateLogements(allLogements), [allLogements]);

  return (
    <TendancesTab
      data={data}
      breakdowns={BREAKDOWNS}
      getGroupColor={getGroupColor}
      groupLimit={groupLimit}
      theme="emerald"
      formatValue={formatNumber}
      tooltipHeader={(year, total) => `${year} — ${formatNumber(total)} logements`}
      formatVariationDiff={(diff) => `${diff >= 0 ? '+' : ''}${formatNumber(diff)}`}
      showVariationPct={false}
      formatVariationTooltipValue={(v) => `${formatNumber(v)} logements`}
      title="Tendances des logements sociaux"
      kpi1Label={(year) => `Production ${year}`}
      kpi1Sub={() => 'logements'}
      kpi3={(ctx) => {
        const totalCumul = ctx.filteredYears.reduce((s, y) => s + y.total, 0);
        return {
          label: `Cumul ${ctx.earliest.year}→${ctx.latest.year}`,
          value: totalCumul >= 1000 ? `${(totalCumul / 1000).toFixed(0)}k` : formatNumber(totalCumul),
          sub: 'logements financés',
        };
      }}
      kpi4={(ctx) => {
        const avg = ctx.filteredYears.reduce((s, y) => s + y.total, 0) / ctx.filteredYears.length;
        return {
          label: 'Moyenne annuelle',
          value: formatNumber(Math.round(avg)),
          sub: 'logements / an',
        };
      }}
      chartTitle={(dim) => `Production annuelle par ${dim}`}
      variationTitle={(dim) => `Évolution par ${dim}`}
      variationSubtitle={(dim) => `Quels ${dim}s ont le plus évolué`}
      yAxisFormatter={(v: number) => formatNumber(v)}
      csvFilename="logements_tendances"
      sourceNote="Source : Open Data Paris — Logements sociaux financés à Paris."
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>Données issues du jeu <strong className="text-slate-400">logements sociaux financés à Paris</strong> (OpenData Paris), couvrant 2010-2024.</li>
          <li>Chaque programme représente un financement validé ; la livraison effective intervient en général 2-4 ans plus tard.</li>
          <li>La répartition PLAI/PLUS/PLS peut varier selon les quotas réglementaires (loi SRU, PLU).</li>
        </ul>
      }
    />
  );
}
