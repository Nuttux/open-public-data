"use client";

import { useState } from "react";

import {
  MARSEILLE_ARRONDISSEMENT_PATHS,
  MARSEILLE_VIEWBOX,
  projectMarseille,
} from "./marseille-arrondissements";
import { useLocale } from "@/lib/localeContext";
import { CHOROPLETH_PALETTE as PALETTE } from "./choropleth-palette";

const fmtEur = (n: number, locStr: string) => {
  const sep = locStr === "en-GB" ? "." : ",";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", sep)} Md €`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", sep)} M €`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString(locStr)} k €`;
  return `${Math.round(n).toLocaleString(locStr)} €`;
};

type Bucket = { arr: number; amount: number; count: number };

export type GeoPoint = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  amount: number;
  chapitre: string;
  arr: number;
};

type Props = {
  /** Per-arrondissement aggregates used for the choropleth fill. */
  items: Bucket[];
  /** Optional list of project markers (lat/lon already in WGS84). */
  geoPoints?: GeoPoint[];
  /** Optional click handler on an arrondissement tile. */
  onTileClick?: (arr: number) => void;
};

const sufFr = (n: number) => (n === 1 ? "er" : "ᵉ");

export default function MarseilleChoropleth({ items, geoPoints = [], onTileClick }: Props) {
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const [hover, setHover] = useState<{
    label: string;
    sublabel: string;
    detail?: string;
    x: number;
    y: number;
  } | null>(null);

  // Map arr → bucket
  const byArr = new Map<number, Bucket>();
  for (const b of items) byArr.set(b.arr, b);

  // Palette buckets: quintiles of amount across the 16 arrondissements that
  // actually have data (otherwise the lightest band gets too many arrs).
  const amounts = items.map((b) => b.amount).filter((a) => a > 0).sort((a, b) => a - b);
  const breakpoints = amounts.length === 0
    ? []
    : [
        amounts[Math.floor(amounts.length * 0.2)] ?? 0,
        amounts[Math.floor(amounts.length * 0.4)] ?? 0,
        amounts[Math.floor(amounts.length * 0.6)] ?? 0,
        amounts[Math.floor(amounts.length * 0.8)] ?? 0,
      ];

  function colorFor(amount: number): string {
    if (amount <= 0) return "#f3efe7";
    for (let i = 0; i < breakpoints.length; i++) {
      if (amount <= breakpoints[i]) return PALETTE[i];
    }
    return PALETTE[PALETTE.length - 1];
  }

  // Marker radius scaling — sqrt to keep small projects visible.
  const maxMarker = Math.max(0, ...geoPoints.map((p) => p.amount));
  const radiusFor = (amount: number) => {
    if (maxMarker <= 0) return 3;
    const r = Math.sqrt(amount / maxMarker) * 8;
    return Math.max(2.5, Math.min(9, r));
  };

  return (
    <div className="fx-choropleth" style={{ position: "relative" }}>
      <svg
        viewBox={MARSEILLE_VIEWBOX}
        role="img"
        aria-label="Carte des investissements par arrondissement de Marseille"
        style={{ width: "100%", height: "auto", maxHeight: 540, display: "block" }}
      >
        {/* Arrondissement tiles */}
        {MARSEILLE_ARRONDISSEMENT_PATHS.map(({ arr, paths }) => {
          const b = byArr.get(arr);
          const amount = b?.amount ?? 0;
          const count = b?.count ?? 0;
          const fill = colorFor(amount);
          return (
            <g
              key={arr}
              className={`fx-choro-tile${onTileClick ? " fx-choro-clickable" : ""}`}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({
                  label: `${arr}${sufFr(arr)} arrondissement`,
                  sublabel:
                    amount > 0
                      ? `${fmtEur(amount, locStr)} · ${count} projet${count > 1 ? "s" : ""}`
                      : (locale === "en" ? "no project this year" : "aucun projet cette année"),
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover((h) => (h ? { ...h, x: e.clientX - rect.left, y: e.clientY - rect.top } : h));
              }}
              onMouseLeave={() => setHover(null)}
              onClick={onTileClick ? () => onTileClick(arr) : undefined}
              style={{ cursor: onTileClick ? "pointer" : "default" }}
            >
              {paths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={fill}
                  stroke="#fafaf7"
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}

        {/* Project markers (drawn on top of tiles) */}
        {geoPoints.map((p) => {
          const { x, y } = projectMarseille(p.lon, p.lat);
          const r = radiusFor(p.amount);
          return (
            <g
              key={p.id}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({
                  label: p.name,
                  sublabel: `${p.arr}${sufFr(p.arr)} ${locale === "en" ? "district" : "arrondissement"} · ${p.chapitre}`,
                  detail: fmtEur(p.amount, locStr),
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            >
              <circle cx={x} cy={y} r={r} fill="#2c5fd9" fillOpacity={0.78} stroke="#fafaf7" strokeWidth={1.2} />
            </g>
          );
        })}

        {/* Arrondissement labels — only on tiles with > 0 amount, to avoid clutter */}
        {MARSEILLE_ARRONDISSEMENT_PATHS.map(({ arr, paths }) => {
          const b = byArr.get(arr);
          if (!b || b.amount <= 0) return null;
          // Approximate centroid: average of all path commands (rough but fine for labels)
          const m = paths[0].match(/[ML](-?\d+\.?\d*),(-?\d+\.?\d*)/g);
          if (!m || m.length === 0) return null;
          let sx = 0, sy = 0, n = 0;
          for (const cmd of m) {
            const parts = cmd.slice(1).split(",");
            sx += parseFloat(parts[0]);
            sy += parseFloat(parts[1]);
            n += 1;
          }
          const cx = sx / n;
          const cy = sy / n;
          return (
            <text
              key={`label-${arr}`}
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="JetBrains Mono, monospace"
              fontSize={6.5}
              fill="#2b1a08"
              pointerEvents="none"
              style={{ userSelect: "none" }}
            >
              {arr}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.x + 12,
            top: hover.y + 12,
            background: "#0a0a0a",
            color: "#fafaf7",
            padding: "8px 12px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            lineHeight: 1.4,
            borderRadius: 2,
            pointerEvents: "none",
            maxWidth: 260,
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{hover.label}</div>
          <div style={{ opacity: 0.75 }}>{hover.sublabel}</div>
          {hover.detail && (
            <div style={{ marginTop: 4, color: "#f0c060" }}>{hover.detail}</div>
          )}
        </div>
      )}

      {/* Mini legend */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#5f6672",
        }}
      >
        <span>{locale === "en" ? "less" : "moins"}</span>
        {PALETTE.map((c, i) => (
          <span key={i} style={{ width: 22, height: 12, background: c, border: "1px solid rgba(0,0,0,0.08)" }} />
        ))}
        <span>{locale === "en" ? "more" : "plus"}</span>
        {geoPoints.length > 0 && (
          <span style={{ marginLeft: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#2c5fd9",
                border: "1px solid #fafaf7",
                display: "inline-block",
              }}
            />
            {geoPoints.length}{" "}
            {locale === "en"
              ? `project${geoPoints.length > 1 ? "s" : ""} located`
              : `projet${geoPoints.length > 1 ? "s" : ""} localisé${geoPoints.length > 1 ? "s" : ""}`}
          </span>
        )}
      </div>
    </div>
  );
}
