'use client';

/**
 * InvestissementsTendancesTab — Wrapper Investissements pour le composant partagé TendancesTab.
 *
 * Source : /public/data/investissement_tendances.json
 * Breakdown unique : Secteur (chapitres M57).
 */

import { useMemo } from 'react';
import TendancesTab from '@/components/shared/TendancesTab';
import type { TendancesYear, BreakdownOption } from '@/components/shared/TendancesTab';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PARIS_POPULATION_TOTAL } from '@/lib/constants/arrondissements';
import { PALETTE } from '@/lib/colors';
import { BREAKDOWN_ICONS } from '@/lib/icons';
import { useT } from '@/lib/localeContext';

// ─── Config ──────────────────────────────────────────────────────────────────

const CHAPITRE_COLORS: Record<string, string> = {
  'Aménagement & Habitat': PALETTE.cyan,
  'Culture & Sport': PALETTE.purple,
  'Transports': PALETTE.amber,
  'Services Généraux': PALETTE.slate,
  'Enseignement': PALETTE.blue,
  'Environnement': PALETTE.green,
  'Santé & Social': PALETTE.pink,
  'Action Économique': PALETTE.orange,
  'Sécurité': PALETTE.red,
  'Rsa': PALETTE.teal,
};

interface RawChap { label: string; depenses: number; recettes: number; }
interface RawYear { year: number; depenses_total: number; recettes_total: number; depenses_hors_dette: number; par_chapitre: RawChap[]; }

function parseData(json: unknown): TendancesYear[] {
  const d = json as { years: RawYear[] };
  return d.years.map(y => ({
    year: y.year,
    total: y.depenses_hors_dette,
    groups: {
      secteur: y.par_chapitre.map(c => ({ label: c.label, value: c.depenses })),
    },
  }));
}

function getGroupColor(label: string): string {
  return CHAPITRE_COLORS[label] || PALETTE.gray;
}

function formatVariationDiff(value: number): string {
  const m = value / 1_000_000;
  const s = value >= 0 ? '+' : '';
  return Math.abs(m) >= 1000 ? `${s}${(m / 1000).toFixed(1)} Md€` : `${s}${m.toFixed(0)} M€`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvestissementsTendancesTab() {
  const t = useT();
  const breakdowns = useMemo<BreakdownOption[]>(() => [
    { id: 'secteur', label: t('breakdown.sector'), icon: BREAKDOWN_ICONS.secteur },
  ], [t]);
  return (
    <TendancesTab
      dataUrl="/data/investissement_tendances.json"
      parseData={parseData}
      breakdowns={breakdowns}
      getGroupColor={(label) => getGroupColor(label)}
      theme="amber"
      formatValue={formatEuroCompact}
      tooltipHeader={(year, total) => `${year} — ${formatEuroCompact(total)}`}
      formatVariationDiff={formatVariationDiff}
      title={t('invest_tendances.title')}
      kpi1Label={(year) => t('invest_tendances.kpi1').replace('{year}', String(year))}
      kpi1Sub={(year) => `${formatNumber(Math.round(year.total / PARIS_POPULATION_TOTAL))} €/${t('invest_tendances.per_resident')} · ${t('invest_tendances.excl_financial')}`}
      kpi4={(ctx) => ({
        label: t('invest_tendances.top_sector'),
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => t('invest_tendances.chart_title').replace('{dim}', dim)}
      variationTitle={(dim) => t('invest_tendances.variation_title').replace('{dim}', dim)}
      variationSubtitle={(dim) => t('invest_tendances.variation_subtitle').replace('{dim}', dim)}
      yAxisFormatter={(v: number) => `${(v / 1e9).toFixed(1)} Md€`}
      csvFilename="investissements_tendances"
      sourceNote={t('invest_tendances.source')}
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li dangerouslySetInnerHTML={{ __html: t('invest_tendances.note1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('invest_tendances.note2') }} />
          <li dangerouslySetInnerHTML={{ __html: t('invest_tendances.note3') }} />
        </ul>
      }
    />
  );
}
