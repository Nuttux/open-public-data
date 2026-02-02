/**
 * Color definitions for budget categories
 * Shared between Sankey and Drilldown components
 */

// Couleurs par groupe de recettes
export const REVENUE_COLORS: Record<string, string> = {
  'Impôts & Taxes': '#10b981',           // Emerald
  'Services Publics': '#0ea5e9',         // Sky
  'Dotations & Subventions': '#06b6d4',  // Cyan
  'Emprunts': '#f59e0b',                 // Amber
  'Investissement': '#8b5cf6',           // Violet
  'Autres': '#64748b',                   // Slate
};

// Couleurs par catégorie de dépenses
export const EXPENSE_COLORS: Record<string, string> = {
  'Action Sociale': '#ec4899',           // Pink
  'Personnel & Admin': '#3b82f6',        // Blue
  'Éducation': '#8b5cf6',                // Violet
  'Culture & Sport': '#f59e0b',          // Amber
  'Sécurité': '#ef4444',                 // Red
  'Aménagement & Logement': '#06b6d4',   // Cyan
  'Transports': '#84cc16',               // Lime
  'Environnement': '#22c55e',            // Green
  'Économie': '#f97316',                 // Orange
  'Dette': '#fbbf24',                    // Yellow
  'Autres': '#64748b',                   // Slate
};

/**
 * Get color for a category
 */
export function getCategoryColor(name: string, category: 'revenue' | 'expense'): string {
  if (category === 'revenue') {
    return REVENUE_COLORS[name] || '#64748b';
  }
  return EXPENSE_COLORS[name] || '#64748b';
}

/**
 * Lighten a hex color for hover states
 */
export function lightenColor(hex: string, percent: number = 20): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}
