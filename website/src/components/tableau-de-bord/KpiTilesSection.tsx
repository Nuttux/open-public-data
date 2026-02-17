'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionYear {
  year: number;
  totals: {
    depenses: number;
    recettes: number;
    variation_dette_nette: number;
    remboursement_principal: number;
    interets_dette: number;
  };
  epargne_brute: number;
  type_budget: string;
}

interface SubventionsIndex {
  totals_by_year: Record<string, { montant_total: number; nb_subventions: number }>;
}

interface LogementsData {
  total: number;
}

interface MarchesIndex {
  totals_by_year: Record<string, { nb_marches: number; enveloppe_max_totale: number }>;
}

interface TileData {
  label: string;
  value: string;
  sub: string;
  variation: number | null;
  variationRef?: number;
  /** true = down is good (dette, depenses) */
  inverse?: boolean;
  href: string;
  color: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pctChange(current: number, reference: number): number | null {
  if (reference === 0) return null;
  return ((current - reference) / Math.abs(reference)) * 100;
}

function VariationBadge({
  value,
  refYear = 2020,
  inverse = false,
}: {
  value: number | null;
  refYear?: number;
  inverse?: boolean;
}) {
  if (value === null) return <span className="text-slate-600 text-xs">—</span>;
  const isGood = inverse ? value < 0 : value > 0;
  const color = isGood ? 'text-emerald-400' : 'text-red-400';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return (
    <span className={`text-xs font-medium ${color} flex items-center gap-0.5`}>
      {arrow} {value > 0 ? '+' : ''}{value.toFixed(1)}%{' '}
      <span className="text-slate-600 font-normal">vs {refYear}</span>
    </span>
  );
}

function TileGrid({ tiles }: { tiles: TileData[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          href={tile.href}
          className={`bg-slate-800/50 backdrop-blur rounded-xl border ${tile.color} p-4 hover:bg-slate-900 transition-all duration-200 group`}
        >
          <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1 group-hover:text-slate-500 transition-colors">
            {tile.label}
          </p>
          <p className="text-xl font-bold text-slate-100 mb-0.5">{tile.value}</p>
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] text-slate-500 truncate">{tile.sub}</p>
            <VariationBadge
              value={tile.variation}
              refYear={tile.variationRef ?? 2020}
              inverse={tile.inverse}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function KpiTilesSection() {
  const [financeTiles, setFinanceTiles] = useState<TileData[]>([]);
  const [activiteTiles, setActiviteTiles] = useState<TileData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [evoRes, subRes, logRes, marRes] = await Promise.all([
          fetch('/data/evolution_budget.json'),
          fetch('/data/subventions/index.json'),
          fetch('/data/map/logements_sociaux.json'),
          fetch('/data/marches-publics/index.json'),
        ]);

        const evo = (await evoRes.json()) as { years: EvolutionYear[] };
        const sub = (await subRes.json()) as SubventionsIndex;
        const log = (await logRes.json()) as LogementsData;
        const mar = (await marRes.json()) as MarchesIndex;

        // Latest year (including voted budgets)
        const latest = evo.years[0];
        const ref2020 = evo.years.find((y) => y.year === 2020);

        // Durée de désendettement : cumulative net debt since 2020 / epargne brute
        // Uses only executed years to avoid double-counting voted projections
        const executedSince2020 = evo.years.filter(
          (y) => y.type_budget === 'execute' && y.year >= 2020,
        );
        const cumulativeDette = executedSince2020.reduce(
          (s, y) => s + y.totals.variation_dette_nette,
          0,
        );
        const dureeDesendettement =
          latest.epargne_brute > 0 && cumulativeDette > 0
            ? cumulativeDette / latest.epargne_brute
            : null;

        // Subventions: latest available year + 2020 as reference (start of mandate)
        const subYears = Object.keys(sub.totals_by_year).map(Number).sort((a, b) => b - a);
        const subLatest = sub.totals_by_year[subYears[0]];
        const subRefYear = 2020;
        const subRef = sub.totals_by_year[String(subRefYear)] ?? sub.totals_by_year[String(subYears[subYears.length - 1])] ?? null;

        // Marchés: latest available year
        const marYears = Object.keys(mar.totals_by_year).map(Number).sort((a, b) => b - a);
        const marLatest = mar.totals_by_year[marYears[0]];
        const mar2020 = mar.totals_by_year['2020'] ?? null;

        const budgetSuffix = latest.type_budget === 'vote' ? ' (BP)' : '';

        const finances: TileData[] = [
          {
            label: `Dépenses ${latest.year}${budgetSuffix}`,
            value: formatEuroCompact(latest.totals.depenses),
            sub: latest.type_budget === 'vote' ? 'Budget voté' : 'Budget exécuté',
            variation: ref2020 ? pctChange(latest.totals.depenses, ref2020.totals.depenses) : null,
            inverse: true,
            href: '/budget',
            color: 'border-blue-500/40',
          },
          {
            label: `Recettes ${latest.year}${budgetSuffix}`,
            value: formatEuroCompact(latest.totals.recettes),
            sub: latest.type_budget === 'vote' ? 'Budget voté' : 'Budget exécuté',
            variation: ref2020 ? pctChange(latest.totals.recettes, ref2020.totals.recettes) : null,
            href: '/budget',
            color: 'border-emerald-500/40',
          },
          {
            label: 'Durée de désendettement',
            value:
              dureeDesendettement !== null
                ? `${dureeDesendettement.toFixed(1).replace('.', ',')} ans`
                : 'Dette réduite',
            sub: 'Dette nette du mandat / épargne brute',
            variation: null,
            href: '/budget?tab=tendances',
            color:
              dureeDesendettement === null || dureeDesendettement < 5
                ? 'border-emerald-500/40'
                : dureeDesendettement < 10
                  ? 'border-amber-500/40'
                  : 'border-red-500/40',
          },
        ];

        const activite: TileData[] = [
          {
            label: `Subventions ${subYears[0]}`,
            value: formatEuroCompact(subLatest.montant_total),
            sub: `${formatNumber(subLatest.nb_subventions)} versements`,
            variation: subRef ? pctChange(subLatest.montant_total, subRef.montant_total) : null,
            variationRef: subRefYear,
            href: '/subventions',
            color: 'border-purple-500/40',
          },
          {
            label: 'Logements sociaux',
            value: formatNumber(log.total),
            sub: 'Financés depuis 2010',
            variation: null,
            href: '/logements',
            color: 'border-emerald-500/40',
          },
          {
            label: `Marchés ${marYears[0]}`,
            value: formatEuroCompact(marLatest.enveloppe_max_totale),
            sub: `${formatNumber(marLatest.nb_marches)} marchés passés`,
            variation: mar2020
              ? pctChange(marLatest.enveloppe_max_totale, mar2020.enveloppe_max_totale)
              : null,
            href: '/marches-publics',
            color: 'border-teal-500/40',
          },
        ];

        setFinanceTiles(finances);
        setActiviteTiles(activite);
      } catch (err) {
        console.error('KpiTilesSection load error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-1">
          Chiffres clés
        </h2>
        <p className="text-sm text-slate-500">
          Évolution depuis 2020, début du mandat municipal · cliquez pour explorer en détail
        </p>
      </div>

      {/* Finances */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Finances</p>
        <TileGrid tiles={financeTiles} />
      </div>

      {/* Activité */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Activité</p>
        <TileGrid tiles={activiteTiles} />
      </div>
    </section>
  );
}
