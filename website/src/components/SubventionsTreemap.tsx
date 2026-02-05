'use client';

/**
 * SubventionsTreemap - Visualisation treemap des subventions par thématique
 * 
 * Affiche un treemap interactif avec:
 * - Couleurs par thématique
 * - Taille proportionnelle au montant
 * - Tooltips avec détails (montant, %, nb bénéficiaires)
 * - Click pour filtrer la table associée
 * - Responsive: hauteur adaptative, labels optimisés pour mobile
 * 
 * Utilise ECharts pour le rendu.
 */

import { useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor } from '@/lib/colors';
import { useIsMobile, BREAKPOINTS } from '@/lib/hooks/useIsMobile';

/**
 * Données d'une thématique pour le treemap
 */
export interface TreemapThematique {
  annee: number;
  thematique: string;
  nb_beneficiaires: number;
  nb_subventions: number;
  montant_total: number;
  pct_total: number;
}

/**
 * Données complètes du treemap
 */
export interface TreemapData {
  year: number;
  total_montant: number;
  nb_thematiques: number;
  data: TreemapThematique[];
}

interface SubventionsTreemapProps {
  /** Données du treemap */
  data: TreemapData;
  /** Callback lors du clic sur une thématique */
  onThematiqueClick?: (thematique: string | null) => void;
  /** Thématique sélectionnée (pour highlight) */
  selectedThematique?: string | null;
  /** Hauteur du composant */
  height?: number;
}

export default function SubventionsTreemap({
  data,
  onThematiqueClick,
  selectedThematique,
  height = 400,
}: SubventionsTreemapProps) {
  const isMobile = useIsMobile(BREAKPOINTS.md);

  // Hauteur adaptative
  const chartHeight = isMobile ? Math.min(height, 300) : height;

  /**
   * Transformer les données pour ECharts
   */
  const chartData = useMemo(() => {
    return data.data.map((item) => ({
      name: item.thematique,
      value: item.montant_total,
      // Données additionnelles pour le tooltip
      itemStyle: {
        color: getThematiqueColor(item.thematique),
        borderColor: selectedThematique === item.thematique 
          ? '#fff' 
          : 'rgba(255,255,255,0.1)',
        borderWidth: selectedThematique === item.thematique ? 3 : 1,
      },
      // Métadonnées
      pct: item.pct_total,
      nbBeneficiaires: item.nb_beneficiaires,
      nbSubventions: item.nb_subventions,
    }));
  }, [data, selectedThematique]);

  /**
   * Configuration ECharts
   */
  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 8,
      padding: isMobile ? [8, 12] : [12, 16],
      confine: true, // Reste dans les limites sur mobile
      textStyle: {
        color: '#e2e8f0',
        fontSize: isMobile ? 11 : 13,
      },
      formatter: (params: unknown) => {
        const p = params as {
          name: string;
          value: number;
          data: { pct: number; nbBeneficiaires: number; nbSubventions: number };
        };
        
        return `
          <div style="font-weight: 600; margin-bottom: 6px; font-size: ${isMobile ? '12px' : '14px'};">
            ${p.name}
          </div>
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: ${isMobile ? '11px' : '12px'};">
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">Montant</span>
              <span style="font-weight: 500;">${formatEuroCompact(p.value)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">Part du total</span>
              <span style="font-weight: 500;">${p.data.pct.toFixed(1)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: ${isMobile ? '12px' : '24px'};">
              <span style="color: #94a3b8;">Bénéficiaires</span>
              <span style="font-weight: 500;">${formatNumber(p.data.nbBeneficiaires)}</span>
            </div>
          </div>
        `;
      },
    },

    series: [
      {
        type: 'treemap',
        data: chartData,
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        roam: false,
        nodeClick: 'link',
        
        // Style des nœuds
        breadcrumb: {
          show: false,
        },
        
        // Labels adaptatifs
        label: {
          show: true,
          formatter: (params: unknown) => {
            const p = params as { name: string; data: { pct: number } };
            // Seuil plus élevé sur mobile (cases plus petites)
            const threshold = isMobile ? 4 : 2;
            if (p.data.pct < threshold) return '';
            // Sur mobile, nom tronqué si nécessaire
            const displayName = isMobile && p.name.length > 10 
              ? p.name.substring(0, 9) + '…' 
              : p.name;
            return `${displayName}\n${p.data.pct.toFixed(0)}%`;
          },
          fontSize: isMobile ? 10 : 12,
          fontWeight: 500,
          color: '#fff',
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowBlur: isMobile ? 3 : 4,
        },
        
        // Upper label (nom seulement pour petites cases)
        upperLabel: {
          show: false,
        },
        
        // Niveaux
        levels: [
          {
            itemStyle: {
              borderColor: '#1e293b',
              borderWidth: isMobile ? 1 : 2,
              gapWidth: isMobile ? 1 : 2,
            },
          },
        ],
        
        // Animation
        animation: true,
        animationDuration: isMobile ? 300 : 500,
        animationEasing: 'cubicOut',
      },
    ],
  }), [chartData, isMobile]);

  /**
   * Gestion du clic
   */
  const handleClick = useCallback((params: unknown) => {
    const p = params as { name: string };
    if (onThematiqueClick) {
      // Si on clique sur la thématique déjà sélectionnée, désélectionner
      if (selectedThematique === p.name) {
        onThematiqueClick(null);
      } else {
        onThematiqueClick(p.name);
      }
    }
  }, [onThematiqueClick, selectedThematique]);

  return (
    <div className="w-full">
      {/* Header avec total - responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-100">
            Répartition par thématique
          </h3>
          <p className="text-xs sm:text-sm text-slate-400">
            {isMobile ? 'Appuyez pour filtrer' : 'Cliquez sur une thématique pour filtrer la table'}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xl sm:text-2xl font-bold text-slate-100">
            {formatEuroCompact(data.total_montant)}
          </p>
          <p className="text-xs sm:text-sm text-slate-400">
            {formatNumber(data.nb_thematiques)} thématiques
          </p>
        </div>
      </div>

      {/* Treemap - hauteur adaptative */}
      <div 
        className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden"
        style={{ height: chartHeight }}
      >
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          onEvents={{
            click: handleClick,
          }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* Indicateur de sélection - responsive */}
      {selectedThematique && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs sm:text-sm text-slate-400">Filtre actif :</span>
          <button
            onClick={() => onThematiqueClick?.(null)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 active:bg-purple-500/40 transition-colors"
          >
            {selectedThematique}
            <span className="text-purple-400">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
