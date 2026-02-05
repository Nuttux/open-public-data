'use client';

/**
 * Composant BudgetSankey - Visualisation Sankey du budget
 * 
 * FEATURES:
 * - Layout horizontal avec marges pour labels lisibles
 * - Emprunts/Dette visuellement distincts
 * - Click pour drill-down
 */

import { useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import { REVENUE_COLORS, EXPENSE_COLORS } from '@/lib/colors';
import type { BudgetData } from '@/lib/formatters';

interface BudgetSankeyProps {
  data: BudgetData;
  onNodeClick?: (nodeName: string, category: 'revenue' | 'expense') => void;
}

export default function BudgetSankey({ data, onNodeClick }: BudgetSankeyProps) {
  const totalBudget = useMemo(() => {
    return Math.max(data.totals.recettes, data.totals.depenses);
  }, [data.totals]);

  // Calcul des montants d'emprunts et dette
  const financingInfo = useMemo(() => {
    const empruntsLink = data.links.find(l => l.source === 'Emprunts');
    const detteLink = data.links.find(l => l.target === 'Dette');
    return {
      emprunts: empruntsLink?.value || 0,
      dette: detteLink?.value || 0,
    };
  }, [data.links]);

  const getNodeColor = useCallback((name: string, category: string) => {
    if (category === 'central') return '#a855f7';
    if (category === 'revenue') {
      return REVENUE_COLORS[name] || '#64748b';
    }
    if (category === 'expense') {
      return EXPENSE_COLORS[name] || '#64748b';
    }
    return '#64748b';
  }, []);

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
          let emoji = '📊';
          let label = 'Budget';
          
          if (p.data.category === 'revenue') {
            emoji = p.name === 'Emprunts' ? '🏦' : '📈';
            label = p.name === 'Emprunts' ? 'Financement' : 'Recette';
          } else if (p.data.category === 'expense') {
            emoji = p.name === 'Dette' ? '💳' : '📉';
            label = p.name === 'Dette' ? 'Remboursement' : 'Dépense';
          } else {
            emoji = '🏛️';
          }
          
          return `
            <div style="padding: 12px; max-width: 280px;">
              <div style="font-weight: 600; margin-bottom: 8px;">${p.name}</div>
              <div style="color: #94a3b8; font-size: 12px; margin-bottom: 4px;">${emoji} ${label}</div>
              <div style="font-size: 22px; font-weight: 700; color: #10b981;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} du budget</div>
              ${p.data.category !== 'central' ? '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #334155; color: #60a5fa; font-size: 12px;">👆 Cliquez pour le détail</div>' : ''}
            </div>
          `;
        }
        
        if (p.dataType === 'edge') {
          const percentage = calculatePercentage(p.value, totalBudget);
          return `
            <div style="padding: 12px;">
              <div style="font-weight: 600; margin-bottom: 8px;">
                ${p.data.source} → ${p.data.target}
              </div>
              <div style="font-size: 20px; font-weight: 700; color: #f59e0b;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 12px;">${formatPercent(percentage)} du budget</div>
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
          lineStyle: { opacity: 0.7 },
        },
        nodeAlign: 'justify',
        orient: 'horizontal',
        left: 180,
        right: 200,
        top: 20,
        bottom: 20,
        nodeWidth: 20,
        nodeGap: 10,
        layoutIterations: 32,
        draggable: true,
        data: chartData.nodes,
        links: chartData.links,
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.4,
        },
        label: {
          show: true,
          fontSize: 12,
          color: '#e2e8f0',
          fontWeight: 500,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            if (params.name === 'Budget Paris') {
              return params.name;
            }
            const value = params.value || 0;
            return `${params.name}\n{small|${formatEuroCompact(value)}}`;
          },
          rich: {
            small: {
              fontSize: 10,
              color: '#94a3b8',
              lineHeight: 16,
            },
          },
        },
        levels: [
          {
            depth: 0,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'left', align: 'right', padding: [0, 10, 0, 0] },
          },
          {
            depth: 1,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'inside', color: '#fff', fontSize: 11 },
          },
          {
            depth: 2,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'right', align: 'left', padding: [0, 0, 0, 10] },
          },
        ],
      },
    ],
  }), [chartData, totalBudget]);

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

  const variationDette = financingInfo.emprunts - financingInfo.dette;

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
        <h2 className="text-lg font-semibold text-slate-100">
          Flux budgétaires {data.year}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
            Cliquez sur une catégorie pour explorer
        </p>
        </div>
        <div className={`px-3 py-2 rounded-lg text-sm ${
          variationDette > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30'
        }`}>
          <span className={variationDette > 0 ? 'text-red-400' : 'text-green-400'}>
            {variationDette > 0 ? '📈 Dette +' : '📉 Dette '}{formatEuroCompact(variationDette)}
          </span>
        </div>
      </div>
      
      {/* Légende responsive */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          <span className="text-slate-400">Recettes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
          <span className="text-slate-400">Emprunts</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
          <span className="text-slate-400">Budget</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
          <span className="text-slate-400">Dépenses</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
          <span className="text-slate-400">Dette</span>
        </div>
      </div>

      <ReactECharts
        option={option}
        style={{ height: '550px', width: '100%' }}
        onEvents={{
          click: handleChartClick,
        }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
