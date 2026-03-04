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

// ─── Config ──────────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownOption[] = [
  { id: 'nature', label: 'Nature', icon: BREAKDOWN_ICONS.nature },
  { id: 'categorie', label: 'Catégorie', icon: BREAKDOWN_ICONS.categorie },
];

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

const KPI4_LABELS: Record<string, string> = {
  nature: '1re nature',
  categorie: '1re catégorie',
};

function formatVariationDiff(value: number): string {
  const m = value / 1_000_000;
  const s = value >= 0 ? '+' : '';
  return Math.abs(m) >= 1000 ? `${s}${(m / 1000).toFixed(1)} Md€` : `${s}${m.toFixed(0)} M€`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarchesTendancesTab() {
  return (
    <>
      <div className="bg-teal-900/30 border border-teal-500/30 rounded-lg p-3 mb-6">
        <p className="text-xs text-teal-300/80">
          Les montants affichés sont des <strong className="text-teal-200">plafonds sur toute la durée du contrat</strong> (souvent 4 ans), pas des dépenses annuelles. Le montant réellement dépensé est généralement inférieur.
        </p>
      </div>
      <TendancesTab
      dataUrl="/data/marches-publics/marches_tendances.json"
      parseData={parseData}
      breakdowns={BREAKDOWNS}
      getGroupColor={(label, dim) => getGroupColor(label, dim)}
      groupLimit={(dim) => dim === 'categorie' ? 8 : undefined}
      theme="teal"
      formatValue={formatEuroCompact}
      tooltipHeader={(year, total) => `${year} — ${formatEuroCompact(total)}`}
      formatVariationDiff={formatVariationDiff}
      title="Tendances des marchés publics"
      kpi1Label={(year) => `Montant total ${year}`}
      kpi1Sub={(year) => `${formatNumber(year.subCount || 0)} marchés notifiés`}
      kpi3={(ctx) => {
        const avg = ctx.latest.subCount ? ctx.latest.total / ctx.latest.subCount : 0;
        return {
          label: 'Montant moyen',
          value: formatEuroCompact(avg),
          sub: `par marché en ${ctx.latest.year}`,
        };
      }}
      kpi4={(ctx) => ({
        label: KPI4_LABELS[ctx.breakdown] || '1er groupe',
        value: ctx.topName,
        sub: `${formatEuroCompact(ctx.topValue)} (${ctx.topPct.toFixed(0)}%)`,
      })}
      chartTitle={(dim) => `Montants par ${dim}`}
      variationTitle={(dim) => `Évolution par ${dim}`}
      variationSubtitle={(dim) => `Quelles ${dim}s ont le plus évolué`}
      yAxisFormatter={(v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md€` : `${(v / 1e6).toFixed(0)} M€`}
      sourceNote="Source : Open Data Paris — Liste des marchés de la collectivité parisienne. Les montants sont des plafonds contractuels sur toute la durée du contrat."
      qualityNotes={
        <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside">
          <li>Les montants affichés sont des <strong className="text-slate-500">plafonds sur toute la durée du contrat</strong> (souvent 4 ans), pas des dépenses annuelles.</li>
          <li>97% des marchés sont des <strong className="text-slate-500">contrats-cadres</strong> : le montant affiché est un maximum, la dépense réelle est généralement inférieure.</li>
          <li>Les marchés <strong className="text-slate-500">multi-attributaires</strong> (~15% de la valeur) sont des contrats partagés entre plusieurs entreprises.</li>
          <li>Données disponibles de 2013 à 2024. Publication annuelle avec ~10 mois de décalage.</li>
        </ul>
      }
      csvFilename="marches_tendances"
    />
    </>
  );
}
