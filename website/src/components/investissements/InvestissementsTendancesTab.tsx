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

  const breakdowns: BreakdownOption[] = useMemo(() => [
    { id: 'secteur', label: t('invest.tendances.breakdown.secteur'), icon: BREAKDOWN_ICONS.secteur },
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
      title={t('invest.tendances.title')}
      kpi1Label={(year) => `${t('invest.tendances.kpi1_label')} ${year}`}
      kpi1Sub={(year) => `${formatNumber(Math.round(year.total / PARIS_POPULATION_TOTAL))} ${t('invest.kpi.euro_hab')} · ${t('invest.tendances.kpi1_sub_suffix')}`}
      kpi4={(ctx) => ({
        label: t('invest.tendances.kpi4_label'),
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => `${t('invest.tendances.chart_title')} ${dim}`}
      variationTitle={(dim) => `${t('invest.tendances.variation_title')} ${dim}`}
      variationSubtitle={(dim) => `${t('invest.tendances.variation_subtitle_prefix')} ${dim}s ${t('invest.tendances.variation_subtitle_suffix')}`}
      yAxisFormatter={(v: number) => `${(v / 1e9).toFixed(1)} Md€`}
      csvFilename="investissements_tendances"
      sourceNote={t('invest.tendances.source')}
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>{t('invest.tendances.note1')}</li>
          <li>{t('invest.tendances.note2')}</li>
          <li>{t('invest.tendances.note3')}</li>
        </ul>
      }
    />
  );
}
