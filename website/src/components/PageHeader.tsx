'use client';

import { ReactNode } from 'react';

/**
 * PageHeader — En-tête partagé pour toutes les pages entité.
 *
 * Affiche : icône + titre + description + badges optionnels (coverage, type_budget, etc.)
 */

interface PageHeaderProps {
  /** Icône emoji ou composant */
  icon: string;
  /** Titre principal (ex: "Budget de la Ville") */
  title: string;
  /** Description courte sous le titre */
  description?: string;
  /** Éléments à droite du header (badges, sélecteurs...) */
  actions?: ReactNode;
  /** Badges informatifs sous la description */
  badges?: ReactNode;
}

export default function PageHeader({
  icon,
  title,
  description,
  actions,
  badges,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{icon}</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
        </div>
        {description && (
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">{description}</p>
        )}
        {badges && <div className="flex flex-wrap gap-2 mt-2">{badges}</div>}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
