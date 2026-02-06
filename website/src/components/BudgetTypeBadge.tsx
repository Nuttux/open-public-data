'use client';

/**
 * BudgetTypeBadge — Badge indiquant le type de budget (Exécuté / Voté / Estimé).
 *
 * Règle UX :
 * - 2019-2024 (Exécuté) : pas de badge nécessaire (défaut)
 * - 2025-2026 (Voté) : badge orange OBLIGATOIRE
 * - Estimations : badge gris avec tooltip explicatif
 */

import type { BudgetType } from '@/lib/formatters';

/** Configuration visuelle pour chaque type de budget */
const BADGE_CONFIG: Record<BudgetType, {
  label: string;
  classes: string;
  tooltip: string;
}> = {
  execute: {
    label: 'Exécuté',
    classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    tooltip: 'Budget réellement dépensé (Compte Administratif)',
  },
  vote: {
    label: 'Voté',
    classes: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    tooltip: 'Budget prévisionnel voté par le Conseil de Paris (Budget Primitif)',
  },
  estime: {
    label: 'Estimé',
    classes: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    tooltip: "Estimation basée sur le taux d'exécution historique moyen",
  },
};

interface BudgetTypeBadgeProps {
  type: BudgetType;
  /** Compact mode: smaller font/padding for inline use next to amounts */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export default function BudgetTypeBadge({ type, compact = false, className = '' }: BudgetTypeBadgeProps) {
  const config = BADGE_CONFIG[type];

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}
        ${config.classes}
        ${className}
      `}
      title={config.tooltip}
    >
      {config.label}
    </span>
  );
}

/**
 * Helper to determine if a badge should be shown for a given year.
 * Returns the BudgetType if badge needed, null if not (execute = no badge needed).
 */
export function getBudgetTypeForYear(
  year: number,
  yearTypes?: Record<string, BudgetType>
): BudgetType | null {
  if (!yearTypes) {
    // Fallback: assume years >= 2025 are voted
    return year >= 2025 ? 'vote' : null;
  }
  const type = yearTypes[String(year)];
  // Don't show badge for 'execute' — it's the default
  return type === 'execute' ? null : type ?? null;
}
