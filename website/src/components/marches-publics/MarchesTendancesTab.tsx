'use client';

/**
 * MarchesTendancesTab — Wrapper Marchés publics pour le composant partagé TendancesTab.
 *
 * Source : /public/data/marches-publics/marches_tendances.json
 * 2 breakdowns : Nature, Catégorie d'achat.
 */

import TendancesTab from '@/components/shared/TendancesTab';
import type { TendancesYear, BreakdownOption } from '@/components/shared/TendancesTab';
import { PALETTE } from '@/lib/colors';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Config ──────────────────────────────────────────────────────────────────

function getBreakdowns(t: (key: string) => string): BreakdownOption[] {
  return [
    { id: 'nature', label: t('marches.breakdown.nature'), icon: BREAKDOWN_ICONS.nature },
    { id: 'categorie', label: t('marches.breakdown.categorie'), icon: BREAKDOWN_ICONS.categorie },
  ];
}

const NATURE_COLORS: Record<string, string> = {
  'SERVICES': PALETTE.blue,
  'TRAVAUX': PALETTE.orange,
  'FOURNITURE': PALETTE.amber,
};

const CATEGORIE_PALETTE = [
  PALETTE.cyan, PALETTE.purple, PALETTE.amber, PALETTE.blue,
  PALETTE.pink, PALETTE.green, PALETTE.orange, PALETTE.red,
  PALETTE.teal, PALETTE.emerald, PALETTE.violet, PALETTE.rose,
  PALETTE.sky, PALETTE.lime, PALETTE.yellow, PALETTE.slate,
];
const categorieColorMap: Record<string, string> = {};

function getGroupColor(label: string, dim: string): string {
  if (dim === 'nature') return NATURE_COLORS[label] || PALETTE.slate;
  if (!categorieColorMap[label]) {
    categorieColorMap[label] = CATEGORIE_PALETTE[Object.keys(categorieColorMap).length % CATEGORIE_PALETTE.length];
  }
  return categorieColorMap[label];
}

// ─── Data parsing ────────────────────────────────────────────────────────────

interface RawGroup { label: string; montant: number; count: number; }
interface RawYear {
  year: number; enveloppe_totale: number; nb_marches: number;
  par_nature: RawGroup[]; par_categorie: RawGroup[];
}

function parseData(json: unknown): TendancesYear[] {
  const d = json as { years: RawYear[] };
  return d.years.map(y => ({
    year: y.year,
    total: y.enveloppe_totale,
    subCount: y.nb_marches,
    groups: {
      nature: y.par_nature.map(g => ({ label: g.label, value: g.montant })),
      categorie: y.par_categorie.map(g => ({ label: g.label, value: g.montant })),
    },
  }));
}

// ─── KPI helpers ─────────────────────────────────────────────────────────────

function getKpi4Labels(t: (key: string) => string): Record<string, string> {
  return {
    nature: t('marches.tendances.top_nature'),
    categorie: t('marches.tendances.top_categorie'),
  };
}

function formatVariationDiff(value: number): string {
  const m = value / 1_000_000;
  const s = value >= 0 ? '+' : '';
  return Math.abs(m) >= 1000 ? `${s}${(m / 1000).toFixed(1)} Md€` : `${s}${m.toFixed(0)} M€`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarchesTendancesTab() {
  const t = useT();
  const kpi4Labels = getKpi4Labels(t);
  return (
    <>
      <div className="bg-teal-900/30 border border-teal-500/30 rounded-lg p-3 mb-6">
        <p className="text-xs text-teal-300/80">
          {t('marches.banner_text')}<strong className="text-teal-200">{t('marches.banner_bold')}</strong>{t('marches.banner_suffix')}
        </p>
      </div>
      <TendancesTab
      dataUrl="/data/marches-publics/marches_tendances.json"
      parseData={parseData}
      breakdowns={getBreakdowns(t)}
      getGroupColor={(label, dim) => getGroupColor(label, dim)}
      groupLimit={(dim) => dim === 'categorie' ? 8 : undefined}
      theme="teal"
      formatValue={formatEuroCompact}
      tooltipHeader={(year, total) => `${year} — ${formatEuroCompact(total)}`}
      formatVariationDiff={formatVariationDiff}
      title={t('marches.tendances.title')}
      kpi1Label={(year) => `${t('marches.tendances.total_amount')} ${year}`}
      kpi1Sub={(year) => `${formatNumber(year.subCount || 0)} ${t('marches.notified')}`}
      kpi3={(ctx) => {
        const avg = ctx.latest.subCount ? ctx.latest.total / ctx.latest.subCount : 0;
        return {
          label: t('marches.tendances.avg_amount'),
          value: formatEuroCompact(avg),
          sub: `${t('marches.tendances.per_contract_in')} ${ctx.latest.year}`,
        };
      }}
      kpi4={(ctx) => ({
        label: kpi4Labels[ctx.breakdown] || t('marches.tendances.top_group'),
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => `${t('marches.tendances.amounts_by')} ${dim}`}
      variationTitle={(dim) => `${t('marches.tendances.evolution_by')} ${dim}`}
      variationSubtitle={(dim) => `${t('marches.tendances.which_evolved')} ${dim}s ${t('marches.tendances.most_evolved')}`}
      yAxisFormatter={(v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md€` : `${(v / 1e6).toFixed(0)} M€`}
      sourceNote={t('marches.tendances.source_note')}
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>{t('marches.tendances.quality_1')}<strong className="text-slate-500">{t('marches.tendances.quality_1_bold')}</strong>{t('marches.tendances.quality_1_suffix')}</li>
          <li>{t('marches.tendances.quality_2_pre')}<strong className="text-slate-500">{t('marches.tendances.quality_2_bold')}</strong>{t('marches.tendances.quality_2_suffix')}</li>
          <li>{t('marches.tendances.quality_3_pre')}<strong className="text-slate-500">{t('marches.tendances.quality_3_bold')}</strong>{t('marches.tendances.quality_3_suffix')}</li>
          <li>{t('marches.tendances.quality_4')}</li>
        </ul>
      }
      csvFilename="marches_tendances"
    />
    </>
  );
}
