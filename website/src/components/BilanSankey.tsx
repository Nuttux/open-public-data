'use client';

/**
 * Composant BilanSankey - Visualisation Sankey du bilan comptable
 * 
 * STRUCTURE:
 * Actif (gauche) → Patrimoine Paris (centre) ← Passif (droite)
 * 
 * FEATURES:
 * - Layout horizontal avec Actif à gauche, Passif à droite
 * - Vue simplifiée sur mobile (barres horizontales)
 * - Click pour drill-down vers les détails
 * - Responsive: ajuste automatiquement la taille
 */

import { useCallback, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatPercent, calculatePercentage } from '@/lib/formatters';
import { getBilanColor, BILAN_ACTIF_COLORS, BILAN_PASSIF_COLORS, BILAN_CENTRAL_COLOR } from '@/lib/colors';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';
import type { BilanSankeyData } from '@/lib/api/staticData';

interface BilanSankeyProps {
  data: BilanSankeyData;
  onNodeClick?: (nodeName: string, category: 'actif' | 'passif') => void;
}

/**
 * Vue mobile simplifiée - Barres horizontales Actif et Passif côte à côte
 */
function MobileBilanView({ data, onNodeClick }: BilanSankeyProps) {
  const maxValue = Math.max(
    ...data.links.map(l => l.value)
  );

  const actifNodes = data.nodes.filter(n => n.category === 'actif');
  const passifNodes = data.nodes.filter(n => n.category === 'passif');

  const getValueForNode = (nodeName: string) => {
    const link = data.links.find(l => l.source === nodeName || l.target === nodeName);
    return link?.value || 0;
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Actif */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Actif
        </h3>
        <div className="space-y-2">
          {actifNodes.map((node) => {
            const value = getValueForNode(node.name);
            return (
              <button
                key={node.name}
                onClick={() => onNodeClick?.(node.name, 'actif')}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 group-hover:text-white transition-colors truncate pr-2">
                    {node.name}
                  </span>
                  <span className="text-blue-400 font-medium whitespace-nowrap">
                    {formatEuroCompact(value)}
                  </span>
                </div>
                <div className="h-5 bg-slate-700/50 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-300 group-hover:opacity-80"
                    style={{
                      width: `${(value / maxValue) * 100}%`,
                      backgroundColor: getBilanColor(node.name, 'actif'),
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Passif */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Passif
        </h3>
        <div className="space-y-2">
          {passifNodes.map((node) => {
            const value = getValueForNode(node.name);
            return (
              <button
                key={node.name}
                onClick={() => onNodeClick?.(node.name, 'passif')}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 group-hover:text-white transition-colors truncate pr-2">
                    {node.name}
                  </span>
                  <span className="text-green-400 font-medium whitespace-nowrap">
                    {formatEuroCompact(value)}
                  </span>
                </div>
                <div className="h-5 bg-slate-700/50 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-300 group-hover:opacity-80"
                    style={{
                      width: `${(value / maxValue) * 100}%`,
                      backgroundColor: getBilanColor(node.name, 'passif'),
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BilanSankey({ data, onNodeClick }: BilanSankeyProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  const isSmallTablet = useIsMobile(BREAKPOINTS.lg);

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/1f8e710b-4d17-470f-93f7-199824cb8279',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BilanSankey.tsx:130',message:'BilanSankey render',data:{isMobile,isSmallTablet,windowWidth:typeof window!=='undefined'?window.innerWidth:0,breakpointMd:BREAKPOINTS.md,breakpointLg:BREAKPOINTS.lg,nodesCount:data.nodes.length,linksCount:data.links.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H4'})}).catch(()=>{});
  // #endregion

  // #region agent log - resize tracker
  useEffect(() => {
    const handleResize = () => {
      fetch('http://127.0.0.1:7243/ingest/1f8e710b-4d17-470f-93f7-199824cb8279',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BilanSankey.tsx:resize',message:'Window resized',data:{windowWidth:window.innerWidth,windowHeight:window.innerHeight,isMobile,isSmallTablet},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, isSmallTablet]);
  // #endregion

  const totalPatrimoine = useMemo(() => {
    return Math.max(data.totals.actif_net, data.totals.passif_net);
  }, [data.totals]);

  const getNodeColor = useCallback((name: string, category: string) => {
    if (category === 'central') return BILAN_CENTRAL_COLOR;
    if (category === 'actif') {
      return BILAN_ACTIF_COLORS[name] || '#64748b';
    }
    if (category === 'passif') {
      return BILAN_PASSIF_COLORS[name] || '#64748b';
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

  // Marges adaptatives selon la taille de l'écran
  const chartMargins = useMemo(() => {
    if (isSmallTablet) {
      return { left: 120, right: 140, top: 15, bottom: 15 };
    }
    return { left: 180, right: 200, top: 20, bottom: 20 };
  }, [isSmallTablet]);

  // Hauteur adaptative
  const chartHeight = useMemo(() => {
    return isSmallTablet ? 400 : 500;
  }, [isSmallTablet]);

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      textStyle: { color: '#e2e8f0' },
      confine: true,
      formatter: (params: unknown) => {
        const p = params as {
          dataType: string;
          name: string;
          value: number;
          data: { source?: string; target?: string; category?: string };
        };
        
        if (p.dataType === 'node') {
          const percentage = calculatePercentage(p.value, totalPatrimoine);
          let emoji = '📊';
          let label = 'Patrimoine';
          
          if (p.data.category === 'actif') {
            emoji = '🏛️';
            label = 'Actif';
          } else if (p.data.category === 'passif') {
            emoji = p.name.includes('Fonds') ? '💰' : '📋';
            label = p.name.includes('Fonds') ? 'Capitaux propres' : 'Passif';
          } else {
            emoji = '🏛️';
          }
          
          return `
            <div style="padding: 8px; max-width: 260px;">
              <div style="font-weight: 600; margin-bottom: 6px;">${p.name}</div>
              <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">${emoji} ${label}</div>
              <div style="font-size: 18px; font-weight: 700; color: #10b981;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 11px;">${formatPercent(percentage)} du patrimoine</div>
              ${p.data.category !== 'central' ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #334155; color: #60a5fa; font-size: 11px;">👆 Cliquez pour voir le détail</div>' : ''}
            </div>
          `;
        }
        
        if (p.dataType === 'edge') {
          const percentage = calculatePercentage(p.value, totalPatrimoine);
          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">
                ${p.data.source} → ${p.data.target}
              </div>
              <div style="font-size: 16px; font-weight: 700; color: #8b5cf6;">${formatEuroCompact(p.value)}</div>
              <div style="color: #94a3b8; font-size: 11px;">${formatPercent(percentage)} du patrimoine</div>
            </div>
          `;
        }
        
        return '';
      },
    },
    series: [
      {
        type: 'sankey',
        emphasis: {
          focus: 'adjacency',
          lineStyle: { opacity: 0.7 },
        },
        nodeAlign: 'justify',
        orient: 'horizontal',
        left: chartMargins.left,
        right: chartMargins.right,
        top: chartMargins.top,
        bottom: chartMargins.bottom,
        nodeWidth: isSmallTablet ? 16 : 20,
        nodeGap: isSmallTablet ? 12 : 16,
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
          fontSize: isSmallTablet ? 10 : 12,
          color: '#e2e8f0',
          fontWeight: 500,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: any) => {
            if (params.name === 'Patrimoine Paris') {
              return params.name;
            }
            const value = params.value || 0;
            const displayName = isSmallTablet && params.name.length > 14 
              ? params.name.substring(0, 13) + '…' 
              : params.name;
            return `${displayName}\n{small|${formatEuroCompact(value)}}`;
          },
          rich: {
            small: {
              fontSize: isSmallTablet ? 9 : 10,
              color: '#94a3b8',
              lineHeight: isSmallTablet ? 14 : 16,
            },
          },
        },
        levels: [
          {
            depth: 0,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'left', align: 'right', padding: [0, isSmallTablet ? 5 : 10, 0, 0] },
          },
          {
            depth: 1,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'inside', color: '#fff', fontSize: isSmallTablet ? 10 : 11 },
          },
          {
            depth: 2,
            lineStyle: { color: 'source', opacity: 0.4 },
            label: { position: 'right', align: 'left', padding: [0, 0, 0, isSmallTablet ? 5 : 10] },
          },
        ],
      },
    ],
  }), [chartData, totalPatrimoine, chartMargins, isSmallTablet]);

  const handleChartClick = useCallback((params: { 
    dataType?: string; 
    name?: string; 
    data?: { category?: string; source?: string; target?: string };
  }) => {
    if (params.dataType === 'node' && params.name && params.data?.category !== 'central') {
      const category = params.data?.category as 'actif' | 'passif';
      onNodeClick?.(params.name, category);
    }
    
    if (params.dataType === 'edge' && params.data) {
      const { source, target } = params.data;
      if (source === 'Patrimoine Paris' && target) {
        onNodeClick?.(target, 'passif');
      } else if (target === 'Patrimoine Paris' && source) {
        onNodeClick?.(source, 'actif');
      }
    }
  }, [onNodeClick]);

  // Vérification équilibre Actif = Passif
  const equilibreOk = data.totals.ecart_equilibre < 1000; // < 1000€ = équilibré

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-100">
            État patrimonial {data.year}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {isMobile ? 'Appuyez pour explorer' : 'Cliquez sur un poste pour voir le détail'}
          </p>
        </div>
        <div className={`px-3 py-2 rounded-lg text-xs sm:text-sm ${
          equilibreOk 
            ? 'bg-green-500/10 border border-green-500/30' 
            : 'bg-yellow-500/10 border border-yellow-500/30'
        }`}>
          <span className={equilibreOk ? 'text-green-400' : 'text-yellow-400'}>
            {equilibreOk ? '✓ Bilan équilibré' : `⚠️ Écart: ${formatEuroCompact(data.totals.ecart_equilibre)}`}
          </span>
        </div>
      </div>

      {/* Mobile: Vue simplifiée en barres */}
      {/* #region agent log */}
      {(() => { fetch('http://127.0.0.1:7243/ingest/1f8e710b-4d17-470f-93f7-199824cb8279',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BilanSankey.tsx:360',message:'Render branch decision',data:{isMobile,showingSankey:!isMobile,chartHeight,windowWidth:typeof window!=='undefined'?window.innerWidth:0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2,H3'})}).catch(()=>{}); return null; })()}
      {/* #endregion */}
      {isMobile ? (
        <MobileBilanView data={data} onNodeClick={onNodeClick} />
      ) : (
        <>
          {/* Desktop/Tablet: Sankey avec légende */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span className="text-slate-400">Actif immobilisé</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-500"></div>
              <span className="text-slate-400">Actif circulant</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
              <span className="text-slate-400">Patrimoine</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              <span className="text-slate-400">Fonds propres</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
              <span className="text-slate-400">Dettes</span>
            </div>
          </div>

          {/* #region agent log */}
          {(() => { fetch('http://127.0.0.1:7243/ingest/1f8e710b-4d17-470f-93f7-199824cb8279',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BilanSankey.tsx:395',message:'ReactECharts about to render',data:{chartHeight,isSmallTablet,nodesInOption:chartData.nodes.length,linksInOption:chartData.links.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{}); return null; })()}
          {/* #endregion */}
          <ReactECharts
            option={option}
            style={{ height: `${chartHeight}px`, width: '100%' }}
            onEvents={{
              click: handleChartClick,
            }}
            opts={{ renderer: 'canvas' }}
            lazyUpdate={true}
          />
        </>
      )}
    </div>
  );
}
