'use client';

/**
 * PerCapitaSection — "À quoi servent vos impôts ?"
 *
 * Décompose le budget par thématique, rapporté à chaque Parisien.
 * Source : expense links du Sankey (Budget Paris → thématique).
 * Population : 2 103 778 (INSEE 2023, from arrondissements.ts).
 */

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { ARRONDISSEMENTS } from '@/lib/constants/arrondissements';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { PALETTE } from '@/lib/colors';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useT } from '@/lib/localeContext';

const TOTAL_POPULATION = ARRONDISSEMENTS.reduce((s, a) => s + a.population, 0);

/** Color per thématique */
const THEME_COLORS: Record<string, string> = {
  'Personnel & Admin': PALETTE.blue,
  'Action Sociale': PALETTE.rose,
  'Remboursement dette': PALETTE.slate,
  'Éducation': PALETTE.amber,
  'Culture & Sport': PALETTE.purple,
  'Aménagement & Logement': PALETTE.emerald,
  'Transports': PALETTE.cyan,
  'Environnement': PALETTE.green,
  'Sécurité': PALETTE.red,
  'Économie': PALETTE.orange,
  'Autres': PALETTE.violet,
};

const FALLBACK_COLORS = [
  PALETTE.blue, PALETTE.rose, PALETTE.amber, PALETTE.emerald,
  PALETTE.purple, PALETTE.cyan, PALETTE.orange, PALETTE.red,
  PALETTE.teal, PALETTE.violet, PALETTE.green, PALETTE.slate,
];

interface SankeyData {
  nodes: { name: string; category: string }[];
  links: { source: string; target: string; value: number }[];
  totals: { depenses: number };
  year: number;
  type_budget: string;
}

interface PerCapitaSectionProps {
  data: SankeyData;
}

interface ThematiqueRow {
  name: string;
  total: number;
  perCapita: number;
  perDay: number;
  pct: number;
  color: string;
}

export default function PerCapitaSection({ data }: PerCapitaSectionProps) {
  const t = useT();
  const isMobile = useIsMobile();

  const rows = useMemo<ThematiqueRow[]>(() => {
    // Get expense links (source = "Budget Paris")
    const expenseLinks = data.links.filter((l) => l.source === 'Budget Paris');
    const totalDepenses = expenseLinks.reduce((s, l) => s + l.value, 0);

    return expenseLinks
      .map((link, i) => ({
        name: link.target,
        total: link.value,
        perCapita: link.value / TOTAL_POPULATION,
        perDay: link.value / TOTAL_POPULATION / 365,
        pct: totalDepenses > 0 ? (link.value / totalDepenses) * 100 : 0,
        color: THEME_COLORS[link.target] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const totalPerCapita = useMemo(
    () => rows.reduce((s, r) => s + r.perCapita, 0),
    [rows],
  );
  const totalPerDay = totalPerCapita / 365;

  const budgetLabel = data.type_budget === 'vote' ? t('percapita.budget_voted') : t('percapita.budget_executed');

  // Horizontal stacked bar chart
  const chartOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9' },
      formatter: (params: unknown) => {
        const p = params as { name: string };
        const r = rows.find((row) => row.name === p.name);
        if (!r) return '';
        return `<strong>${r.name}</strong><br/>${formatEuroCompact(r.total)} (${r.pct.toFixed(1)}%)<br/>${formatNumber(Math.round(r.perCapita))} ${t('percapita.tooltip_per_hab')}`;
      },
    },
    series: [{
      type: 'pie',
      radius: isMobile ? ['45%', '75%'] : ['50%', '80%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
      label: {
        show: !isMobile,
        fontSize: 11,
        color: '#64748b',
        formatter: (params: unknown) => {
          const p = params as { name: string; percent?: number };
          return `${p.name}\n${p.percent?.toFixed(1)}%`;
        },
      },
      emphasis: {
        label: { show: true, fontWeight: 'bold', color: '#f1f5f9' },
      },
      data: rows.map((r) => ({
        name: r.name,
        value: r.total,
        itemStyle: { color: r.color },
      })),
    }],
  }), [rows, isMobile]);

  return (
    <section>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">
        {t('percapita.title')}
      </h2>
      <p className="text-sm text-slate-400 mb-1">
        {t('percapita.subtitle').replace('{year}', String(data.year)).replace('{budgetLabel}', budgetLabel).replace('{pop}', formatNumber(TOTAL_POPULATION))}
      </p>
      <p className="text-xs text-slate-500 mb-6">
        {t('percapita.funding_source')}
      </p>

      {/* Hero KPI */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 mb-8">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{t('percapita.per_hab_year')}</p>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-100">
            {formatNumber(Math.round(totalPerCapita))} €
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{t('percapita.per_hab_day')}</p>
          <p className="text-3xl sm:text-4xl font-extrabold text-blue-600">
            ~{totalPerDay.toFixed(1).replace('.', ',')} €
          </p>
        </div>
      </div>

      {/* Donut chart */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4 mb-6">
        <ReactECharts option={chartOption} style={{ height: isMobile ? 300 : 380 }} />
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {rows.map((r) => (
          <div
            key={r.name}
            className="bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-sm p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: r.color }}
              />
              <p className="text-xs font-medium text-slate-400 truncate">{r.name}</p>
            </div>
            <p className="text-lg font-bold text-slate-100">
              {formatNumber(Math.round(r.perCapita))} €<span className="text-xs font-normal text-slate-400">{t('percapita.per_year')}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {r.pct.toFixed(1)}{t('percapita.pct_budget')} · {r.perDay.toFixed(2).replace('.', ',')} {t('percapita.per_day')}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
