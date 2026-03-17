'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useT, useLocale } from '@/lib/localeContext';
import { loadBenchmarking } from '@/lib/api/villesData';
import type { BenchmarkingData, CityKPIs } from '@/lib/types/villes';
import { CITIES } from '@/lib/constants/cities';
import { formatEuroCompact, formatNumber } from '@/lib/formatters';
import SourceLinks from '@/components/villes/SourceLinks';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// City coordinates (lat/lon)
// ---------------------------------------------------------------------------
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  paris:          { lat: 48.8566, lon: 2.3522 },
  marseille:      { lat: 43.2965, lon: 5.3698 },
  lyon:           { lat: 45.7640, lon: 4.8357 },
  toulouse:       { lat: 43.6047, lon: 1.4442 },
  nice:           { lat: 43.7102, lon: 7.2620 },
  nantes:         { lat: 47.2184, lon: -1.5536 },
  montpellier:    { lat: 43.6108, lon: 3.8767 },
  strasbourg:     { lat: 48.5734, lon: 7.7521 },
  bordeaux:       { lat: 44.8378, lon: -0.5792 },
  lille:          { lat: 50.6292, lon: 3.0573 },
  rennes:         { lat: 48.1173, lon: -1.6778 },
  reims:          { lat: 49.2583, lon: 3.5291 },
  'saint-etienne': { lat: 45.4397, lon: 4.3872 },
  toulon:         { lat: 43.1242, lon: 5.9280 },
  'le-havre':     { lat: 49.4944, lon: 0.1079 },
  grenoble:       { lat: 45.1885, lon: 5.7245 },
  dijon:          { lat: 47.3220, lon: 5.0415 },
  angers:         { lat: 47.4784, lon: -0.5632 },
  nimes:          { lat: 43.8367, lon: 4.3601 },
  villeurbanne:   { lat: 45.7667, lon: 4.8799 },
};

// ---------------------------------------------------------------------------
// Projection: lat/lon -> SVG coords
// France roughly: lat 42-51, lon -5 to 9
// ---------------------------------------------------------------------------
const SVG_W = 500;
const SVG_H = 450;

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 5) / 14) * SVG_W;
  const y = ((51 - lat) / 9) * SVG_H;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Simplified France outline (SVG path)
// ---------------------------------------------------------------------------
const FRANCE_PATH = [
  // Northern coast (Dunkerque -> Normandy)
  'M 285,30', 'L 310,28', 'L 325,35', 'L 300,55',
  // Brittany
  'L 240,60', 'L 180,70', 'L 130,75', 'L 80,100', 'L 50,105',
  'L 30,120', 'L 20,140', 'L 35,155',
  // Atlantic coast
  'L 60,150', 'L 75,165', 'L 70,185', 'L 55,200',
  'L 50,230', 'L 60,260', 'L 55,280', 'L 50,300',
  // Southwest (Bayonne -> Pyrenees)
  'L 65,330', 'L 80,350', 'L 95,370', 'L 120,385',
  // Pyrenees
  'L 150,395', 'L 180,400', 'L 210,390',
  // Mediterranean coast
  'L 250,385', 'L 280,370', 'L 310,380', 'L 340,375',
  // Cote d'Azur
  'L 370,365', 'L 400,355', 'L 430,340', 'L 445,310',
  // Southeast -> Alps
  'L 440,280', 'L 450,250', 'L 440,220',
  // East border (Alps -> Jura -> Vosges)
  'L 430,190', 'L 420,160', 'L 400,130', 'L 390,110',
  // Northeast (Alsace -> Ardennes)
  'L 410,80', 'L 420,55', 'L 400,40', 'L 380,35',
  // North border
  'L 350,30', 'L 325,25', 'L 285,30',
  'Z',
].join(' ');

// Corsica (small)
const CORSICA_PATH = [
  'M 430,360', 'L 440,355', 'L 445,370', 'L 450,395',
  'L 445,410', 'L 435,415', 'L 430,400', 'L 425,380',
  'L 430,360', 'Z',
].join(' ');

