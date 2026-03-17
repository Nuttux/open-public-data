'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { ARRONDISSEMENTS } from '@/lib/constants/arrondissements';
import { useT } from '@/lib/localeContext';

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
  totalsByYear: Record<string, { montant_total: number; nb_subventions: number }>;
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
  totalsByYear: Record<string, { nb_marches: number; enveloppe_max_totale: number }>;
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
          <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1 group-hover:text-slate-500 transition-colors">
            {tile.label}
          </p>
          <p className="text-xl font-bold text-slate-100 mb-0.5">{tile.value}</p>
          <p className="text-[11px] text-slate-400 truncate">{tile.sub}</p>
        </Link>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function KpiTilesSection() {
  const t = useT();
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
        const latest = evo.years[0];
        const budgetSuffix = latest.type_budget === 'vote' ? t('kpi.forecast') : '';

        const perCapitaDay = latest.totals.depenses / TOTAL_POPULATION / 365;
        const investDepenses = latest.sections.investissement.depenses;
        const investPct = (investDepenses / latest.totals.depenses) * 100;
        const investPerCapita = Math.round(investDepenses / TOTAL_POPULATION);
        const epargne = latest.epargne_brute;
        const epargnePct = latest.sections.fonctionnement.recettes > 0
          ? (epargne / latest.sections.fonctionnement.recettes) * 100 : 0;

        const budget: TileData[] = [
          {
            label: `${t('kpi.daily_budget')}${budgetSuffix}`,
            value: `${perCapitaDay.toFixed(1).replace('.', ',')} €${t('kpi.per_day_suffix')}`,
            sub: `${t('kpi.per_parisian')} · ${formatNumber(Math.round(latest.totals.depenses / TOTAL_POPULATION))} €${t('kpi.per_year')}`,
            href: '/budget',
            color: 'border-blue-500/40',
          },
          {
            label: `${t('kpi.major_projects')} ${latest.year}${budgetSuffix}`,
            value: formatEuroCompact(investDepenses),
            sub: `${investPct.toFixed(0)}${t('kpi.of_budget')} · ${formatNumber(investPerCapita)} ${t('kpi.per_hab')}`,
            href: '/investissements',
            color: 'border-emerald-500/40',
          },
          {
            label: `${t('kpi.paris_savings')} ${latest.year}${budgetSuffix}`,
            value: formatEuroCompact(epargne),
            sub: `${epargnePct.toFixed(1)}${t('kpi.of_revenue')}`,
            href: '/budget?tab=tendances',
            color: epargne > 0 ? 'border-emerald-500/40' : 'border-red-500/40',
          },
        ];

        // ── Activité metrics ──────────────────────────────────────────

        // 4. Subventions / Aides versées
        const subYears = Object.keys(sub.totalsByYear).map(Number).sort((a, b) => b - a);
        const subLatest = sub.totalsByYear[subYears[0]];
        const subPerCapita = Math.round(subLatest.montant_total / TOTAL_POPULATION);

        // 5. Logements sociaux — annualisé avec % PLAI
        const logYears = [...new Set(log.data.map((d) => d.annee))].sort((a, b) => b - a);
        const latestLogYear = logYears[0];
        const logementsLatest = log.data.filter((d) => d.annee === latestLogYear);
        const nbLogementsYear = logementsLatest.reduce((s, d) => s + d.nbLogements, 0);
        const nbPLAI = logementsLatest.reduce((s, d) => s + d.nbPLAI, 0);
        const pctPLAI = nbLogementsYear > 0 ? (nbPLAI / nbLogementsYear) * 100 : 0;
        const logPer1000 = (nbLogementsYear / TOTAL_POPULATION) * 1000;

        // 6. Marchés publics
        const marYears = Object.keys(mar.totalsByYear).map(Number).sort((a, b) => b - a);
        const marLatest = mar.totalsByYear[marYears[0]];

        const activite: TileData[] = [
          {
            label: `${t('kpi.grants_label')} ${subYears[0]}`,
            value: formatEuroCompact(subLatest.montant_total),
            sub: `${formatNumber(subLatest.nb_subventions)} ${t('kpi.payments')} · ${formatNumber(subPerCapita)} ${t('kpi.per_hab')}`,
            href: '/subventions',
            color: 'border-purple-500/40',
          },
          {
            label: `${t('kpi.housing_funded')} ${latestLogYear}`,
            value: `${formatNumber(nbLogementsYear)} ${t('kpi.housing_units')}`,
            sub: t('kpi.housing_sub').replace('{pct}', pctPLAI.toFixed(0)).replace('{per1000}', logPer1000.toFixed(1)),
            href: '/logements',
            color: 'border-amber-500/40',
          },
          {
            label: `${t('kpi.public_procurement')} ${marYears[0]}`,
            value: t('kpi.contracts_count').replace('{count}', formatNumber(marLatest.nb_marches)),
            sub: t('kpi.contracts_notified'),
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
  }, [t]);

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
          {t('kpi.title')}
        </h2>
        <p className="text-sm text-slate-400">
          {t('ui.click_indicator')}
        </p>
      </div>

      {/* Votre budget */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t('kpi.your_budget')}</p>
        <TileGrid tiles={budgetTiles} />
      </div>

      {/* Activité */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{t('kpi.activity')}</p>
        <TileGrid tiles={activiteTiles} />
      </div>
    </section>
  );
}
