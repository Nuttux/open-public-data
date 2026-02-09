'use client';

/**
 * DataQualityBanner - Composant d'avertissement sur la qualité des données
 * 
 * Affiche un bandeau d'alerte lorsque les données pour une année/dataset
 * sont incomplètes ou dégradées (ex: 2020-2021 subventions sans bénéficiaires).
 * 
 * Usage:
 * <DataQualityBanner dataset="subventions" year={2020} />
 */

import { useMemo } from 'react';

/**
 * Configuration des warnings par dataset et année
 * Basé sur l'audit de qualité documenté dans architecture-modelling.md
 */
const DATA_WARNINGS: Record<string, Record<number, { severity: 'error' | 'warning'; message: string }>> = {
  subventions: {
    2020: {
      severity: 'error',
      message: 'Données 2020 incomplètes : détail des bénéficiaires absent de la source OpenData.',
    },
    2021: {
      severity: 'error', 
      message: 'Données 2021 incomplètes : détail des bénéficiaires absent de la source OpenData.',
    },
  },
  ap_projets: {
    2023: {
      severity: 'warning',
      message: 'Données 2023 non encore publiées par OpenData Paris.',
    },
    2024: {
      severity: 'warning',
      message: 'Données 2024 non encore publiées par OpenData Paris.',
    },
  },
  budget: {},
  logements: {},
};

export interface DataQualityBannerProps {
  /** Type de dataset */
  dataset: 'budget' | 'subventions' | 'ap_projets' | 'logements';
  /** Année des données */
  year: number;
  /** Classes CSS additionnelles */
  className?: string;
}

/**
 * Bandeau d'avertissement sur la qualité des données
 */
export default function DataQualityBanner({ 
  dataset, 
  year, 
  className = '' 
}: DataQualityBannerProps) {
  const warning = useMemo(() => {
    return DATA_WARNINGS[dataset]?.[year] || null;
  }, [dataset, year]);

  // Pas de warning = pas de bandeau
  if (!warning) return null;

  const isError = warning.severity === 'error';

  return (
    <div
      className={`
        rounded-lg p-4 mb-4 flex items-start gap-3
        ${isError 
          ? 'bg-red-500/10 border border-red-500/30' 
          : 'bg-amber-500/10 border border-amber-500/30'
        }
        ${className}
      `}
      role="alert"
    >
      {/* Icône */}
      <span className="text-lg flex-shrink-0">
        {isError ? '✕' : '⚠'}
      </span>
      
      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isError ? 'text-red-400' : 'text-amber-400'}`}>
          {warning.message}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Les visualisations peuvent être incomplètes pour cette période.
        </p>
      </div>
    </div>
  );
}

/**
 * Hook pour vérifier si des données sont disponibles pour une année
 */
export function useDataAvailability(dataset: string, year: number): {
  isAvailable: boolean;
  warning: { severity: 'error' | 'warning'; message: string } | null;
} {
  const warning = DATA_WARNINGS[dataset]?.[year] || null;
  return {
    isAvailable: !warning || warning.severity !== 'error',
    warning,
  };
}

/**
 * Liste des années avec données complètes pour un dataset
 */
export function getCompleteYears(dataset: string, availableYears: number[]): number[] {
  const warnings = DATA_WARNINGS[dataset] || {};
  return availableYears.filter(year => {
    const warning = warnings[year];
    return !warning || warning.severity !== 'error';
  });
}