// ---------------------------------------------------------------------------
// Metric config
// ---------------------------------------------------------------------------
interface MetricDef {
  key: keyof CityKPIs;
  labelKey: string;
  suffix: string;
  isPercent?: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'recettes_par_hab', labelKey: 'villes.recettes_par_hab', suffix: ' \u20AC' },
  { key: 'depenses_par_hab', labelKey: 'villes.depenses_par_hab', suffix: ' \u20AC' },
  { key: 'dette_par_hab', labelKey: 'villes.dette_par_hab', suffix: ' \u20AC' },
  { key: 'investissement_par_hab', labelKey: 'villes.invest_par_hab', suffix: ' \u20AC' },
  { key: 'taux_epargne_brute', labelKey: 'villes.taux_epargne', suffix: ' %', isPercent: true },
];

// ---------------------------------------------------------------------------
// Color scale: interpolate green -> amber -> red
// ---------------------------------------------------------------------------
function interpolateColor(t: number): string {
  // t: 0 (min/green) -> 0.5 (amber) -> 1 (max/red)
  const clamped = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (clamped < 0.5) {
    const s = clamped * 2; // 0..1
    r = Math.round(16 + (245 - 16) * s);
    g = Math.round(185 + (158 - 185) * s);
    b = Math.round(129 + (11 - 129) * s);
  } else {
    const s = (clamped - 0.5) * 2; // 0..1
    r = Math.round(245 + (239 - 245) * s);
    g = Math.round(158 + (68 - 158) * s);
    b = Math.round(11 + (68 - 11) * s);
  }
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CartePage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();

  const [data, setData] = useState<BenchmarkingData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<keyof CityKPIs>('recettes_par_hab');
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBenchmarking()
      .then((d) => {
        setData(d);
        if (d.latest_year) setSelectedYear(d.latest_year);
      })
      .catch(() => setError(t('villes.erreur_chargement')));
  }, [t]);

  // Get KPIs for selected year
  const getCityKPIs = useCallback(
    (slug: string): CityKPIs | null => {
      if (!data || !selectedYear) return null;
      const city = data.cities.find((c) => c.slug === slug);
      if (!city) return null;
      return city.years[String(selectedYear)] ?? null;
    },
    [data, selectedYear],
  );

  // Compute min/max for color scale
  const { metricMin, metricMax } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const city of CITIES) {
      const kpis = getCityKPIs(city.slug);
      if (!kpis) continue;
      const val = kpis[selectedMetric];
      if (val == null) continue;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    if (!isFinite(min)) return { metricMin: 0, metricMax: 1 };
    return { metricMin: min, metricMax: max };
  }, [getCityKPIs, selectedMetric]);

  const metricDef = METRICS.find((m) => m.key === selectedMetric)!;

  // Format a metric value for display
  const formatMetricValue = useCallback(
    (val: number | null): string => {
      if (val == null) return '—';
      if (metricDef.isPercent) return `${val.toFixed(1)}${metricDef.suffix}`;
      return `${formatNumber(Math.round(val))}${metricDef.suffix}`;
    },
    [metricDef],
  );

  // Radius from population (sqrt scale, clamped)
  const radius = useCallback((population: number): number => {
    const minR = 8;
    const maxR = 28;
    const minPop = 140_000;
    const maxPop = 2_200_000;
    const t = Math.sqrt((population - minPop) / (maxPop - minPop));
    return minR + (maxR - minR) * Math.max(0, Math.min(1, t));
  }, []);

  // Color for a metric value
  const metricColor = useCallback(
    (val: number | null): string => {
      if (val == null) return '#475569';
      const range = metricMax - metricMin;
      if (range === 0) return interpolateColor(0.5);
      return interpolateColor((val - metricMin) / range);
    },
    [metricMin, metricMax],
  );

  // ── Error state ──
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64 rounded-xl bg-rose-900/10 border border-rose-500/20">
          <div className="text-center">
            <p className="text-rose-400 text-sm mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {t('villes.reessayer')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ──
  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-500">{t('villes.chargement')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href={`/${locale}/villes`} className="hover:text-teal-400 transition-colors">
          {t('nav.villes') || 'Villes'}
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200">{t('villes.carte.title')}</span>
      </nav>

      {/* Title */}
      <h1 className="text-2xl font-bold text-slate-100 mb-1">
        {t('villes.carte.title')}
      </h1>
      <p className="text-slate-400 text-sm mb-6">
        {t('villes.carte.subtitle')}
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Metric selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">
            {t('villes.carte.metrique')}
          </label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as keyof CityKPIs)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {t(m.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Year selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-medium">
            {t('villes.annee') || 'Année'}
          </label>
          <select
            value={selectedYear ?? ''}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {data.available_years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Map container */}
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-xl p-4 overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H + 10}`}
          className="w-full max-w-3xl mx-auto"
          style={{ aspectRatio: `${SVG_W} / ${SVG_H + 10}` }}
        >
          {/* France outline */}
          <path
            d={FRANCE_PATH}
            fill="#1e293b"
            stroke="#334155"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Corsica */}
          <path
            d={CORSICA_PATH}
            fill="#1e293b"
            stroke="#334155"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* City circles */}
          {CITIES.map((city) => {
            const coords = CITY_COORDS[city.slug];
            if (!coords) return null;
            const { x, y } = project(coords.lat, coords.lon);
            const kpis = getCityKPIs(city.slug);
            const val = kpis ? kpis[selectedMetric] : null;
            const r = radius(city.population);
            const fill = metricColor(val as number | null);
            const isHovered = hoveredCity === city.slug;

            return (
              <g key={city.slug}>
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={fill}
                  fillOpacity={isHovered ? 0.95 : 0.75}
                  stroke={isHovered ? '#e2e8f0' : '#475569'}
                  strokeWidth={isHovered ? 2 : 1}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={(e) => {
                    setHoveredCity(city.slug);
                    const svgRect = (e.target as SVGCircleElement).ownerSVGElement?.getBoundingClientRect();
                    if (svgRect) {
                      setTooltipPos({
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top,
                      });
                    }
                  }}
                  onMouseMove={(e) => {
                    const svgRect = (e.target as SVGCircleElement).ownerSVGElement?.getBoundingClientRect();
                    if (svgRect) {
                      setTooltipPos({
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top,
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredCity(null)}
                  onClick={() => router.push(`/${locale}/villes/${city.slug}`)}
                />
                {/* City label — show for larger cities or on hover */}
                {(r >= 14 || isHovered) && (
                  <text
                    x={x}
                    y={y - r - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isHovered ? '#e2e8f0' : '#94a3b8'}
                    className="pointer-events-none select-none"
                    fontWeight={isHovered ? 600 : 400}
                  >
                    {city.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredCity && (() => {
          const city = CITIES.find((c) => c.slug === hoveredCity);
          const kpis = city ? getCityKPIs(city.slug) : null;
          const val = kpis ? kpis[selectedMetric] : null;
          if (!city) return null;

          return (
            <div
              className="absolute z-10 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-lg"
              style={{
                left: tooltipPos.x + 12,
                top: tooltipPos.y - 10,
                transform: 'translateY(-100%)',
              }}
            >
              <p className="text-sm font-semibold text-slate-100">{city.name}</p>
              <p className="text-xs text-slate-400">
                Pop. {formatNumber(city.population)}
              </p>
              <p className="text-sm font-medium mt-1" style={{ color: metricColor(val as number | null) }}>
                {t(metricDef.labelKey)}: {formatMetricValue(val as number | null)}
              </p>
            </div>
          );
        })()}

        {/* Color legend */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="text-xs text-slate-400">
            {formatMetricValue(metricMin)}
          </span>
          <div className="flex h-3 rounded-full overflow-hidden" style={{ width: 200 }}>
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: interpolateColor(i / 39) }}
              />
            ))}
          </div>
          <span className="text-xs text-slate-400">
            {formatMetricValue(metricMax)}
          </span>
        </div>

        {/* Size legend */}
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="text-xs text-slate-500">{t('villes.population') || 'Population'}:</span>
          {[150_000, 500_000, 2_000_000].map((pop) => (
            <div key={pop} className="flex items-center gap-1.5">
              <svg width={radius(pop) * 2 + 2} height={radius(pop) * 2 + 2}>
                <circle
                  cx={radius(pop) + 1}
                  cy={radius(pop) + 1}
                  r={radius(pop)}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="1"
                />
              </svg>
              <span className="text-xs text-slate-500">
                {pop >= 1_000_000
                  ? `${(pop / 1_000_000).toFixed(0)}M`
                  : `${(pop / 1_000).toFixed(0)}k`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Source links */}
      <SourceLinks sources={['dgfip', 'ofgl']} />
    </div>
  );
}
