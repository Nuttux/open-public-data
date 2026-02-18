'use client';

/**
 * SubventionsTendancesTab — Wrapper Subventions pour le composant partagé TendancesTab.
 *
 * Source : /public/data/subventions/subventions_tendances.json
 * 3 breakdowns : Thématique, Direction, Type d'organisme.
 */

import TendancesTab from '@/components/shared/TendancesTab';
import type { TendancesYear, BreakdownOption } from '@/components/shared/TendancesTab';
import { getThematiqueColor, PALETTE } from '@/lib/colors';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { BREAKDOWN_ICONS } from '@/lib/icons';

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'thematique', label: 'Thématique', icon: BREAKDOWN_ICONS.thematique },
  { id: 'direction', label: 'Direction', icon: BREAKDOWN_ICONS.direction },
  { id: 'type_organisme', label: 'Type organisme', icon: BREAKDOWN_ICONS.type_organisme },
];

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

const KPI4_LABELS: Record<string, string> = {
  thematique: '1re thématique',
  direction: '1re direction',
  type_organisme: '1er type',
};

function formatVariationDiff(value: number): string {
  const m = value / 1_000_000;
  const s = value >= 0 ? '+' : '';
  return Math.abs(m) >= 1000 ? `${s}${(m / 1000).toFixed(1)} Md€` : `${s}${m.toFixed(0)} M€`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubventionsTendancesTab() {
  return (
    <TendancesTab
      dataUrl="/data/subventions/subventions_tendances.json"
      parseData={parseData}
      breakdowns={BREAKDOWNS}
      getGroupColor={(label, dim) => getGroupColor(label, dim)}
      theme="purple"
      formatValue={formatEuroCompact}
      tooltipHeader={(year, total) => `${year} — ${formatEuroCompact(total)}`}
      formatVariationDiff={formatVariationDiff}
      title="Tendances des subventions"
      kpi1Label={(year) => `Subventions ${year}`}
      kpi1Sub={(year) => `${formatNumber(year.subCount || 0)} subventions · ${formatNumber(Math.round(year.total / PARIS_POPULATION_TOTAL))} €/hab`}
      kpi4={(ctx) => ({
        label: KPI4_LABELS[ctx.breakdown] || '1er groupe',
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => `Subventions par ${dim}`}
      variationTitle={(dim) => `Évolution par ${dim}`}
      variationSubtitle={(dim) => `Quelles ${dim}s ont le plus évolué`}
      yAxisFormatter={(v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md€` : `${(v / 1e6).toFixed(0)} M€`}
      csvFilename="subventions_tendances"
      sourceNote="Source : Open Data Paris — Subventions associations votées. Données absentes pour 2020-2021."
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>Les données proviennent des <strong className="text-slate-400">subventions aux associations votées</strong> par le Conseil de Paris.</li>
          <li>Les années <strong className="text-slate-400">2020 et 2021</strong> ne sont pas disponibles dans la source OpenData.</li>
          <li>Les montants représentent le top 500 bénéficiaires par année, couvrant plus de 95% du total.</li>
        </ul>
      }
    />
  );
}
