"use client";

import Link from "next/link";
import { useState } from "react";

export type FranceCityPoint = {
  slug: string;
  nom: string;
  lat: number;
  lng: number;
  /** Numeric value used for sizing + ranking (eg. €/hab on chosen KPI). */
  value: number;
};

type Props = {
  cities: FranceCityPoint[];
  /** Slug of the focal city (highlighted). */
  focalSlug: string;
  /** Short label for the chosen KPI ("Encours de dette / hab", etc). */
  kpiLabel: string;
  /** Suffix appended to values (eg. "€/hab"). */
  unitSuffix: string;
  /** Locale for number formatting. */
  locale: string;
};

// Simplified metropolitan France outline, ~50 points, in lon/lat.
// Hand-curated from public-domain coastline data, kept loose to read as
// "the hexagon" without distracting from the city dots.
const FR_OUTLINE: Array<[number, number]> = [
  [2.55, 51.07],   // Dunkerque
  [1.65, 50.96],   // Calais
  [1.55, 50.12],   // Boulogne
  [0.18, 49.79],   // Le Tréport
  [-0.10, 49.36],  // Le Havre
  [-1.30, 49.32],  // Cherbourg
  [-1.85, 48.65],  // Saint-Malo / Mont-Saint-Michel
  [-2.95, 48.65],  // Saint-Brieuc
  [-4.78, 48.40],  // Brest
  [-4.32, 47.95],  // Pointe du Raz
  [-3.05, 47.65],  // Lorient
  [-2.32, 47.10],  // Saint-Nazaire
  [-1.55, 46.50],  // Sables d'Olonne
  [-1.18, 45.93],  // La Rochelle
  [-1.20, 44.65],  // Arcachon
  [-1.45, 43.65],  // Hendaye
  [-0.36, 42.85],  // Pyrénées
  [0.65, 42.69],   // Pyrénées centrales
  [1.85, 42.50],   // Pyrénées orientales
  [3.05, 42.46],   // Cap Béar
  [3.40, 42.85],   // Languedoc
  [4.85, 43.32],   // Camargue
  [5.20, 43.30],   // Marseille bay
  [6.50, 43.10],   // Var
  [7.55, 43.78],   // Menton
  [7.65, 44.20],   // Maritime Alps
  [7.05, 45.50],   // Mont Blanc area
  [6.85, 46.05],   // Haute-Savoie
  [6.40, 46.40],   // Léman west
  [6.95, 47.32],   // Jura north
  [7.55, 47.50],   // Bâle area
  [8.20, 48.95],   // Wissembourg
  [7.30, 49.15],   // Lorraine east
  [6.45, 49.45],   // Luxembourg border
  [5.85, 49.55],   // Sedan
  [4.85, 50.15],   // Charleville
  [4.20, 50.50],   // Maubeuge
  [3.30, 50.55],   // Tournai border
  [2.85, 50.85],   // Lille
  [2.55, 51.07],   // back to start
];

const PALETTE = ["#f0e3c9", "#d8b88a", "#b88856", "#6d4a1c", "#2b1a08"];

const fmtInt = (n: number, locale: string) =>
  Math.round(n).toLocaleString(locale === "en" ? "en-GB" : "fr-FR");

