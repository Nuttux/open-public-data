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
 * - votedYears: ensemble des années avec budget voté (prévisionnel)
 * - startYear / endYear: bornes actuelles
 * - onStartYearChange / onEndYearChange: callbacks
 *
 * Contraintes:
 * - startYear < endYear (le composant filtre les options en conséquence)
 * - Les années avec budget voté sont annotées d'un astérisque dans le dropdown
 */

interface YearRangeSelectorProps {
  /** Années disponibles dans les données (ordre quelconque) */
  availableYears: number[];
  /** Années avec budget voté (prévisionnel) — annotées d'un astérisque */
  votedYears?: Set<number>;
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
  votedYears,
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

  /** Formatage de l'année avec astérisque si budget voté */
  const formatYear = (y: number) => votedYears?.has(y) ? `${y} *` : `${y}`;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
      {/* Label */}
      <span className="text-xs text-slate-500 whitespace-nowrap">Période :</span>

      {/* Dual selectors — même boîte bordée que les autres contrôles */}
      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
        {/* Start year */}
        <select
          value={startYear}
          onChange={(e) => onStartYearChange(parseInt(e.target.value, 10))}
          className="bg-transparent px-3 py-1.5 text-slate-100 text-sm font-medium focus:outline-none cursor-pointer"
          aria-label="Année de début"
        >
          {startOptions.map(y => (
            <option key={y} value={y} className="bg-slate-800">{formatYear(y)}</option>
          ))}
        </select>

        {/* Arrow separator */}
        <span className="text-slate-500 text-sm font-medium select-none px-1">→</span>

        {/* End year */}
        <select
          value={endYear}
          onChange={(e) => onEndYearChange(parseInt(e.target.value, 10))}
          className="bg-transparent px-3 py-1.5 text-slate-100 text-sm font-medium focus:outline-none cursor-pointer"
          aria-label="Année de fin"
        >
          {endOptions.map(y => (
            <option key={y} value={y} className="bg-slate-800">{formatYear(y)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
