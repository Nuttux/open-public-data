import type { ReactNode } from "react";

export type BlogTimeBarsItem = {
  year: number;
  /** null = donnée manquante (rendue grisée avec "n/a") */
  value: number | null;
};

type Props = {
  data: BlogTimeBarsItem[];
  /** Unité affichée à côté de la valeur max sur l'axe Y, ex. "M€" */
  unit?: string;
  /** Titre affiché en haut du SVG */
  title?: string;
  /** Légende en bas (figcaption) */
  caption?: ReactNode;
  /** Source affichée en pied de figure (au format "Source : X · Lien"). */
  source?: ReactNode;
  /** Met en valeur la dernière barre (typiquement l'année courante) */
  highlightLast?: boolean;
  /** Override min de l'échelle Y (par défaut : 0) */
  yMin?: number;
  /** Override max de l'échelle Y (par défaut : auto avec padding 10 %) */
  yMax?: number;
  /** Couleur principale des barres (par défaut bleu fusion) */
  color?: string;
};

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/**
 * Bar chart vertical par année, data-driven, pour articles MDX du blog.
 * Remplace les SVG inline hardcodés. Compatible server component.
 */
export default function BlogTimeBars({
  data,
  unit = "",
  title,
  caption,
  source,
  highlightLast = true,
  yMin,
  yMax,
  color = "#1e45e4",
}: Props) {
  // Layout
  const W = 720;
  const H = 320;
  const M = { top: title ? 50 : 30, right: 20, bottom: 50, left: 80 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const present = data.filter((d): d is BlogTimeBarsItem & { value: number } => d.value !== null);
  const dataMin = present.length ? Math.min(...present.map((d) => d.value)) : 0;
  const dataMax = present.length ? Math.max(...present.map((d) => d.value)) : 1;

  const min = yMin ?? 0;
  // Padding 10 % au-dessus du max pour laisser respirer le label
  const max = yMax ?? dataMax + (dataMax - Math.min(dataMin, min)) * 0.12;
  const span = max - min || 1;

  const slotW = innerW / data.length;
  const barW = Math.min(slotW * 0.6, 60);

  // 4 graduations Y
  const gridY = 4;
  const ticks = Array.from({ length: gridY + 1 }, (_, i) => min + (span * i) / gridY);

  return (
    <figure className="fx-chart">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" className="fx-svg" role="img" aria-label={title ?? "Graphique"}>
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />

        {title && (
          <text
            x={W / 2}
            y={20}
            fontFamily="Inter Tight, sans-serif"
            fontSize="13"
            fill="#0a0a0a"
            textAnchor="middle"
            fontWeight="600"
          >
            {title}
          </text>
        )}

        {/* Axes */}
        <line x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} stroke="#0a0a0a" strokeWidth="1" />
        <line x1={M.left} y1={H - M.bottom} x2={W - M.right} y2={H - M.bottom} stroke="#0a0a0a" strokeWidth="1" />

        {/* Grid + Y labels */}
        {ticks.map((t, i) => {
          const y = H - M.bottom - (innerH * i) / gridY;
          const isLast = i === gridY;
          return (
            <g key={`tick-${i}`}>
              {i > 0 && <line x1={M.left} y1={y} x2={W - M.right} y2={y} stroke="#e4e6ea" strokeWidth="1" />}
              <text
                x={M.left - 10}
                y={y + 4}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill="#5f6672"
                textAnchor="end"
              >
                {fmt.format(t)}{isLast && unit ? ` ${unit}` : ""}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = M.left + slotW * i + slotW / 2;
          const x = cx - barW / 2;
          const isLast = i === data.length - 1;
          const fill = d.value === null ? "#e4e6ea" : highlightLast && isLast ? "#a67638" : color;
          if (d.value === null) {
            return (
              <g key={`bar-${i}`}>
                <rect x={x} y={H - M.bottom - 30} width={barW} height={30} fill={fill} />
                <text
                  x={cx}
                  y={H - M.bottom + 16}
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="10"
                  fill="#9099a6"
                  textAnchor="middle"
                >
                  {d.year}
                </text>
                <text
                  x={cx}
                  y={H - M.bottom - 12}
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="9"
                  fill="#9099a6"
                  textAnchor="middle"
                >
                  n/a
                </text>
              </g>
            );
          }
          const h = ((d.value - min) / span) * innerH;
          const y = H - M.bottom - h;
          return (
            <g key={`bar-${i}`}>
              <rect x={x} y={y} width={barW} height={h} fill={fill} />
              <text
                x={cx}
                y={H - M.bottom + 16}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill={isLast ? "#0a0a0a" : "#5f6672"}
                fontWeight={isLast ? "600" : "400"}
                textAnchor="middle"
              >
                {d.year}
              </text>
              <text
                x={cx}
                y={y - 6}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill="#0a0a0a"
                fontWeight={isLast ? "600" : "400"}
                textAnchor="middle"
              >
                {fmt.format(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
      {(caption || source) && (
        <figcaption>
          {caption}
          {source && (
            <>
              {caption ? " " : ""}
              <span style={{ color: "#5f6672" }}>Source : {source}.</span>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