export default function FranceCitiesMap({
  cities,
  focalSlug,
  kpiLabel,
  unitSuffix,
  locale,
}: Props) {
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);

  // Bounding box covering metropolitan France
  const lonMin = -5.2;
  const lonMax = 8.4;
  const latMin = 42.3;
  const latMax = 51.2;

  // Aspect ratio: keep France-shaped (taller than wide visually due to projection)
  const W = 600;
  const H = 600;

  const project = (lat: number, lng: number): [number, number] => {
    const x = ((lng - lonMin) / (lonMax - lonMin)) * W;
    // SVG y goes top-down, lat goes bottom-up
    const y = H - ((lat - latMin) / (latMax - latMin)) * H;
    return [x, y];
  };

  const outlinePath = FR_OUTLINE.map((p, i) => {
    const [x, y] = project(p[1], p[0]);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z";

  // Quartile color buckets — based on values
  const sortedValues = cities.map((c) => c.value).sort((a, b) => a - b);
  const quartile = (v: number): number => {
    const n = sortedValues.length;
    if (n === 0) return 0;
    const rank = sortedValues.findIndex((x) => x >= v);
    const pct = rank / n;
    if (pct < 0.2) return 0;
    if (pct < 0.4) return 1;
    if (pct < 0.6) return 2;
    if (pct < 0.8) return 3;
    return 4;
  };

  // Dot size: range 8-22px radius based on relative value
  const maxValue = Math.max(...cities.map((c) => c.value), 1);
  const minValue = Math.min(...cities.map((c) => c.value));
  const radius = (v: number) => {
    if (maxValue === minValue) return 14;
    const t = (v - minValue) / (maxValue - minValue);
    return 8 + 14 * t;
  };

  // Sort cities by value desc for the side ranking
  const sortedCities = [...cities].sort((a, b) => b.value - a.value);

  // Compute hover/focal city for tooltip
  const tooltipSlug = hoverSlug ?? focalSlug;
  const tooltipCity = cities.find((c) => c.slug === tooltipSlug);

  return (
    <div className="fx-france-map">
      <div className="fx-france-map-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Carte de France avec les 10 plus grandes villes"
        >
          {/* France outline */}
          <path
            d={outlinePath}
            fill="#fafaf7"
            stroke="#0a0a0a"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          {/* City dots, smaller behind larger */}
          {sortedCities
            .slice()
            .reverse()
            .map((c) => {
              const [cx, cy] = project(c.lat, c.lng);
              const r = radius(c.value);
              const q = quartile(c.value);
              const isFocal = c.slug === focalSlug;
              const isHover = c.slug === hoverSlug;
              const fill = PALETTE[q];
              return (
                <g key={c.slug}>
                  <Link href={`/fr/city/${c.slug}`} aria-label={`${c.nom}: ${fmtInt(c.value, locale)} ${unitSuffix}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={fill}
                      stroke={isFocal ? "#1e45e4" : "#0a0a0a"}
                      strokeWidth={isFocal ? 3 : 1.2}
                      style={{ cursor: "pointer", transition: "stroke-width .15s, opacity .15s" }}
                      opacity={isHover || isFocal || hoverSlug === null ? 1 : 0.55}
                      onMouseEnter={() => setHoverSlug(c.slug)}
                      onMouseLeave={() => setHoverSlug(null)}
                      onFocus={() => setHoverSlug(c.slug)}
                      onBlur={() => setHoverSlug(null)}
                    />
                  </Link>
                  {/* Label for focal city always; for others on hover only */}
                  {(isFocal || isHover) && (
                    <text
                      x={cx}
                      y={cy - r - 6}
                      textAnchor="middle"
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        fill: "#0a0a0a",
                        pointerEvents: "none",
                      }}
                    >
                      {c.nom}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
      </div>

      <aside className="fx-france-map-side">
        <div className="fx-france-map-kpi-label">{kpiLabel}</div>
        {tooltipCity && (
          <div className="fx-france-map-focal">
            <p className="fx-france-map-focal-name">
              {tooltipCity.slug === focalSlug ? "■ " : ""}
              {tooltipCity.nom}
            </p>
            <p className="fx-france-map-focal-val tnum">
              {fmtInt(tooltipCity.value, locale)}{" "}
              <span className="fx-france-map-focal-unit">{unitSuffix}</span>
            </p>
          </div>
        )}
        <ol className="fx-france-map-rank">
          {sortedCities.map((c, i) => {
            const isFocal = c.slug === focalSlug;
            const q = quartile(c.value);
            return (
              <li
                key={c.slug}
                className={isFocal ? "is-focal" : ""}
                onMouseEnter={() => setHoverSlug(c.slug)}
                onMouseLeave={() => setHoverSlug(null)}
              >
                <span className="fx-france-map-rank-n">{i + 1}.</span>
                <Link href={`/fr/city/${c.slug}`} className="fx-france-map-rank-name">
                  <span
                    className="fx-france-map-rank-dot"
                    style={{ background: PALETTE[q] }}
                    aria-hidden="true"
                  />
                  {c.nom}
                </Link>
                <span className="fx-france-map-rank-val tnum">
                  {fmtInt(c.value, locale)}
                </span>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
