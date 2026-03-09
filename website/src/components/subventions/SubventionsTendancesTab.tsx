'use client';

/**
 * SubventionsTendancesTab — Wrapper Subventions pour le composant partagé TendancesTab.
 *
 * Source : /public/data/subventions/subventions_tendances.json
 * 3 breakdowns : Thématique, Direction, Type d'organisme.
 */

import { useMemo } from 'react';
import TendancesTab from '@/components/shared/TendancesTab';
import type { TendancesYear, BreakdownOption } from '@/components/shared/TendancesTab';
import { getThematiqueColor, PALETTE, TYPE_ORGANISME_COLORS } from '@/lib/colors';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Config ──────────────────────────────────────────────────────────────────

const DIRECTION_PALETTE = [
  PALETTE.blue, PALETTE.purple, PALETTE.pink, PALETTE.amber,
  PALETTE.green, PALETTE.cyan, PALETTE.orange, PALETTE.teal,
  PALETTE.red, PALETTE.lime, PALETTE.sky, PALETTE.violet, PALETTE.slate,
];
const directionColorMap: Record<string, string> = {};

function getGroupColor(label: string, dim: string): string {
  if (dim === 'thematique') return getThematiqueColor(label);
  if (dim === 'type_organisme') return TYPE_ORGANISME_COLORS[label] || PALETTE.gray;
  if (!directionColorMap[label]) {
    directionColorMap[label] = DIRECTION_PALETTE[Object.keys(directionColorMap).length % DIRECTION_PALETTE.length];
  }
  return directionColorMap[label];
}

// ─── Data parsing ────────────────────────────────────────────────────────────

interface RawGroup { label: string; montant: number; count: number; }
interface RawYear {
  year: number; total_montant: number; nb_subventions: number; nb_beneficiaires: number;
  par_thematique: RawGroup[]; par_direction: RawGroup[]; par_type_organisme: RawGroup[];
}

function parseData(json: unknown): TendancesYear[] {
  const d = json as { years: RawYear[] };
  return d.years.map(y => ({
    year: y.year,
    total: y.total_montant,
    subCount: y.nb_subventions,
    groups: {
      thematique: y.par_thematique.map(g => ({ label: g.label, value: g.montant })),
      direction: y.par_direction.map(g => ({ label: g.label, value: g.montant })),
      type_organisme: y.par_type_organisme.map(g => ({ label: g.label, value: g.montant })),
    },
  }));
}

// ─── KPI helpers ─────────────────────────────────────────────────────────────

function formatVariationDiff(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatEuroCompact(value)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsTendancesTab() {
  const t = useT();
  const breakdowns = useMemo<BreakdownOption[]>(() => [
    { id: 'thematique', label: t('breakdown.category'), icon: BREAKDOWN_ICONS.thematique },
    { id: 'direction', label: t('breakdown.department'), icon: BREAKDOWN_ICONS.direction },
    { id: 'type_organisme', label: t('breakdown.org_type'), icon: BREAKDOWN_ICONS.type_organisme },
  ], [t]);
  return (
    <TendancesTab
      dataUrl="/data/subventions/subventions_tendances.json"
      parseData={parseData}
      breakdowns={breakdowns}
      getGroupColor={(label, dim) => getGroupColor(label, dim)}
      theme="purple"
      formatValue={formatEuroCompact}
      tooltipHeader={(year, total) => `${year} — ${formatEuroCompact(total)}`}
      formatVariationDiff={formatVariationDiff}
      title={t('subv_tendances.title')}
      kpi1Label={(year) => t('subv_tendances.kpi1').replace('{year}', String(year))}
      kpi1Sub={(year) => `${formatNumber(year.subCount || 0)} ${t('subv_tendances.grants_count')} · ${formatNumber(Math.round(year.total / PARIS_POPULATION_TOTAL))} €/${t('subv_tendances.per_resident')}`}
      kpi4={(ctx) => ({
        label: t('subv_tendances.kpi4_' + ctx.breakdown) || t('subv_tendances.kpi4_default'),
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => t('subv_tendances.chart_title').replace('{dim}', dim)}
      variationTitle={(dim) => t('subv_tendances.variation_title').replace('{dim}', dim)}
      variationSubtitle={(dim) => t('subv_tendances.variation_subtitle').replace('{dim}', dim)}
      yAxisFormatter={(v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md€` : `${(v / 1e6).toFixed(0)} M€`}
      csvFilename="subventions_tendances"
      sourceNote={t('subv_tendances.source')}
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li dangerouslySetInnerHTML={{ __html: t('subv_tendances.note1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('subv_tendances.note2') }} />
          <li dangerouslySetInnerHTML={{ __html: t('subv_tendances.note3') }} />
        </ul>
      }
    />
  );
}
