'use client';

/**
 * Composant YearSelector - Sélecteur d'année pour le dashboard (dark theme)
 */

interface YearSelectorProps {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}

export default function YearSelector({ years, selectedYear, onYearChange }: YearSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="year-select" className="text-sm font-medium text-slate-400">
        Année :
      </label>
      <select
        id="year-select"
        value={selectedYear}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="block w-28 rounded-lg bg-slate-800 border-slate-600 px-3 py-2 text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      
      {/* Navigation arrows */}
      <div className="flex gap-1">
        <button
          onClick={() => {
            const idx = years.indexOf(selectedYear);
            if (idx < years.length - 1) onYearChange(years[idx + 1]);
          }}
          disabled={years.indexOf(selectedYear) === years.length - 1}
          className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
          className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
