'use client';

/**
 * Composant GeoProgress - Indicateur de progression de géolocalisation
 * 
 * Affiche la progression lors de l'enrichissement des données
 * avec les coordonnées GPS via l'API entreprises.
 */

interface GeoProgressProps {
  current: number;
  total: number;
  found: number;
  isActive: boolean;
}

export default function GeoProgress({ current, total, found, isActive }: GeoProgressProps) {
  if (!isActive) return null;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const successRate = current > 0 ? Math.round((found / current) * 100) : 0;

  return (
    <div className="bg-slate-800/80 backdrop-blur rounded-lg p-4 border border-purple-500/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-200">
            Géolocalisation en cours...
          </span>
        </div>
        <span className="text-sm text-slate-400">
          {percentage}%
        </span>
      </div>

      {/* Barre de progression */}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          {current} / {total} SIRET traités
        </span>
        <span className="text-emerald-400">
          {found} trouvés ({successRate}%)
        </span>
      </div>
    </div>
  );
}
