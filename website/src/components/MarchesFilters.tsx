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
  { min: 0, max: 0, labelKey: 'marches.all_amounts' },
  { min: 0, max: 100000, labelKey: 'marches.amount_lt_100k' },
  { min: 100000, max: 1000000, labelKey: 'marches.amount_100k_1m' },
  { min: 1000000, max: 10000000, labelKey: 'marches.amount_1m_10m' },
  { min: 10000000, max: 100000000, labelKey: 'marches.amount_10m_100m' },
  { min: 100000000, max: 0, labelKey: 'marches.amount_gt_100m' },
];

/**
 * Labels pour les natures de marché
 */
export const NATURE_LABELS: Record<string, string> = {
  'SERVICES': 'marches.nature.services',
  'TRAVAUX': 'marches.nature.travaux',
  'FOURNITURE': 'marches.nature.fournitures',
};
