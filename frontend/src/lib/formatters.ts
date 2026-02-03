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

export interface BudgetData {
  year: number;
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
  byEntity: { name: string; value: number }[];
}

export interface BudgetIndex {
  availableYears: number[];
  latestYear: number;
  summary: {
    year: number;
    recettes: number;
    depenses: number;
    solde: number;
  }[];
}
