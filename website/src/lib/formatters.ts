/**
 * Utilitaires de formatage pour l'affichage des données budgétaires
 * Tous les montants sont en Euros et affichés en format français
 */

/**
 * Formate un montant en Euros avec séparateurs français
 * @param value - Montant en euros
 * @param decimals - Nombre de décimales (défaut: 0)
 * @returns Chaîne formatée (ex: "1 234 567 €")
 */
export function formatEuro(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formate un montant en milliards d'euros pour une lecture simplifiée
 * @param value - Montant en euros
 * @returns Chaîne formatée (ex: "11,5 Md€")
 */
export function formatEuroCompact(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1).replace('.', ',')} Md€`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1).replace('.', ',')} M€`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(0)} k€`;
  }
  return `${sign}${absValue.toFixed(0)} €`;
}

/**
 * Formate un pourcentage
 * @param value - Valeur décimale (ex: 0.15 pour 15%)
 * @returns Chaîne formatée (ex: "15,0 %")
 */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formate un nombre avec séparateurs français
 * @param value - Nombre à formater
 * @param decimals - Nombre de décimales (défaut: 0)
 * @returns Chaîne formatée (ex: "1 234 567")
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formate un nombre de manière compacte (K, M, Md)
 * @param value - Nombre à formater
 * @returns Chaîne formatée (ex: "1,2 M")
 */
export function formatNumberCompact(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1).replace('.', ',')} Md`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(1).replace('.', ',')} k`;
  }
  return `${sign}${absValue.toFixed(0)}`;
}

/**
 * Calcule le pourcentage d'un montant par rapport à un total
 * @param part - Montant partiel
 * @param total - Montant total
 * @returns Pourcentage (ex: 0.15 pour 15%)
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return part / total;
}

/**
 * Types pour les données du Sankey
 */
export interface SankeyNode {
  name: string;
  category: 'revenue' | 'central' | 'expense';
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface DrilldownItem {
  name: string;
  value: number;
}

/**
 * Structure for section breakdown (Fonctionnement vs Investissement)
 * within an expense group
 */
export interface SectionData {
  total: number;
  items: DrilldownItem[];
}

/**
 * Section breakdown for an expense group
 */
export interface SectionBreakdown {
  Fonctionnement?: SectionData;
  Investissement?: SectionData;
}

/**
 * Data availability status
 * - COMPLET: All data sources available (budget + subventions + AP/CP + arrondissements)
 * - PARTIEL: Some sources missing (usually AP/CP or arrondissements for recent years)
 * - BUDGET_SEUL: Only main budget available
 */
export type DataStatus = 'COMPLET' | 'PARTIEL' | 'BUDGET_SEUL' | 'BUDGET_VOTE' | 'INCONNU';

/**
 * Data availability details per source
 */
export interface DataAvailability {
  budget: boolean;
  subventions: boolean;
  autorisations: boolean;
  arrondissements: boolean;
}

/** Budget type: executed (CA) or voted (BP) */
export type BudgetType = 'execute' | 'vote' | 'estime';

export interface BudgetData {
  year: number;
  /** Whether this is executed budget (CA) or voted budget (BP) */
  type_budget?: BudgetType;
  /** Disclaimer for non-executed budget years */
  disclaimer?: string;
  /** Data completeness status */
  dataStatus?: DataStatus;
  /** Detailed availability per source */
  dataAvailability?: DataAvailability;
  totals: {
    recettes: number;
    depenses: number;
    solde: number;
  };
  nodes: SankeyNode[];
  links: SankeyLink[];
  drilldown: {
    revenue: Record<string, DrilldownItem[]>;
    expenses: Record<string, DrilldownItem[]>;
  };
  /** Section breakdown (Fonct/Invest) per expense group */
  bySection?: Record<string, SectionBreakdown>;
  byEntity: { name: string; value: number }[];
}

export interface BudgetIndexSummary {
  year: number;
  dataStatus?: DataStatus;
  recettes: number;
  depenses: number;
  solde: number;
}

export interface BudgetIndex {
  availableYears: number[];
  latestYear: number;
  /** Latest year with complete data */
  latestCompleteYear?: number;
  /** Years with complete data */
  completeYears?: number[];
  /** Years with partial data */
  partialYears?: number[];
  /** Years with voted (non-executed) budget only */
  votedYears?: number[];
  /** Map of year → 'execute' | 'vote' */
  year_types?: Record<string, BudgetType>;
  /** COVID-affected years (for exclusion in comparisons) */
  covid_years?: number[];
  summary: BudgetIndexSummary[];
}
