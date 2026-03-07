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
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

const TYPE_ORGANISME_COLORS: Record<string, string> = {
  'Associations': PALETTE.purple,
  'Établissements publics': PALETTE.blue,
  'Entreprises': PALETTE.orange,
  'Autres privés': PALETTE.teal,
  'Personnes physiques': PALETTE.pink,
  'Autres': PALETTE.gray,
};

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

const KPI4_KEYS: Record<string, string> = {
  thematique: 'subventions.tendances.kpi4_thematique',
  direction: 'subventions.tendances.kpi4_direction',
  type_organisme: 'subventions.tendances.kpi4_type',
};

function formatVariationDiff(value: number): string {
  const m = value / 1_000_000;
  const s = value >= 0 ? '+' : '';
  return Math.abs(m) >= 1000 ? `${s}${(m / 1000).toFixed(1)} Md€` : `${s}${m.toFixed(0)} M€`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsTendancesTab() {
  const t = useT();

  const breakdowns: BreakdownOption[] = useMemo(() => [
    { id: 'thematique', label: t('breakdown.thematique'), icon: BREAKDOWN_ICONS.thematique },
    { id: 'direction', label: t('breakdown.direction'), icon: BREAKDOWN_ICONS.direction },
    { id: 'type_organisme', label: t('breakdown.type_organisme'), icon: BREAKDOWN_ICONS.type_organisme },
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
      title={t('subventions.tendances.title')}
      kpi1Label={(year) => `${t('subventions.tendances.kpi1_label')} ${year}`}
      kpi1Sub={(year) => `${formatNumber(year.subCount || 0)} ${t('subventions.tendances.kpi1_sub_grants')} · ${formatNumber(Math.round(year.total / PARIS_POPULATION_TOTAL))} ${t('subventions.tendances.kpi1_sub_per_hab')}`}
      kpi4={(ctx) => ({
        label: t(KPI4_KEYS[ctx.breakdown] || 'subventions.tendances.kpi4_default'),
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => `${t('subventions.tendances.chart_title_prefix')} ${dim}`}
      variationTitle={(dim) => `${t('subventions.tendances.variation_title_prefix')} ${dim}`}
      variationSubtitle={(dim) => `${t('subventions.tendances.variation_subtitle_prefix')} ${dim}${t('subventions.tendances.variation_subtitle_suffix')}`}
      yAxisFormatter={(v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md€` : `${(v / 1e6).toFixed(0)} M€`}
      csvFilename="subventions_tendances"
      sourceNote={t('subventions.tendances.source')}
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>{t('subventions.tendances.quality_1')}</li>
          <li>{t('subventions.tendances.quality_2')}</li>
          <li>{t('subventions.tendances.quality_3')}</li>
        </ul>
      }
    />
  );
}
