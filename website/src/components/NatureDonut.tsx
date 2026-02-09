'use client';

/**
 * NatureDonut - Donut chart avec drill-down par nature de dépense
 * 
 * FEATURES:
 * - Niveau 1: Répartition par nature (Personnel, Subventions, etc.)
 * - Niveau 2 (drill-down): Répartition par thématique au sein d'une nature
 * - Animation fluide entre niveaux
 * - Responsive: légende en bas, tailles adaptées mobile
 * - Total affiché au centre du donut
 * - Touch-friendly: zones de tap agrandies sur mobile
 * 
 * PROPS:
 * - data: Données du fichier budget_nature_{year}.json
 * - height: Hauteur du graphique (optionnel)
 * - onDrillDown: Callback quand on drill-down (optionnel)
 */

import { useState, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact } from '@/lib/formatters';
import { getNatureColor, getThematiqueColor } from '@/lib/colors';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

// Types pour les données
interface NatureItem {
  nature: string;
  montant: number;
  pct: number;
}

interface ThematiqueItem {
  thematique: string;
  montant: number;
  pct: number;
}

export interface BudgetNatureData {
  year: number;
  total_depenses: number;
  nb_natures: number;
  niveau_1: NatureItem[];
  niveau_2: Record<string, ThematiqueItem[]>;
}

interface NatureDonutProps {
  /** Données budget par nature */
  data: BudgetNatureData;
  /** Hauteur du graphique en pixels */
  height?: number;
  /** Callback au drill-down */
  onDrillDown?: (nature: string | null) => void;
}

