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
import { useT } from '@/lib/localeContext';

/** Configuration visuelle pour chaque type de budget (classes only, labels come from i18n) */
const BADGE_CLASSES: Record<BudgetType, string> = {
  execute: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  vote: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  estime: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

interface BudgetTypeBadgeProps {
  type: BudgetType;
  /** Compact mode: smaller font/padding for inline use next to amounts */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export default function BudgetTypeBadge({ type, compact = false, className = '' }: BudgetTypeBadgeProps) {
  const t = useT();

  const labels: Record<BudgetType, string> = {
    execute: t('budget.type.real'),
    vote: t('budget.type.forecast'),
    estime: t('budget.type.estimated'),
  };

  const tooltips: Record<BudgetType, string> = {
    execute: t('budget.type.real_desc'),
    vote: t('budget.type.forecast_desc'),
    estime: t('budget.type.estimated_desc'),
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}
        ${BADGE_CLASSES[type]}
        ${className}
      `}
      title={tooltips[type]}
    >
      {labels[type]}
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
