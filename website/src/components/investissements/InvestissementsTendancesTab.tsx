'use client';

/**
 * InvestissementsTendancesTab — Wrapper Investissements pour le composant partagé TendancesTab.
 *
 * Source : /public/data/investissement_tendances.json
 * Breakdown unique : Secteur (chapitres M57).
 */

import TendancesTab from '@/components/shared/TendancesTab';
import type { TendancesYear, BreakdownOption } from '@/components/shared/TendancesTab';
import { formatEuroCompact } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'secteur', label: 'Secteur', icon: '📋' },
];

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
  return (
    <TendancesTab
      dataUrl="/data/investissement_tendances.json"
      parseData={parseData}
      breakdowns={BREAKDOWNS}
      getGroupColor={(label) => getGroupColor(label)}
      theme="amber"
      formatValue={formatEuroCompact}
      tooltipHeader={(year, total) => `${year} — ${formatEuroCompact(total)}`}
      formatVariationDiff={formatVariationDiff}
      title="Tendances d'investissement"
      kpi1Label={(year) => `Investissement ${year}`}
      kpi1Sub={() => 'hors opérations financières'}
      kpi4={(ctx) => ({
        label: '1er secteur',
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => `Dépenses d'investissement par ${dim}`}
      variationTitle={(dim) => `Évolution par ${dim}`}
      variationSubtitle={(dim) => `Quels ${dim}s ont le plus évolué`}
      yAxisFormatter={(v: number) => `${(v / 1e9).toFixed(1)} Md€`}
      sourceNote="Source : Comptes Administratifs — Budget Principal (M57 Ville-Département). Hors opérations de dette et dotations."
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>Ces tendances proviennent du <strong className="text-slate-400">Budget Principal</strong> (Comptes Administratifs M57), qui reflète les dépenses <em>réellement exécutées</em> chaque année (2019-2024).</li>
          <li>Les opérations de dette (emprunts, remboursements) et dotations sont exclues pour refléter l&apos;investissement « réel » en équipements et infrastructures.</li>
          <li>L&apos;onglet « Explorer » utilise une source plus granulaire (Annexe Investissements Localisés + AP OpenData) qui détaille les projets individuels, mais avec un périmètre plus restreint.</li>
        </ul>
      }
    />
  );
}