export default function NatureDonut({ 
  data, 
  height = 400,
  onDrillDown 
}: NatureDonutProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);
  
  // Hauteur adaptative
  const chartHeight = isMobile ? Math.min(height, 320) : height;
  
  // État: nature sélectionnée pour drill-down (null = niveau 1)
  const [selectedNature, setSelectedNature] = useState<string | null>(null);

  // Données actuelles selon le niveau
  const currentData = useMemo(() => {
    if (!selectedNature) {
      // Niveau 1: par nature
      return {
        title: 'Répartition par nature',
        total: data.total_depenses,
        items: data.niveau_1.map(item => ({
          name: item.nature,
          value: item.montant,
          pct: item.pct,
          color: getNatureColor(item.nature),
        })),
      };
    } else {
      // Niveau 2: par thématique dans la nature sélectionnée
      const thematiques = data.niveau_2[selectedNature] || [];
      const total = thematiques.reduce((sum, t) => sum + t.montant, 0);
      
      return {
        title: selectedNature,
        total,
        items: thematiques.map(item => ({
          name: item.thematique,
          value: item.montant,
          pct: item.pct,
          color: getThematiqueColor(item.thematique),
        })),
      };
    }
  }, [data, selectedNature]);

  // Gérer le clic pour drill-down
  const handleClick = useCallback((params: { name?: string }) => {
    if (!params.name) return;

    if (!selectedNature) {
      // On est au niveau 1, drill-down vers niveau 2
      setSelectedNature(params.name);
      onDrillDown?.(params.name);
    }
    // Au niveau 2, on ne fait rien (ou on pourrait ouvrir un détail)
  }, [selectedNature, onDrillDown]);

  // Retour au niveau 1
  const handleBack = useCallback(() => {
    setSelectedNature(null);
    onDrillDown?.(null);
  }, [onDrillDown]);

  // Options ECharts - responsive
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      confine: true,
      textStyle: {
        color: '#f1f5f9',
        fontSize: isMobile ? 11 : 12,
      },
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; data: { pct: number } };
        return `
          <div style="font-weight: 600; margin-bottom: 4px; font-size: ${isMobile ? '12px' : '14px'};">${p.name}</div>
          <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '10px' : '16px'}; font-size: ${isMobile ? '11px' : '12px'};">
            <span>Montant:</span>
            <span style="font-weight: 500;">${formatEuroCompact(p.value)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '10px' : '16px'}; font-size: ${isMobile ? '11px' : '12px'};">
            <span>Part:</span>
            <span style="font-weight: 500;">${p.data.pct.toFixed(1)}%</span>
          </div>
          ${!selectedNature ? `<div style="margin-top: 6px; color: #60a5fa; font-size: ${isMobile ? '10px' : '11px'};">${isMobile ? 'Tap pour détail →' : 'Cliquez pour détail →'}</div>` : ''}
        `;
      },
    },

    // Total au centre - tailles adaptatives
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: isMobile ? '40%' : '42%',
        style: {
          text: formatEuroCompact(currentData.total),
          fontSize: isMobile ? 18 : 24,
          fontWeight: 'bold',
          fill: '#f1f5f9',
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: isMobile ? '50%' : '52%',
        style: {
          text: selectedNature ? 'dans cette catégorie' : 'Total dépenses',
          fontSize: isMobile ? 10 : 12,
          fill: '#94a3b8',
          textAlign: 'center',
        },
      },
    ],

    series: [
      {
        name: currentData.title,
        type: 'pie',
        radius: isMobile ? ['45%', '70%'] : ['50%', '75%'], // Donut légèrement plus petit sur mobile
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: isMobile ? 4 : 6,
          borderColor: '#1e293b',
          borderWidth: isMobile ? 1 : 2,
        },
        label: {
          show: false, // Labels cachés, on utilise la légende
        },
        emphasis: {
          scale: true,
          scaleSize: isMobile ? 6 : 8,
          itemStyle: {
            shadowBlur: isMobile ? 10 : 20,
            shadowColor: 'rgba(0, 0, 0, 0.3)',
          },
        },
        data: currentData.items.map(item => ({
          name: item.name,
          value: item.value,
          pct: item.pct,
          itemStyle: { color: item.color },
        })),
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDuration: isMobile ? 300 : 400,
      },
    ],
  }), [currentData, selectedNature, isMobile]);

  return (
    <div className="w-full">
      {/* Header avec titre et bouton retour - responsive */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {selectedNature && (
            <button
              onClick={handleBack}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 active:bg-slate-600 transition-colors flex-shrink-0"
              aria-label="Retour"
            >
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h3 className="text-xs sm:text-sm font-medium text-slate-300 truncate">
            {selectedNature ? (
              <>
                <span className="text-slate-500 hidden sm:inline">Nature →</span> {selectedNature}
              </>
            ) : (
              isMobile ? 'Appuyez pour explorer' : 'Cliquez sur une catégorie pour voir le détail'
            )}
          </h3>
        </div>
      </div>

      {/* Chart - hauteur adaptative */}
      <ReactECharts
        option={option}
        style={{ height: `${chartHeight}px`, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{ click: handleClick }}
      />

      {/* Légende responsive - 2 colonnes sur mobile, plus sur desktop */}
      <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
        {currentData.items.slice(0, isMobile ? 6 : 8).map((item) => (
          <button
            key={item.name}
            onClick={() => !selectedNature && handleClick({ name: item.name })}
            className={`
              flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg text-left transition-colors
              ${!selectedNature ? 'hover:bg-slate-700/50 active:bg-slate-700 cursor-pointer' : 'cursor-default'}
            `}
          >
            <span
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] sm:text-xs text-slate-300 truncate flex-1">
              {item.name}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium">
              {item.pct.toFixed(0)}%
            </span>
          </button>
        ))}
      </div>

      {/* Afficher "et X autres" si plus d'items que visibles */}
      {currentData.items.length > (isMobile ? 6 : 8) && (
        <p className="text-[10px] sm:text-xs text-slate-500 mt-2 text-center">
          et {currentData.items.length - (isMobile ? 6 : 8)} autres catégories
        </p>
      )}
    </div>
  );
}
