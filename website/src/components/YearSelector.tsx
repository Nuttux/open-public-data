'use client';

/**
 * YearSelector — Sélecteur d'année pour le dashboard.
 *
 * Design : select bordé (bg-slate-800 border-slate-700) cohérent avec
 * les autres contrôles (TabBar, toggles). Flèches de navigation
 * intégrées dans la même boîte bordée.
 */

interface YearSelectorProps {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}

export default function YearSelector({ years, selectedYear, onYearChange }: YearSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="year-select" className="text-xs text-slate-500 hidden sm:inline">
        Année :
      </label>
      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
        <select
          id="year-select"
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="bg-transparent px-3 py-1.5 text-slate-100 text-sm font-medium focus:outline-none cursor-pointer appearance-none"
          style={{ backgroundImage: 'none' }}
        >
          {years.map((year) => (
            <option key={year} value={year} className="bg-slate-800">
              {year}
            </option>
          ))}
        </select>
        {/* Chevron dropdown hint */}
        <svg className="w-3.5 h-3.5 text-slate-500 mr-1 pointer-events-none -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Navigation arrows */}
      <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
        <button
          onClick={() => {
            const idx = years.indexOf(selectedYear);
            if (idx < years.length - 1) onYearChange(years[idx + 1]);
          }}
          disabled={years.indexOf(selectedYear) === years.length - 1}
          className="p-1.5 rounded-md hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Année précédente"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => {
            const idx = years.indexOf(selectedYear);
            if (idx > 0) onYearChange(years[idx - 1]);
          }}
          disabled={years.indexOf(selectedYear) === 0}
          className="p-1.5 rounded-md hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Année suivante"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
