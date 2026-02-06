'use client';

/**
 * TabBar — Composant générique de navigation par onglets (segmented control).
 *
 * - Responsive : scroll horizontal sur mobile si > 4 tabs
 * - Sync avec l'URL via useTabState (côté parent)
 * - Design cohérent dark theme slate
 */

export interface Tab {
  /** Identifiant unique du tab (utilisé dans l'URL ?tab=xxx) */
  id: string;
  /** Label affiché */
  label: string;
  /** Icône optionnelle (emoji ou composant) */
  icon?: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  /** CSS class for the container */
  className?: string;
}

export default function TabBar({ tabs, activeTab, onChange, className = '' }: TabBarProps) {
  return (
    <div
      className={`flex gap-1 overflow-x-auto scrollbar-hide rounded-xl bg-slate-800/60 p-1 border border-slate-700/50 ${className}`}
      role="tablist"
      aria-label="Navigation par onglets"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium
              transition-all duration-200 shrink-0
              ${
                isActive
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
              }
            `}
          >
            {tab.icon && <span className="text-base">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
