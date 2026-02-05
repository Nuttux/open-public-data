'use client';

/**
 * SubventionsTreemap - Visualisation treemap des subventions par thématique
 * 
 * Affiche un treemap interactif avec:
 * - Couleurs par thématique
 * - Taille proportionnelle au montant
 * - Tooltips avec détails (montant, %, nb bénéficiaires)
 * - Click pour filtrer la table associée
 * 
 * Utilise ECharts pour le rendu.
 */

import { useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import { getThematiqueColor } from '@/lib/colors';

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
      padding: [12, 16],
      textStyle: {
        color: '#e2e8f0',
        fontSize: 13,
      },
      formatter: (params: unknown) => {
        const p = params as {
          name: string;
          value: number;
          data: { pct: number; nbBeneficiaires: number; nbSubventions: number };
        };
        
        return `
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">
            ${p.name}
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; gap: 24px;">
              <span style="color: #94a3b8;">Montant</span>
              <span style="font-weight: 500;">${formatEuroCompact(p.value)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 24px;">
              <span style="color: #94a3b8;">Part du total</span>
              <span style="font-weight: 500;">${p.data.pct.toFixed(1)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 24px;">
              <span style="color: #94a3b8;">Bénéficiaires</span>
              <span style="font-weight: 500;">${formatNumber(p.data.nbBeneficiaires)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 24px;">
              <span style="color: #94a3b8;">Subventions</span>
              <span style="font-weight: 500;">${formatNumber(p.data.nbSubventions)}</span>
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
        
        // Labels
        label: {
          show: true,
          formatter: (params: unknown) => {
            const p = params as { name: string; data: { pct: number } };
            // N'afficher le label que si la case est assez grande
            if (p.data.pct < 2) return '';
            return `${p.name}\n${p.data.pct.toFixed(1)}%`;
          },
          fontSize: 12,
          fontWeight: 500,
          color: '#fff',
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowBlur: 4,
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
              borderWidth: 2,
              gapWidth: 2,
            },
          },
        ],
        
        // Animation
        animation: true,
        animationDuration: 500,
        animationEasing: 'cubicOut',
      },
    ],
  }), [chartData]);

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
      {/* Header avec total */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            Répartition par thématique
          </h3>
          <p className="text-sm text-slate-400">
            Cliquez sur une thématique pour filtrer la table
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-100">
            {formatEuroCompact(data.total_montant)}
          </p>
          <p className="text-sm text-slate-400">
            {formatNumber(data.nb_thematiques)} thématiques
          </p>
        </div>
      </div>

      {/* Treemap */}
      <div 
        className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden"
        style={{ height }}
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

      {/* Indicateur de sélection */}
      {selectedThematique && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-slate-400">Filtre actif :</span>
          <button
            onClick={() => onThematiqueClick?.(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
          >
            {selectedThematique}
            <span className="text-purple-400">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
