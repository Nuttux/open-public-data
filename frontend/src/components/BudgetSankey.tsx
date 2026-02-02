'use client';

/**
 * Composant BudgetSankey - Visualisation Sankey interactive du budget
 * 
 * FEATURES:
 * - Orientation verticale pour meilleure lisibilité des labels
 * - Dark theme avec couleurs distinctes par groupe
 * - Click sur les nœuds ET les liens pour drill-down
 * - Labels avec montants
 */

import { useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import type { BudgetData } from '@/lib/formatters';

interface BudgetSankeyProps {
  data: BudgetData;
  onNodeClick?: (nodeName: string, category: 'revenue' | 'expense') => void;
}

// Couleurs par groupe de recettes
const REVENUE_COLORS: Record<string, string> = {
  'Impôts & Taxes': '#10b981',
  'Services Publics': '#0ea5e9',
  'Dotations & Subventions': '#06b6d4',
  'Emprunts': '#f59e0b',
  'Investissement': '#8b5cf6',
  'Autres': '#64748b',
  'default': '#64748b',
};

// Couleurs par catégorie de dépenses
const EXPENSE_COLORS: Record<string, string> = {
  'Action Sociale': '#ec4899',
  'Personnel & Admin': '#3b82f6',
  'Éducation': '#8b5cf6',
  'Culture & Sport': '#f59e0b',
  'Sécurité': '#ef4444',
  'Aménagement & Logement': '#06b6d4',
  'Transports': '#84cc16',
  'Environnement': '#22c55e',
  'Économie': '#f97316',
  'Dette': '#fbbf24',
  'Autres': '#64748b',
  'default': '#64748b',
};

export default function BudgetSankey({ data, onNodeClick }: BudgetSankeyProps) {
  const totalBudget = useMemo(() => {
    return Math.max(data.totals.recettes, data.totals.depenses);
  }, [data.totals]);

  // Associe les couleurs aux nœuds
  const getNodeColor = useCallback((name: string, category: string) => {
    if (category === 'central') return '#a855f7';
    if (category === 'revenue') {
      return REVENUE_COLORS[name] || REVENUE_COLORS['default'];
    }
    if (category === 'expense') {
      return EXPENSE_COLORS[name] || EXPENSE_COLORS['default'];
    }
    return '#64748b';
  }, []);

  // Trouve la valeur d'un nœud pour l'afficher dans le label
  const getNodeValue = useCallback((nodeName: string): number => {
    const link = data.links.find(l => l.source === nodeName || l.target === nodeName);
    return link?.value || 0;
  }, [data.links]);

  // Prépare les données pour ECharts
  const chartData = useMemo(() => {
    const nodes = data.nodes.map((node) => ({
      name: node.name,
      itemStyle: { 
        color: getNodeColor(node.name, node.category),
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
      },
      category: node.category,
    }));

    const links = data.links.map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
    }));

    return { nodes, links };
  }, [data, getNodeColor]);

  // Options du graphique - mode VERTICAL pour meilleure lisibilité
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      textStyle: { color: '#e2e8f0' },
      formatter: (params: unknown) => {
        const p = params as {
          dataType: string;
          name: string;
          value: number;
          data: { source?: string; target?: string; category?: string };
        };
        
        if (p.dataType === 'node') {
          const percentage = calculatePercentage(p.value, totalBudget);
          const emoji = p.data.category === 'revenue' ? '📈' : p.data.category === 'expense' ? '📉' : '🏛️';
          const label = p.data.category === 'revenue' ? 'Recette' : p.data.category === 'expense' ? 'Dépense' : 'Budget';
          
          return `
            <div style="padding: 12px; max-width: 280px;">
              <div style="font-weight: 600; margin-bottom: 8px; word-wrap: break-word;">${p.name}</div>
              <div style="color: #94a3b8; font-size: 12px; margin-bottom: 4px;">${emoji} ${label}</div>
              <div style="font-size: 22px; font-weight: 700; color: #10b981;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} du budget</div>
              ${p.data.category !== 'central' ? '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #334155; color: #60a5fa; font-size: 12px; font-weight: 500;">👆 Cliquez pour explorer</div>' : ''}
            </div>
          `;
        }
        
        if (p.dataType === 'edge') {
          const percentage = calculatePercentage(p.value, totalBudget);
          return `
            <div style="padding: 12px; max-width: 280px;">
              <div style="font-weight: 600; margin-bottom: 8px;">
                <span style="color: #10b981;">${p.data.source}</span>
                <span style="color: #64748b;"> → </span>
                <span style="color: #3b82f6;">${p.data.target}</span>
              </div>
              <div style="font-size: 22px; font-weight: 700; color: #f59e0b;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} du budget</div>
            </div>
          `;
        }
        
        return '';
      },
    },
    // Grid pour laisser de la place aux labels
    grid: {
      left: '15%',
      right: '15%',
      top: '5%',
      bottom: '5%',
    },
    series: [
      {
        type: 'sankey',
        layout: 'none',
        emphasis: {
          focus: 'adjacency',
          lineStyle: { opacity: 0.7 },
        },
        nodeAlign: 'justify',
        orient: 'vertical',  // VERTICAL pour labels lisibles
        nodeWidth: 20,
        nodeGap: 12,
        layoutIterations: 32,
        draggable: true,
        left: '5%',
        right: '5%',
        top: 80,
        bottom: 30,
        data: chartData.nodes,
        links: chartData.links,
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.4,
        },
        label: {
          show: true,
          fontSize: 11,
          color: '#e2e8f0',
          fontWeight: 500,
          padding: [4, 8],
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          borderRadius: 4,
          formatter: (params: { name: string }) => {
            const value = getNodeValue(params.name);
            if (params.name === 'Budget Paris') {
              return `{title|${params.name}}\n{amount|${formatEuroCompact(totalBudget)}}`;
            }
            return `{name|${params.name}}\n{value|${formatEuroCompact(value)}}`;
          },
          rich: {
            title: {
              fontSize: 13,
              fontWeight: 700,
              color: '#a855f7',
              padding: [0, 0, 2, 0],
            },
            amount: {
              fontSize: 11,
              color: '#cbd5e1',
            },
            name: {
              fontSize: 11,
              fontWeight: 600,
              color: '#e2e8f0',
              padding: [0, 0, 2, 0],
            },
            value: {
              fontSize: 10,
              color: '#94a3b8',
            },
          },
        },
        levels: [
          {
            depth: 0,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'top' },
          },
          {
            depth: 1,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'right' },
          },
          {
            depth: 2,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'bottom' },
          },
        ],
      },
    ],
  }), [chartData, totalBudget, getNodeValue]);

  // Gestion du clic
  const handleChartClick = useCallback((params: { 
    dataType?: string; 
    name?: string; 
    data?: { category?: string; source?: string; target?: string };
  }) => {
    if (params.dataType === 'node' && params.name && params.data?.category !== 'central') {
      const category = params.data?.category as 'revenue' | 'expense';
      onNodeClick?.(params.name, category);
    }
    
    if (params.dataType === 'edge' && params.data) {
      const { source, target } = params.data;
      if (source === 'Budget Paris' && target) {
        onNodeClick?.(target, 'expense');
      } else if (target === 'Budget Paris' && source) {
        onNodeClick?.(source, 'revenue');
      }
    }
  }, [onNodeClick]);

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Flux budgétaires {data.year}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Cliquez sur une catégorie pour explorer le détail • Glissez pour réorganiser
        </p>
      </div>
      
      {/* Légende */}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-slate-300">Recettes</span>
          <span className="text-emerald-400 font-semibold ml-1">{formatEuroCompact(data.totals.recettes)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span className="text-slate-300">Budget</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-slate-300">Dépenses</span>
          <span className="text-blue-400 font-semibold ml-1">{formatEuroCompact(data.totals.depenses)}</span>
        </div>
      </div>

      <ReactECharts
        option={option}
        style={{ height: '700px', width: '100%' }}
        onEvents={{
          click: handleChartClick,
        }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
