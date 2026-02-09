'use client';

/**
 * YearRangeSelector — Sélecteur de plage d'années (début / fin).
 *
 * Utilisé dans les onglets "Tendances" pour permettre à l'utilisateur
 * de choisir la période d'analyse. Toutes les métriques, charts et
 * variations se recalculent dynamiquement en fonction de la plage choisie.
 *
 * Props:
 * - availableYears: années disponibles dans les données (triées)
 * - startYear / endYear: bornes actuelles
 * - onStartYearChange / onEndYearChange: callbacks
 *
 * Contraintes:
 * - startYear < endYear (le composant filtre les options en conséquence)
 */

interface YearRangeSelectorProps {
  /** Années disponibles dans les données (ordre quelconque) */
  availableYears: number[];
  /** Année de début de la plage */
  startYear: number;
  /** Année de fin de la plage */
  endYear: number;
  /** Callback quand l'année de début change */
  onStartYearChange: (year: number) => void;
  /** Callback quand l'année de fin change */
  onEndYearChange: (year: number) => void;
}

export default function YearRangeSelector({
  availableYears,
  startYear,
  endYear,
  onStartYearChange,
  onEndYearChange,
}: YearRangeSelectorProps) {
  /** Années triées croissantes */
  const sortedYears = [...availableYears].sort((a, b) => a - b);

  /** Options valides pour le début : toutes sauf la dernière (doit être < endYear) */
  const startOptions = sortedYears.filter(y => y < endYear);

  /** Options valides pour la fin : toutes sauf la première (doit être > startYear) */
  const endOptions = sortedYears.filter(y => y > startYear);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
      {/* Label */}
      <span className="text-sm text-slate-400 whitespace-nowrap">Période :</span>

      {/* Dual selectors */}
      <div className="flex items-center gap-2">
        {/* Start year */}
        <select
          value={startYear}
          onChange={(e) => onStartYearChange(parseInt(e.target.value, 10))}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
          aria-label="Année de début"
        >
          {startOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Arrow separator */}
        <span className="text-slate-500 text-sm font-medium select-none">→</span>

        {/* End year */}
        <select
          value={endYear}
          onChange={(e) => onEndYearChange(parseInt(e.target.value, 10))}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
          aria-label="Année de fin"
        >
          {endOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
