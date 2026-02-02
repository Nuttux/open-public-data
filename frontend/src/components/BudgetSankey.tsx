'use client';

/**
 * Composant BudgetSankey - Visualisation Sankey interactive du budget
 * 
 * FEATURES:
 * - Dark theme avec couleurs distinctes par groupe
 * - Click sur les nœuds ET les liens pour drill-down
 * - Labels complets (pas de troncature)
 * - Groupes de couleurs : Fiscalité, Services, Dette, etc.
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

// Couleurs par groupe de recettes (tons verts/cyans pour les revenus)
const REVENUE_COLORS: Record<string, string> = {
  'Impôts & Taxes': '#10b981',           // Emerald - largest revenue source
  'Services Publics': '#0ea5e9',         // Sky - fees from public services
  'Dotations & Subventions': '#06b6d4',  // Cyan - state transfers
  'Emprunts': '#f59e0b',                 // Amber - borrowing (⚠️ creates debt)
  'Investissement': '#8b5cf6',           // Violet - investment revenues
  'Autres': '#64748b',                   // Slate
  'default': '#64748b',
};

// Couleurs par catégorie de dépenses (tons bleus/roses)
const EXPENSE_COLORS: Record<string, string> = {
  'Action Sociale': '#ec4899',           // Pink - social programs (RSA, APA)
  'Personnel & Admin': '#3b82f6',        // Blue - administration
  'Éducation': '#8b5cf6',                // Violet - schools
  'Culture & Sport': '#f59e0b',          // Amber
  'Sécurité': '#ef4444',                 // Red
  'Aménagement & Logement': '#06b6d4',   // Cyan - urban planning, housing
  'Transports': '#84cc16',               // Lime
  'Environnement': '#22c55e',            // Green
  'Économie': '#f97316',                 // Orange
  'Dette': '#fbbf24',                    // Yellow - debt repayment
  'Autres': '#64748b',                   // Slate
  'default': '#64748b',
};

export default function BudgetSankey({ data, onNodeClick }: BudgetSankeyProps) {
  const totalBudget = useMemo(() => {
    return Math.max(data.totals.recettes, data.totals.depenses);
  }, [data.totals]);

  // Associe les couleurs aux nœuds
  const getNodeColor = useCallback((name: string, category: string) => {
    if (category === 'central') return '#a855f7'; // Purple for central node
    if (category === 'revenue') {
      return REVENUE_COLORS[name] || REVENUE_COLORS['default'];
    }
    if (category === 'expense') {
      return EXPENSE_COLORS[name] || EXPENSE_COLORS['default'];
    }
    return '#64748b';
  }, []);

  // Prépare les données pour ECharts
  const chartData = useMemo(() => {
    const nodes = data.nodes.map((node) => ({
      name: node.name,
      itemStyle: { 
        color: getNodeColor(node.name, node.category),
        borderColor: 'rgba(255,255,255,0.1)',
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

  // Options du graphique
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
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
            <div style="padding: 12px; max-width: 300px;">
              <div style="font-weight: 600; margin-bottom: 8px; word-wrap: break-word;">${p.name}</div>
              <div style="color: #94a3b8; font-size: 12px; margin-bottom: 4px;">${emoji} ${label}</div>
              <div style="font-size: 20px; font-weight: 700; color: #10b981;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} du budget total</div>
              ${p.data.category !== 'central' ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #334155; color: #60a5fa; font-size: 11px;">👆 Cliquez pour voir le détail</div>' : ''}
            </div>
          `;
        }
        
        if (p.dataType === 'edge') {
          const percentage = calculatePercentage(p.value, totalBudget);
          return `
            <div style="padding: 12px; max-width: 300px;">
              <div style="font-weight: 600; margin-bottom: 8px;">
                <span style="color: #10b981;">${p.data.source}</span>
                <span style="color: #64748b;"> → </span>
                <span style="color: #3b82f6;">${p.data.target}</span>
              </div>
              <div style="font-size: 20px; font-weight: 700; color: #f59e0b;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} du budget</div>
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #334155; color: #60a5fa; font-size: 11px;">👆 Cliquez pour explorer ce flux</div>
            </div>
          `;
        }
        
        return '';
      },
    },
    series: [
      {
        type: 'sankey',
        layout: 'none',
        emphasis: {
          focus: 'adjacency',
          lineStyle: { opacity: 0.8 },
        },
        nodeAlign: 'justify',
        orient: 'horizontal',
        nodeWidth: 24,
        nodeGap: 14,
        layoutIterations: 32,
        draggable: true,
        data: chartData.nodes,
        links: chartData.links,
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.35,
        },
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#cbd5e1',
          fontWeight: 500,
          // No truncation - show full labels
          overflow: 'none',
          formatter: (params: { name: string }) => params.name,
        },
        levels: [
          {
            depth: 0,
            lineStyle: { color: 'source', opacity: 0.35 },
            label: { position: 'left' },
          },
          {
            depth: 1,
            lineStyle: { color: 'source', opacity: 0.35 },
          },
          {
            depth: 2,
            lineStyle: { color: 'source', opacity: 0.35 },
            label: { position: 'right' },
          },
        ],
      },
    ],
  }), [chartData, totalBudget]);

  // Gestion du clic sur nœuds ET liens
  const handleChartClick = useCallback((params: { 
    dataType?: string; 
    name?: string; 
    data?: { category?: string; source?: string; target?: string };
  }) => {
    // Click on node
    if (params.dataType === 'node' && params.name && params.data?.category !== 'central') {
      const category = params.data?.category as 'revenue' | 'expense';
      onNodeClick?.(params.name, category);
    }
    
    // Click on edge/link - trigger drilldown for the source or target depending on which side
    if (params.dataType === 'edge' && params.data) {
      const { source, target } = params.data;
      // If source is the central node, drilldown on the expense (target)
      if (source === 'Budget Paris' && target) {
        onNodeClick?.(target, 'expense');
      }
      // If target is the central node, drilldown on the revenue (source)
      else if (target === 'Budget Paris' && source) {
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
          Cliquez sur un poste ou un flux pour explorer le détail
        </p>
      </div>
      
      {/* Légende avec couleurs */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-slate-400">Recettes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span className="text-slate-400">Budget Central</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-slate-400">Dépenses</span>
        </div>
      </div>

      <ReactECharts
        option={option}
        style={{ height: '650px', width: '100%' }}
        onEvents={{
          click: handleChartClick,
        }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
