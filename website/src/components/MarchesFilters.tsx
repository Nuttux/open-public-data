'use client';

/**
 * MarchesFilters - Types et defaults pour les filtres marchés publics
 */

/**
 * État des filtres
 */
export interface MarchesFilters {
  search: string;
  natures: string[];
  categories: string[];
  montantMin: number;
  montantMax: number;
}

/**
 * Filtres par défaut
 */
export const DEFAULT_MARCHES_FILTERS: MarchesFilters = {
  search: '',
  natures: [],
  categories: [],
  montantMin: 0,
  montantMax: 0,
};

/**
 * Plages de montants prédéfinies (enveloppes, pas dépenses)
 */
export const MONTANT_RANGES = [
  { min: 0, max: 0, label: 'Toutes les enveloppes' },
  { min: 0, max: 100000, label: 'Moins de 100 k€' },
  { min: 100000, max: 1000000, label: '100 k€ à 1 M€' },
  { min: 1000000, max: 10000000, label: '1 M€ à 10 M€' },
  { min: 10000000, max: 100000000, label: '10 M€ à 100 M€' },
  { min: 100000000, max: 0, label: 'Plus de 100 M€' },
];

/**
 * Labels pour les natures de marché
 */
export const NATURE_LABELS: Record<string, string> = {
  'SERVICES': 'Services',
  'TRAVAUX': 'Travaux',
  'FOURNITURE': 'Fournitures',
};
