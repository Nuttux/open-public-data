'use client';

import { useMemo } from 'react';

/**
 * YearRangeSelector — Multi-select pour choisir des années de comparaison.
 *
 * Features :
 * - Boutons toggle par année
 * - Preset "Hors COVID" (exclut 2020-2021)
 * - Preset "Toutes"
 * - Indicateur visuel pour années votées vs exécutées
 */

interface YearRangeSelectorProps {
  /** Toutes les années disponibles */
  availableYears: number[];
  /** Années actuellement sélectionnées */
  selectedYears: number[];
  /** Callback quand la sélection change */
  onChange: (years: number[]) => void;
  /** Années COVID à marquer visuellement (défaut: [2020, 2021]) */
  covidYears?: number[];
  /** Années votées (non-exécutées) pour marquage visuel */
  votedYears?: number[];
  /** Libellé optionnel */
  label?: string;
}

export default function YearRangeSelector({
  availableYears,
  selectedYears,
  onChange,
  covidYears = [2020, 2021],
  votedYears = [],
  label = 'Années :',
}: YearRangeSelectorProps) {
  /** Sorted years descending (most recent first) */
  const sortedYears = useMemo(
    () => [...availableYears].sort((a, b) => b - a),
    [availableYears]
  );

  /** Years excluding COVID */
  const horsCovidYears = useMemo(
    () => sortedYears.filter((y) => !covidYears.includes(y)),
    [sortedYears, covidYears]
  );

  /** Only executed years (no COVID, no voted) */
  const executeOnlyYears = useMemo(
    () => horsCovidYears.filter((y) => !votedYears.includes(y)),
    [horsCovidYears, votedYears]
  );

  /** Toggle a single year */
  const toggleYear = (year: number) => {
    if (selectedYears.includes(year)) {
      // Don't allow deselecting if only 1 year left
      if (selectedYears.length > 1) {
        onChange(selectedYears.filter((y) => y !== year));
      }
    } else {
      onChange([...selectedYears, year].sort((a, b) => a - b));
    }
  };

  /** Check if current selection matches a preset */
  const isAllSelected =
    selectedYears.length === sortedYears.length;
  const isHorsCovidSelected =
    selectedYears.length === horsCovidYears.length &&
    horsCovidYears.every((y) => selectedYears.includes(y));
  const isExecuteOnlySelected =
    selectedYears.length === executeOnlyYears.length &&
    executeOnlyYears.every((y) => selectedYears.includes(y));

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-medium text-slate-400">{label}</span>
      )}

      {/* Presets */}
      <div className="flex gap-1.5 flex-wrap">
        <PresetButton
          label="Toutes"
          active={isAllSelected}
          onClick={() => onChange([...sortedYears])}
        />
        <PresetButton
          label="Hors COVID"
          active={isHorsCovidSelected}
          onClick={() => onChange([...horsCovidYears])}
        />
        {votedYears.length > 0 && (
          <PresetButton
            label="Exécuté seul"
            active={isExecuteOnlySelected}
            onClick={() => onChange([...executeOnlyYears])}
          />
        )}
      </div>

      {/* Individual year toggles */}
      <div className="flex gap-1 flex-wrap">
        {sortedYears.map((year) => {
          const isSelected = selectedYears.includes(year);
          const isCovid = covidYears.includes(year);
          const isVoted = votedYears.includes(year);

          return (
            <button
              key={year}
              onClick={() => toggleYear(year)}
              className={`
                relative px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150
                ${
                  isSelected
                    ? 'bg-slate-600 text-white ring-1 ring-slate-500'
                    : 'bg-slate-800/60 text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
                }
                ${isCovid && isSelected ? 'ring-amber-500/50' : ''}
              `}
              title={
                isCovid
                  ? `${year} — Année COVID`
                  : isVoted
                    ? `${year} — Budget voté (prévisionnel)`
                    : `${year}`
              }
            >
              {year}
              {/* COVID dot indicator */}
              {isCovid && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
              {/* Voted dot indicator */}
              {isVoted && !isCovid && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Preset button for quick selection */
function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 border
        ${
          active
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
            : 'bg-transparent text-slate-500 border-slate-700/50 hover:text-slate-300 hover:border-slate-600'
        }
      `}
    >
      {label}
    </button>
  );
}
