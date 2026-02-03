'use client';

/**
 * Composant EntitySelector - Sélecteur d'entité budgétaire
 * Permet de filtrer entre Budget Total, Mairie Centrale, et Arrondissements
 */

export type BudgetEntity = 'total' | 'centrale' | 'arrondissements';

interface EntitySelectorProps {
  selectedEntity: BudgetEntity;
  onEntityChange: (entity: BudgetEntity) => void;
}

const ENTITIES: { value: BudgetEntity; label: string; icon: string; available: boolean }[] = [
  { value: 'total', label: 'Budget Total', icon: '🏛️', available: true },
  { value: 'centrale', label: 'Mairie Centrale', icon: '🏢', available: true },
  { value: 'arrondissements', label: 'Arrondissements', icon: '🗺️', available: false },
];

export default function EntitySelector({ selectedEntity, onEntityChange }: EntitySelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-400 mr-1">Périmètre :</span>
      <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
        {ENTITIES.map((entity) => (
          <button
            key={entity.value}
            onClick={() => entity.available && onEntityChange(entity.value)}
            disabled={!entity.available}
            className={`
              relative px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
              ${selectedEntity === entity.value
                ? 'bg-blue-600 text-white shadow-lg'
                : entity.available
                  ? 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                  : 'text-slate-500 cursor-not-allowed'
              }
            `}
            title={!entity.available ? 'Données à venir' : entity.label}
          >
            <span className="flex items-center gap-1.5">
              <span>{entity.icon}</span>
              <span className="hidden sm:inline">{entity.label}</span>
              {!entity.available && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">
                  ⏳
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
