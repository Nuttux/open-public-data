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
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { PALETTE } from '@/lib/colors';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Config ──────────────────────────────────────────────────────────────────

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
  const t = useT();
  const breakdowns = useMemo<BreakdownOption[]>(() => [
    { id: 'type', label: t('breakdown.type'), icon: BREAKDOWN_ICONS.type },
    { id: 'bailleur', label: t('breakdown.landlord'), icon: BREAKDOWN_ICONS.bailleur },
    { id: 'arrondissement', label: t('breakdown.district'), icon: BREAKDOWN_ICONS.arrondissement },
  ], [t]);
  const data = useMemo(() => aggregateLogements(allLogements), [allLogements]);

  return (
    <TendancesTab
      data={data}
      breakdowns={breakdowns}
      getGroupColor={getGroupColor}
      groupLimit={groupLimit}
      theme="emerald"
      formatValue={formatNumber}
      tooltipHeader={(year, total) => `${year} — ${formatNumber(total)} ${t('log_tendances.units')}`}
      formatVariationDiff={(diff) => `${diff >= 0 ? '+' : ''}${formatNumber(diff)}`}
      showVariationPct={false}
      formatVariationTooltipValue={(v) => `${formatNumber(v)} ${t('log_tendances.units')}`}
      title={t('log_tendances.title')}
      kpi1Label={(year) => t('log_tendances.kpi1').replace('{year}', String(year))}
      kpi1Sub={(year) => `${((year.total / PARIS_POPULATION_TOTAL) * 1000).toFixed(1)} ${t('log_tendances.per_1000')}`}
      kpi3={(ctx) => {
        const totalCumul = ctx.filteredYears.reduce((s, y) => s + y.total, 0);
        return {
          label: `${t('log_tendances.cumul')} ${ctx.earliest.year}→${ctx.latest.year}`,
          value: totalCumul >= 1000 ? `${(totalCumul / 1000).toFixed(0)}k` : formatNumber(totalCumul),
          sub: t('log_tendances.funded_units'),
        };
      }}
      kpi4={(ctx) => {
        const avg = ctx.filteredYears.reduce((s, y) => s + y.total, 0) / ctx.filteredYears.length;
        return {
          label: t('log_tendances.annual_avg'),
          value: formatNumber(Math.round(avg)),
          sub: t('log_tendances.units_per_year'),
        };
      }}
      chartTitle={(dim) => t('log_tendances.chart_title').replace('{dim}', dim)}
      variationTitle={(dim) => t('log_tendances.variation_title').replace('{dim}', dim)}
      variationSubtitle={(dim) => t('log_tendances.variation_subtitle').replace('{dim}', dim)}
      yAxisFormatter={(v: number) => formatNumber(v)}
      csvFilename="logements_tendances"
      sourceNote={t('log_tendances.source')}
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li dangerouslySetInnerHTML={{ __html: t('log_tendances.note1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('log_tendances.note2') }} />
          <li dangerouslySetInnerHTML={{ __html: t('log_tendances.note3') }} />
        </ul>
      }
    />
  );
}
