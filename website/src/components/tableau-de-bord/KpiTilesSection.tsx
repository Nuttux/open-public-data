'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { ARRONDISSEMENTS } from '@/lib/constants/arrondissements';

const TOTAL_POPULATION = ARRONDISSEMENTS.reduce((s, a) => s + a.population, 0);

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionYear {
  year: number;
  totals: {
    depenses: number;
    recettes: number;
  };
  sections: {
    fonctionnement: { recettes: number; depenses: number };
    investissement: { recettes: number; depenses: number };
  };
  epargne_brute: number;
  type_budget: string;
}

interface SubventionsIndex {
  totals_by_year: Record<string, { montant_total: number; nb_subventions: number }>;
}

interface LogementRecord {
  annee: number;
  nbLogements: number;
  nbPLAI: number;
}

interface LogementsData {
  total: number;
  data: LogementRecord[];
}

interface MarchesIndex {
  totals_by_year: Record<string, { nb_marches: number; enveloppe_max_totale: number }>;
}

interface TileData {
  label: string;
  value: string;
  sub: string;
  href: string;
  color: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
          <p className="text-[11px] text-slate-500 truncate">{tile.sub}</p>
        </Link>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function KpiTilesSection() {
  const [budgetTiles, setBudgetTiles] = useState<TileData[]>([]);
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

        // ── Budget metrics ────────────────────────────────────────────
        // Use latest executed year for coherence with activity data (all 2024)
        const latest = evo.years.find((y) => y.type_budget === 'execute') || evo.years[0];
        const budgetSuffix = latest.type_budget === 'vote' ? ' (BP)' : '';

        const perCapitaDay = latest.totals.depenses / TOTAL_POPULATION / 365;
        const investDepenses = latest.sections.investissement.depenses;
        const investPct = (investDepenses / latest.totals.depenses) * 100;
        const epargne = latest.epargne_brute;

        const budget: TileData[] = [
          {
            label: `Votre budget quotidien${budgetSuffix}`,
            value: `${perCapitaDay.toFixed(1).replace('.', ',')} €/jour`,
            sub: `par Parisien · ${formatNumber(Math.round(latest.totals.depenses / TOTAL_POPULATION))} €/an`,
            href: '/budget',
            color: 'border-blue-500/40',
          },
          {
            label: `Investissement ${latest.year}${budgetSuffix}`,
            value: formatEuroCompact(investDepenses),
            sub: `${investPct.toFixed(0)}% du budget · écoles, voirie, équipements`,
            href: '/investissements',
            color: 'border-emerald-500/40',
          },
          {
            label: `Santé financière ${latest.year}${budgetSuffix}`,
            value: formatEuroCompact(epargne),
            sub: "Épargne brute · capacité d'autofinancement",
            href: '/budget?tab=tendances',
            color: epargne > 0 ? 'border-emerald-500/40' : 'border-red-500/40',
          },
        ];

        // ── Activité metrics ──────────────────────────────────────────

        // 4. Subventions / Aides versées
        const subYears = Object.keys(sub.totals_by_year).map(Number).sort((a, b) => b - a);
        const subLatest = sub.totals_by_year[subYears[0]];
        const montantMoyen = subLatest.montant_total / subLatest.nb_subventions;

        // 5. Logements sociaux — annualisé avec % PLAI
        const logYears = [...new Set(log.data.map((d) => d.annee))].sort((a, b) => b - a);
        const latestLogYear = logYears[0];
        const logementsLatest = log.data.filter((d) => d.annee === latestLogYear);
        const nbLogementsYear = logementsLatest.reduce((s, d) => s + d.nbLogements, 0);
        const nbPLAI = logementsLatest.reduce((s, d) => s + d.nbPLAI, 0);
        const pctPLAI = nbLogementsYear > 0 ? (nbPLAI / nbLogementsYear) * 100 : 0;

        // 6. Marchés publics
        const marYears = Object.keys(mar.totals_by_year).map(Number).sort((a, b) => b - a);
        const marLatest = mar.totals_by_year[marYears[0]];

        const activite: TileData[] = [
          {
            label: `Aides versées ${subYears[0]}`,
            value: formatEuroCompact(subLatest.montant_total),
            sub: `${formatNumber(subLatest.nb_subventions)} versements · moy. ${formatEuroCompact(montantMoyen)}`,
            href: '/subventions',
            color: 'border-purple-500/40',
          },
          {
            label: `Logements financés ${latestLogYear}`,
            value: `${formatNumber(nbLogementsYear)} logements`,
            sub: `dont ${pctPLAI.toFixed(0)}% très sociaux (PLAI)`,
            href: '/logements',
            color: 'border-amber-500/40',
          },
          {
            label: `Commande publique ${marYears[0]}`,
            value: `${formatNumber(marLatest.nb_marches)} marchés`,
            sub: 'Marchés notifiés dans l\'année',
            href: '/marches-publics',
            color: 'border-teal-500/40',
          },
        ];

        setBudgetTiles(budget);
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
          Paris en un coup d&apos;œil
        </h2>
        <p className="text-sm text-slate-500">
          Cliquez sur un indicateur pour explorer en détail
        </p>
      </div>

      {/* Votre budget */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Votre budget</p>
        <TileGrid tiles={budgetTiles} />
      </div>

      {/* Activité */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Activité</p>
        <TileGrid tiles={activiteTiles} />
      </div>
    </section>
  );
}
