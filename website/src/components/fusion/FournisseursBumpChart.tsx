"use client";
/**
 * Le classement des plus gros fournisseurs — bump chart.
 * y = rang par cumul de plafonds notifiés depuis la première année,
 * x = années. Une ligne par fournisseur du top final ; couleur = famille
 * de catégorie dominante. Un fournisseur encore hors classement une année
 * donnée est dessiné sous la dernière ligne, en pointillé estompé.
 * Survol = nom, catégorie, cumul et rang cette année-là ; clic = fiche
 * fournisseur (navigation douce → drawer) quand le SIREN est connu.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/localeContext";
import type { FournisseurRankRow, FournisseursRankingData } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { ChartTip, useChartTip } from "./ChartTip";

const GROUP_COLORS: Record<FournisseurRankRow["catGroup"], string> = {
  proprete: "#0a0a0a",
  btp: "#2a3680",
  energie: "#8c5e2a",
  mobilier: "#c12323",
  it: "#4A7C59",
  autres: "#8a8577",
};

function fmtM(v: number, locale: string): string {
  const loc = locale === "en" ? "en-GB" : "fr-FR";
  if (v >= 1e9) return `${(v / 1e9).toLocaleString(loc, { maximumFractionDigits: 2 })} Md€`;
  return `${Math.round(v / 1e6).toLocaleString(loc)} M€`;
}

function shortName(n: string, max = 22): string {
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

const W = 1200;
const PAD_L = 70;
const PAD_R = 300;
const PAD_T = 34;
const SLOT = 40;
const PAD_B = 56;

export default function FournisseursBumpChart({
  data,
  ficheBase,
}: {
  data: FournisseursRankingData;
  /** e.g. /fr/city/paris/marches — fiche = `${ficheBase}/fournisseur/${siren}` */
  ficheBase: string;
}) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ row: FournisseurRankRow; year: number } | null>(null);
  const { pos: tipPos, moveTo: moveTip } = useChartTip(wrapRef);

  const { years, rows, topN } = data;
  const H = PAD_T + (topN + 1) * SLOT + PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const xFor = (y: number) =>
    PAD_L + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * plotW;
  const yFor = (rank: number) => PAD_T + (Math.min(rank, topN + 1) - 0.5) * SLOT;

  const groupsPresent = useMemo(() => {
    const set = new Set(rows.map((r) => r.catGroup));
    return (Object.keys(GROUP_COLORS) as FournisseurRankRow["catGroup"][]).filter((g) => set.has(g));
  }, [rows]);

  const onMove = (e: React.MouseEvent, row: FournisseurRankRow) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let best = row.points[row.points.length - 1];
    let bd = Infinity;
    for (const p of row.points) {
      const d = Math.abs(xFor(p.year) - relX);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    setHover({ row, year: best.year });
    moveTip(e);
  };
  const go = (row: FournisseurRankRow) => {
    if (row.siren) router.push(`${ficheBase}/fournisseur/${row.siren}`, { scroll: false });
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontFamily: "var(--f-mono)",
          fontSize: 11,
          color: "var(--muted)",
          padding: "2px 0 10px",
        }}
      >
        {groupsPresent.map((g) => (
          <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, background: GROUP_COLORS[g] }} />
            {t(`fx.mp.rank.cat.${g}`)}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={fill(t("fx.mp.rank.aria"), { n: rows.length, from: years[0], to: years[years.length - 1] })}
        style={{ width: "100%", display: "block" }}
        onMouseLeave={() => setHover(null)}
      >
        {/* years axis */}
        {years.map((y) => (
          <g key={y}>
            <line
              x1={xFor(y)}
              x2={xFor(y)}
              y1={PAD_T - 8}
              y2={H - PAD_B + 10}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            <text
              x={xFor(y)}
              y={H - PAD_B + 28}
              textAnchor="middle"
              style={{ font: "500 13px var(--f-mono)", fill: "var(--muted)" }}
            >
              {y}
            </text>
          </g>
        ))}
        {/* rank slots */}
        {Array.from({ length: topN }, (_, i) => (
          <text
            key={i}
            x={8}
            y={yFor(i + 1) + 4}
            style={{ font: "500 12px var(--f-mono)", fill: "var(--muted-2)" }}
          >
            {i + 1}
          </text>
        ))}
        <text
          x={8}
          y={yFor(topN + 1) + 4}
          style={{ font: "500 10px var(--f-mono)", fill: "var(--muted-2)" }}
        >
          {t("fx.mp.rank.out")}
        </text>

        {rows.map((row) => {
          const color = GROUP_COLORS[row.catGroup];
          const isHover = hover?.row === row;
          const dimmed = hover && !isHover;
          const pts = row.points.map((p) => ({
            x: xFor(p.year),
            y: yFor(p.rank),
            out: p.rank > topN,
            p,
          }));
          const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g
              key={row.siren ?? row.name}
              opacity={dimmed ? 0.14 : 1}
              style={{ cursor: row.siren ? "pointer" : "default", transition: "opacity .12s" }}
              onMouseMove={(e) => onMove(e, row)}
              onClick={() => go(row)}
            >
              <path d={path} fill="none" stroke={color} strokeWidth={isHover ? 4 : 2.4} strokeLinejoin="round" />
              {pts.map((pt) => (
                <circle
                  key={pt.p.year}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHover ? 5 : 3.4}
                  fill={pt.out ? "var(--bg)" : color}
                  stroke={color}
                  strokeWidth={pt.out ? 1.5 : 0}
                />
              ))}
              {/* invisible fat hit area */}
              <path d={path} fill="none" stroke="transparent" strokeWidth={18} />
              <text
                x={last.x + 12}
                y={last.y - 1.5}
                style={{
                  font: `${isHover ? 700 : 600} 13.5px var(--f-ui)`,
                  fill: "var(--ink)",
                }}
              >
                {shortName(row.name)}
              </text>
              <text
                x={last.x + 12}
                y={last.y + 12.5}
                style={{ font: "500 11.5px var(--f-mono)", fill: "var(--muted)" }}
              >
                {fmtM(row.totalAmount, locale)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <ChartTip
          x={tipPos.x}
          y={tipPos.y}
          containerWidth={wrapRef.current?.clientWidth ?? 300}
          width={250}
          clampWidth={260}
          offsetX={-120}
          offsetY={16}
          padding="9px 11px"
        >
          <div style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>
            {hover.row.name}
          </div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, marginTop: 3, opacity: 0.8 }}>
            {hover.row.categorie}
          </div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, marginTop: 4 }}>
            {(() => {
              const p = hover.row.points.find((pt) => pt.year === hover.year);
              if (!p) return null;
              return fill(t("fx.mp.rank.tip"), {
                year: hover.year,
                cumul: fmtM(p.cumul, locale),
                rank: p.rank,
              });
            })()}
          </div>
          {hover.row.siren && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, marginTop: 4, opacity: 0.7 }}>
              {t("fx.mp.rank.tip_click")}
            </div>
          )}
        </ChartTip>
      )}
    </div>
  );
}
